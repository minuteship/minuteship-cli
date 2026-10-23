import {
  activePlanPrices,
  planOptionKey,
  type PlanPriceDefinition,
} from '../plans.js';
import type { CreateOptions } from '../options/types.js';
import {
  formBody,
  httpErrorMessage,
  httpRequest,
  type HttpResponse,
} from './http.js';
import {
  provisionResult,
  type ProvisionResult,
  type ProvisionStatus,
} from './types.js';

const API = 'https://api.stripe.com/v1';

/**
 * Events the template's webhook handler understands. Sending fewer events
 * than this silently breaks renewals; sending more only wastes deliveries.
 */
const WEBHOOK_EVENTS = [
  'checkout.session.completed',
  'customer.subscription.created',
  'customer.subscription.updated',
  'customer.subscription.deleted',
  'invoice.paid',
  'charge.refunded',
] as const;

interface StripeProduct {
  id?: string;
  name?: string;
  metadata?: Record<string, string>;
}

interface StripePrice {
  id?: string;
  product?: string;
  unit_amount?: number | null;
  currency?: string;
  active?: boolean;
  recurring?: { interval?: string } | null;
  metadata?: Record<string, string>;
}

interface StripeWebhookEndpoint {
  id?: string;
  url?: string;
  secret?: string;
  status?: string;
}

interface StripeList<T> {
  data?: T[];
  has_more?: boolean;
}

export interface StripeProvisionInput {
  secretKey: string;
  projectName: string;
  baseUrl: string;
  options: CreateOptions;
}

function authHeaders(secretKey: string): Record<string, string> {
  return {
    Authorization: `Bearer ${secretKey}`,
    'Content-Type': 'application/x-www-form-urlencoded',
  };
}

async function stripeGet(
  secretKey: string,
  path: string
): Promise<HttpResponse> {
  return httpRequest(`${API}${path}`, {
    headers: { Authorization: `Bearer ${secretKey}` },
  });
}

async function stripePost(
  secretKey: string,
  path: string,
  body: string
): Promise<HttpResponse> {
  return httpRequest(`${API}${path}`, {
    method: 'POST',
    headers: authHeaders(secretKey),
    body,
  });
}

/** Walk a Stripe list endpoint until `has_more` is false (bounded). */
async function listAll<T>(
  secretKey: string,
  path: string,
  maxPages = 10
): Promise<T[]> {
  const items: T[] = [];
  let startingAfter: string | undefined;

  for (let page = 0; page < maxPages; page += 1) {
    const separator = path.includes('?') ? '&' : '?';
    const query = startingAfter
      ? `${separator}starting_after=${encodeURIComponent(startingAfter)}`
      : '';
    const response = await stripeGet(secretKey, `${path}${query}`);
    if (!response.ok) break;

    const list = response.json as StripeList<T> | undefined;
    const data = list?.data ?? [];
    items.push(...data);

    const last = data.at(-1) as { id?: string } | undefined;
    if (!list?.has_more || !last?.id) break;
    startingAfter = last.id;
  }

  return items;
}

function marker(projectName: string, key: string): string {
  return `${projectName}:${key}`;
}

async function ensureProduct(
  secretKey: string,
  projectName: string,
  plan: PlanPriceDefinition,
  warnings: string[]
): Promise<string | undefined> {
  const key = marker(projectName, plan.key);
  const products = await listAll<StripeProduct>(
    secretKey,
    '/products?active=true&limit=100'
  );
  const existing = products.find(
    (product) => product.metadata?.minuteship_key === key
  );
  if (existing?.id) return existing.id;

  const response = await stripePost(
    secretKey,
    '/products',
    formBody({
      name: plan.name,
      description: plan.description,
      'metadata[minuteship_key]': key,
      'metadata[minuteship_project]': projectName,
    })
  );

  if (!response.ok) {
    warnings.push(
      httpErrorMessage(response, `Could not create the Stripe product ${plan.name}`)
    );
    return undefined;
  }

  return (response.json as StripeProduct | undefined)?.id;
}

function priceMatches(
  price: StripePrice,
  productId: string,
  plan: PlanPriceDefinition
): boolean {
  if (price.product !== productId) return false;
  if (price.active === false) return false;
  if (price.unit_amount !== plan.amount) return false;
  if (price.currency?.toLowerCase() !== plan.currency.toLowerCase()) {
    return false;
  }
  return (price.recurring?.interval ?? undefined) === plan.interval;
}

async function ensurePrice(
  secretKey: string,
  projectName: string,
  plan: PlanPriceDefinition,
  productId: string,
  warnings: string[]
): Promise<string | undefined> {
  const prices = await listAll<StripePrice>(
    secretKey,
    `/prices?product=${encodeURIComponent(productId)}&active=true&limit=100`
  );
  const existing = prices.find((price) => priceMatches(price, productId, plan));
  if (existing?.id) return existing.id;

  const body: Record<string, string | number | undefined> = {
    product: productId,
    currency: plan.currency.toLowerCase(),
    unit_amount: plan.amount,
    'metadata[minuteship_key]': marker(projectName, plan.key),
    'metadata[minuteship_project]': projectName,
  };
  if (plan.interval) body['recurring[interval]'] = plan.interval;

  const response = await stripePost(secretKey, '/prices', formBody(body));
  if (!response.ok) {
    warnings.push(
      httpErrorMessage(response, `Could not create the Stripe price ${plan.name}`)
    );
    return undefined;
  }

  return (response.json as StripePrice | undefined)?.id;
}

