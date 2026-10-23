import {
  activePlanPrices,
  planOptionKey,
  type PlanPriceDefinition,
} from '../plans.js';
import type { CreateOptions } from '../options/types.js';
import { httpErrorMessage, httpRequest, type HttpResponse } from './http.js';
import {
  provisionResult,
  type ProvisionResult,
  type ProvisionStatus,
} from './types.js';

const PRODUCTION_API = 'https://api.creem.io/v1';
const TEST_API = 'https://test-api.creem.io/v1';

/** Events the template's Creem webhook handler understands. */
const WEBHOOK_EVENTS = [
  'checkout.completed',
  'subscription.paid',
  'subscription.active',
  'subscription.update',
  'subscription.canceled',
  'subscription.scheduled_cancel',
  'subscription.expired',
  'subscription.past_due',
  'subscription.unpaid',
  'subscription.trialing',
  'subscription.paused',
  'refund.created',
  'refund.succeeded',
] as const;

interface CreemProduct {
  id?: string;
  name?: string;
  price?: number;
  currency?: string;
  billing_type?: string;
  billing_period?: string;
  status?: string;
}

interface CreemWebhook {
  id?: string;
  url?: string;
  secret?: string;
  status?: string;
}

interface CreemPage<T> {
  items?: T[];
  data?: T[];
  pagination?: { next_page?: number | null; total_pages?: number };
}

export interface CreemProvisionInput {
  apiKey: string;
  projectName: string;
  baseUrl: string;
  options: CreateOptions;
}

function baseUrl(options: CreateOptions): string {
  // Test mode is the safe default for a fresh project.
  return options.creemDebug === false ? PRODUCTION_API : TEST_API;
}

async function creemRequest(
  input: CreemProvisionInput,
  path: string,
  init: { method?: 'GET' | 'POST'; body?: string; idempotencyKey?: string } = {}
): Promise<HttpResponse> {
  return httpRequest(`${baseUrl(input.options)}${path}`, {
    method: init.method ?? 'GET',
    headers: {
      'x-api-key': input.apiKey,
      ...(init.body !== undefined
        ? { 'Content-Type': 'application/json' }
        : {}),
      ...(init.idempotencyKey
        ? { 'Idempotency-Key': init.idempotencyKey }
        : {}),
    },
    ...(init.body !== undefined ? { body: init.body } : {}),
  });
}

async function listAll<T>(
  input: CreemProvisionInput,
  path: string,
  maxPages = 10
): Promise<T[]> {
  const items: T[] = [];
  let page = 1;

  for (let index = 0; index < maxPages; index += 1) {
    const separator = path.includes('?') ? '&' : '?';
    const response = await creemRequest(
      input,
      `${path}${separator}page_number=${page}&page_size=100`
    );
    if (!response.ok) break;

    const body = response.json as CreemPage<T> | T[] | undefined;
    const data = Array.isArray(body) ? body : (body?.items ?? body?.data ?? []);
    items.push(...data);

    const next = Array.isArray(body) ? undefined : body?.pagination?.next_page;
    if (!next) break;
    page = next;
  }

  return items;
}

function productBody(plan: PlanPriceDefinition): string {
  const recurring = plan.interval !== undefined;
  return JSON.stringify({
    name: plan.name,
    description: plan.description,
    price: plan.amount,
    currency: plan.currency,
    billing_type: recurring ? 'recurring' : 'onetime',
    billing_period: recurring
      ? plan.interval === 'year'
        ? 'every-year'
        : 'every-month'
      : 'once',
  });
}

function productMatches(
  product: CreemProduct,
  plan: PlanPriceDefinition
): boolean {
  if (product.status === 'archived') return false;
  if (product.name !== plan.name) return false;
  if (product.price !== plan.amount) return false;
  if (product.currency?.toUpperCase() !== plan.currency.toUpperCase()) {
    return false;
  }
  return product.billing_type === (plan.interval ? 'recurring' : 'onetime');
}

async function ensureProduct(
  input: CreemProvisionInput,
  plan: PlanPriceDefinition,
  existing: CreemProduct[],
  warnings: string[]
): Promise<string | undefined> {
  const match = existing.find((product) => productMatches(product, plan));
  if (match?.id) return match.id;

  const response = await creemRequest(input, '/products', {
    method: 'POST',
    body: productBody(plan),
    // Creem returns the original product when the same key is retried.
    idempotencyKey: `minuteship-${input.projectName}-${plan.key}`,
  });

  if (!response.ok) {
    warnings.push(
      httpErrorMessage(response, `Could not create the Creem product ${plan.name}`)
    );
    return undefined;
  }

  return (response.json as CreemProduct | undefined)?.id;
}

function webhookBody(input: CreemProvisionInput): string {
  return JSON.stringify({
    url: `${input.baseUrl.replace(/\/$/, '')}/api/webhooks/creem`,
    name: `MinuteShip (${input.projectName})`,
    delivery_mode: 'http',
    events: WEBHOOK_EVENTS,
  });
}

async function ensureWebhook(
  input: CreemProvisionInput,
  warnings: string[],
  manualInstructions: string[]
): Promise<{ secret?: string; created: boolean }> {
  const url = `${input.baseUrl.replace(/\/$/, '')}/api/webhooks/creem`;
  const webhooks = await listAll<CreemWebhook>(input, '/webhooks');
  const existing = webhooks.find((webhook) => webhook.url === url);

  if (existing?.id) {
    // Listing never returns the secret, but a dedicated endpoint does.
    const secretResponse = await creemRequest(
      input,
      `/webhooks/${encodeURIComponent(existing.id)}/secret`
    );
    if (secretResponse.ok) {
      const secret = (secretResponse.json as { secret?: string } | undefined)
        ?.secret;
      if (secret) return { secret, created: false };
    }
    manualInstructions.push(
      `Copy the signing secret of the existing Creem webhook ${url} into CREEM_WEBHOOK_SECRET.`
    );
    return { created: false };
  }

  const response = await creemRequest(input, '/webhooks', {
    method: 'POST',
    body: webhookBody(input),
  });

  if (!response.ok) {
    warnings.push(
      httpErrorMessage(response, 'Could not create the Creem webhook endpoint')
    );
    manualInstructions.push(
      `Create a Creem webhook for ${url} with events: ${WEBHOOK_EVENTS.join(', ')}, then set CREEM_WEBHOOK_SECRET.`
    );
    return { created: false };
  }

  const webhook = response.json as CreemWebhook | undefined;
  return { secret: webhook?.secret, created: true };
}

function overallStatus(input: {
  satisfied: number;
  failed: boolean;
  created: boolean;
  expected: number;
}): ProvisionStatus {
  if (input.failed && input.satisfied === 0) return 'failed';
  if (input.satisfied < input.expected) return 'manual';
  return input.created ? 'created' : 'reused';
}

/**
 * Create (or reuse) Creem products and the webhook endpoint. The API has no
 * metadata field, so products are matched by name, amount, and billing type.
 */
export async function provisionCreem(
  input: CreemProvisionInput
): Promise<ProvisionResult> {
  const warnings: string[] = [];
  const manualInstructions: string[] = [];
  const values: Record<string, string> = {};
  let created = false;
  let failed = false;
  let satisfied = 0;

  const productsResponse = await creemRequest(input, '/products?page_size=1');
  if (!productsResponse.ok) {
    return provisionResult('failed', {
      error: httpErrorMessage(productsResponse, 'Creem rejected the API key'),
      manualInstructions: [
        'Check CREEM_API_KEY (and CREEM_DEBUG for test vs production), or create the products and webhook in the Creem dashboard.',
      ],
    });
  }

  const existingProducts = await listAll<CreemProduct>(input, '/products');
  const plans = activePlanPrices(input.options);

  for (const plan of plans) {
    const optionKey = planOptionKey('creem', plan);
    if (
      typeof input.options[optionKey] === 'string' &&
      input.options[optionKey] !== ''
    ) {
      satisfied += 1;
      continue;
    }

    const productId = await ensureProduct(
      input,
      plan,
      existingProducts,
      warnings
    );
    if (!productId) {
      failed = true;
      continue;
    }

    values[optionKey] = productId;
    satisfied += 1;
  }

  const isPublicBaseUrl = !/^https?:\/\/localhost(?::\d+)?\/?$/i.test(
    input.baseUrl
  );

  if (isPublicBaseUrl) {
    const webhook = await ensureWebhook(input, warnings, manualInstructions);
    if (webhook.created) created = true;
    if (webhook.secret) {
      values.creemWebhookSecret = webhook.secret;
      satisfied += 1;
    } else if (
      typeof input.options.creemWebhookSecret === 'string' &&
      input.options.creemWebhookSecret !== ''
    ) {
      satisfied += 1;
    }
  } else {
    manualInstructions.push(
      `Create a Creem webhook for <your-domain>/api/webhooks/creem with events: ${WEBHOOK_EVENTS.join(', ')}, then set CREEM_WEBHOOK_SECRET.`
    );
  }

  const expected = plans.length + (isPublicBaseUrl ? 1 : 0);
  return provisionResult(
    overallStatus({ satisfied, failed, created, expected }),
    {
      values,
      warnings,
      manualInstructions,
      ...(failed
        ? { error: 'Some Creem resources could not be created.' }
        : {}),
    }
  );
}