function webhookBody(baseUrl: string): string {
  const params = new URLSearchParams();
  params.set('url', `${baseUrl.replace(/\/$/, '')}/api/webhooks/stripe`);
  params.set('description', 'MinuteShip payment webhook');
  for (const [index, event] of WEBHOOK_EVENTS.entries()) {
    params.set(`enabled_events[${index}]`, event);
  }
  return params.toString();
}

async function ensureWebhook(
  secretKey: string,
  baseUrl: string,
  warnings: string[],
  manualInstructions: string[]
): Promise<{ id?: string; secret?: string; created: boolean }> {
  const url = `${baseUrl.replace(/\/$/, '')}/api/webhooks/stripe`;
  const endpoints = await listAll<StripeWebhookEndpoint>(
    secretKey,
    '/webhook_endpoints?limit=100'
  );
  const existing = endpoints.find((endpoint) => endpoint.url === url);

  if (existing?.id) {
    // Stripe only returns the signing secret at creation time.
    manualInstructions.push(
      `Stripe webhook ${url} already exists. Copy its signing secret from the Stripe dashboard into STRIPE_WEBHOOK_SECRET (or rotate the endpoint there).`
    );
    return { id: existing.id, created: false };
  }

  const response = await stripePost(
    secretKey,
    '/webhook_endpoints',
    webhookBody(baseUrl)
  );

  if (!response.ok) {
    warnings.push(
      httpErrorMessage(response, 'Could not create the Stripe webhook endpoint')
    );
    manualInstructions.push(
      `Create a Stripe webhook for ${url} with events: ${WEBHOOK_EVENTS.join(', ')}, then set STRIPE_WEBHOOK_SECRET.`
    );
    return { created: false };
  }

  const endpoint = response.json as StripeWebhookEndpoint | undefined;
  return { id: endpoint?.id, secret: endpoint?.secret, created: true };
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
 * Create (or reuse) the products, prices, and webhook endpoint the template
 * expects, using `metadata.minuteship_key` as the idempotency marker.
 */
export async function provisionStripe(
  input: StripeProvisionInput
): Promise<ProvisionResult> {
  const { secretKey, projectName, baseUrl, options } = input;
  const warnings: string[] = [];
  const manualInstructions: string[] = [];
  const values: Record<string, string> = {};
  let created = false;
  let failed = false;
  let satisfied = 0;

  const account = await stripeGet(secretKey, '/account');
  if (!account.ok) {
    return provisionResult('failed', {
      error: httpErrorMessage(account, 'Stripe rejected the secret key'),
      manualInstructions: [
        'Check STRIPE_SECRET_KEY, or create the products, prices, and webhook manually in the Stripe dashboard.',
      ],
    });
  }

  const plans = activePlanPrices(options);
  for (const plan of plans) {
    const optionKey = planOptionKey('stripe', plan);
    // An explicit id always wins: the operator may have created it elsewhere.
    if (typeof options[optionKey] === 'string' && options[optionKey] !== '') {
      satisfied += 1;
      continue;
    }

    const productId = await ensureProduct(
      secretKey,
      projectName,
      plan,
      warnings
    );
    if (!productId) {
      failed = true;
      continue;
    }

    const priceId = await ensurePrice(
      secretKey,
      projectName,
      plan,
      productId,
      warnings
    );
    if (!priceId) {
      failed = true;
      continue;
    }

    values[optionKey] = priceId;
    satisfied += 1;
  }

  const isPublicBaseUrl = !/^https?:\/\/localhost(?::\d+)?\/?$/i.test(baseUrl);
  if (isPublicBaseUrl) {
    const webhook = await ensureWebhook(
      secretKey,
      baseUrl,
      warnings,
      manualInstructions
    );
    if (webhook.created) created = true;
    if (webhook.secret) {
      values.stripeWebhookSecret = webhook.secret;
      satisfied += 1;
    } else if (
      typeof options.stripeWebhookSecret === 'string' &&
      options.stripeWebhookSecret !== ''
    ) {
      satisfied += 1;
    } else {
      warnings.push(
        'STRIPE_WEBHOOK_SECRET was not set: Stripe only shows it once when the endpoint is created.'
      );
    }
  } else {
    manualInstructions.push(
      `Create a Stripe webhook for <your-domain>/api/webhooks/stripe with events: ${WEBHOOK_EVENTS.join(', ')}, then set STRIPE_WEBHOOK_SECRET.`
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
        ? { error: 'Some Stripe resources could not be created.' }
        : {}),
    }
  );
}
