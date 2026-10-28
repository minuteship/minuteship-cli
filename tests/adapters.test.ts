import { afterEach, describe, expect, it, vi } from 'vitest';
import { provisionCreem } from '../src/adapters/creem.js';
import { provisionStripe } from '../src/adapters/stripe.js';
import { applyDerivedDefaults } from '../src/options/schema.js';
import { activePlanPrices, planOptionKey } from '../src/plans.js';

interface Call {
  method: string;
  url: string;
  body?: string;
}

type Handler = (call: Call) => { status?: number; body: unknown };

function installFetch(handler: Handler): Call[] {
  const calls: Call[] = [];

  vi.stubGlobal(
    'fetch',
    async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      const call: Call = {
        method: init?.method ?? 'GET',
        url,
        ...(typeof init?.body === 'string' ? { body: init.body } : {}),
      };
      calls.push(call);
      const response = handler(call);
      return new Response(JSON.stringify(response.body), {
        status: response.status ?? 200,
        headers: { 'content-type': 'application/json' },
      });
    }
  );

  return calls;
}

function options(overrides: Record<string, unknown> = {}) {
  return applyDerivedDefaults(
    {
      projectName: 'acme',
      siteName: 'Acme',
      targetDir: '/tmp/acme',
      paymentProvider: 'stripe',
      stripeSecretKey: 'sk_test_123',
      baseUrl: 'https://app.example.com',
      ...overrides,
    },
    {}
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('plan catalog', () => {
  it('maps every plan to the provider option key', () => {
    const plans = activePlanPrices(options());
    expect(plans.map((plan) => plan.id)).toEqual([
      'proMonthly',
      'proYearly',
      'lifetime',
    ]);
    expect(planOptionKey('stripe', plans[0]!)).toBe('stripePriceProMonthly');
    expect(planOptionKey('creem', plans[1]!)).toBe('creemProductProYearly');
    expect(planOptionKey('waffo', plans[2]!)).toBe('waffoProductLifetime');
  });
});

describe('provisionStripe', () => {
  it('creates products, prices, and a webhook endpoint', async () => {
    let productCount = 0;
    let priceCount = 0;

    const calls = installFetch((call) => {
      const { method, url } = call;

      if (url.endsWith('/v1/account')) return { body: { id: 'acct_1' } };
      if (url.includes('/v1/products?')) {
        return { body: { data: [], has_more: false } };
      }
      if (url.endsWith('/v1/products')) {
        productCount += 1;
        return { body: { id: `prod_${productCount}` } };
      }
      if (url.includes('/v1/prices?')) {
        return { body: { data: [], has_more: false } };
      }
      if (url.endsWith('/v1/prices')) {
        priceCount += 1;
        return { body: { id: `price_${priceCount}` } };
      }
      if (url.includes('/v1/webhook_endpoints?')) {
        return { body: { data: [], has_more: false } };
      }
      if (url.endsWith('/v1/webhook_endpoints')) {
        return { body: { id: 'we_1', secret: 'whsec_1' } };
      }

      throw new Error(`unexpected ${method} ${url}`);
    });

    const result = await provisionStripe({
      secretKey: 'sk_test_123',
      projectName: 'acme',
      baseUrl: 'https://app.example.com',
      options: options(),
    });

    expect(result.status).toBe('created');
    expect(result.values.stripePriceProMonthly).toBe('price_1');
    // Three plans: pro monthly, pro yearly, lifetime.
    expect(result.values.stripePriceLifetime).toBe('price_3');
    expect(result.values.stripeWebhookSecret).toBe('whsec_1');
    expect(result.manualInstructions).toEqual([]);

    const productCall = calls.find(
      (call) => call.method === 'POST' && call.url.endsWith('/v1/products')
    );
    expect(productCall?.body).toContain(
      'metadata%5Bminuteship_key%5D=acme%3Apro-monthly'
    );

    const webhookCall = calls.find(
      (call) => call.method === 'POST' && call.url.endsWith('/v1/webhook_endpoints')
    );
    expect(webhookCall?.body).toContain(
      'url=https%3A%2F%2Fapp.example.com%2Fapi%2Fwebhooks%2Fstripe'
    );
    expect(webhookCall?.body).toContain('invoice.paid');
  });

  it('reuses existing resources without creating duplicates', async () => {
    const calls = installFetch((call) => {
      const { url } = call;

      if (url.endsWith('/v1/account')) return { body: { id: 'acct_1' } };
      if (url.includes('/v1/products?')) {
        return {
          body: {
            data: [
              {
                id: 'prod_existing',
                metadata: { minuteship_key: 'acme:pro-monthly' },
              },
            ],
            has_more: false,
          },
        };
      }
      if (url.includes('/v1/prices?')) {
        return {
          body: {
            data: [
              {
                id: 'price_existing',
                product: 'prod_existing',
                unit_amount: 990,
                currency: 'usd',
                active: true,
                recurring: { interval: 'month' },
              },
            ],
            has_more: false,
          },
        };
      }
      if (url.includes('/v1/webhook_endpoints?')) {
        return {
          body: {
            data: [
              {
                id: 'we_existing',
                url: 'https://app.example.com/api/webhooks/stripe',
              },
            ],
            has_more: false,
          },
        };
      }

      throw new Error(`unexpected ${call.method} ${url}`);
    });

    const result = await provisionStripe({
      secretKey: 'sk_test_123',
      projectName: 'acme',
      baseUrl: 'https://app.example.com',
      // Only the monthly plan is left to resolve; the others are explicit.
      options: options({
        stripePriceProYearly: 'price_yearly',
        stripePriceLifetime: 'price_lifetime',
      }),
    });

    // The endpoint exists but Stripe never re-reveals its signing secret.
    expect(result.status).toBe('manual');
    expect(result.values.stripePriceProMonthly).toBe('price_existing');
    expect(result.values.stripeWebhookSecret).toBeUndefined();
    expect(result.warnings.join('\n')).toContain('STRIPE_WEBHOOK_SECRET');
    expect(result.manualInstructions.join('\n')).toContain('already exists');

    expect(calls.some((call) => call.method === 'POST')).toBe(false);
  });

  it('respects price ids supplied by the operator', async () => {
    const calls = installFetch((call) => {
      if (call.url.endsWith('/v1/account')) return { body: { id: 'acct_1' } };
      if (call.url.includes('/v1/products?')) {
        return { body: { data: [], has_more: false } };
      }
      if (call.url.includes('/v1/prices?')) {
        return { body: { data: [], has_more: false } };
      }
      if (call.url.includes('/v1/webhook_endpoints?')) {
        return { body: { data: [], has_more: false } };
      }
      if (call.url.endsWith('/v1/webhook_endpoints')) {
        return { body: { id: 'we_1', secret: 'whsec_1' } };
      }
      return { body: { id: 'created' } };
    });

    const result = await provisionStripe({
      secretKey: 'sk_test_123',
      projectName: 'acme',
      baseUrl: 'https://app.example.com',
      options: options({
        stripePriceProMonthly: 'price_manual',
      }),
    });

    expect(result.values.stripePriceProMonthly).toBeUndefined();
    expect(
      calls.filter((call) => call.url.includes('/v1/products?'))
    ).toHaveLength(2);
  });

  it('reports an invalid key instead of throwing', async () => {
    installFetch(() => ({
      status: 401,
      body: { error: { message: 'Invalid API Key provided' } },
    }));

    const result = await provisionStripe({
      secretKey: 'sk_test_bad',
      projectName: 'acme',
      baseUrl: 'https://app.example.com',
      options: options(),
    });

    expect(result.status).toBe('failed');
    expect(result.error).toContain('Invalid API Key provided');
    expect(result.values).toEqual({});
  });
});

function creemOptions(overrides: Record<string, unknown> = {}) {
  return applyDerivedDefaults(
    {
      projectName: 'acme',
      siteName: 'Acme',
      targetDir: '/tmp/acme',
      paymentProvider: 'creem',
      creemApiKey: 'creem_test_key',
      creemDebug: true,
      baseUrl: 'https://app.example.com',
      ...overrides,
    },
    {}
  );
}

describe('provisionCreem', () => {
  it('creates products and a webhook in test mode', async () => {
    let productCount = 0;

    const calls = installFetch((call) => {
      const { method, url } = call;

      if (url.includes('/v1/products?page_size=1')) {
        return { body: { items: [], pagination: {} } };
      }
      if (url.includes('/v1/products?')) {
        return { body: { items: [], pagination: {} } };
      }
      if (method === 'POST' && url.endsWith('/v1/products')) {
        productCount += 1;
        return { body: { id: `prod_${productCount}` } };
      }
      if (url.includes('/v1/webhooks?')) {
        return { body: { items: [], pagination: {} } };
      }
      if (method === 'POST' && url.endsWith('/v1/webhooks')) {
        return { body: { id: 'wh_1', secret: 'whsec_1' } };
      }

      throw new Error(`unexpected ${method} ${url}`);
    });

    const result = await provisionCreem({
      apiKey: 'creem_test_key',
      projectName: 'acme',
      baseUrl: 'https://app.example.com',
      options: creemOptions(),
    });

    expect(result.status).toBe('created');
    expect(result.values.creemProductProMonthly).toBe('prod_1');
    expect(result.values.creemProductLifetime).toBe('prod_3');
    expect(result.values.creemWebhookSecret).toBe('whsec_1');

    expect(
      calls.every((call) => call.url.startsWith('https://test-api.creem.io/v1'))
    ).toBe(true);

    const productCall = calls.find(
      (call) => call.method === 'POST' && call.url.endsWith('/v1/products')
    );
    expect(JSON.parse(productCall?.body ?? '{}')).toMatchObject({
      price: 990,
      currency: 'USD',
      billing_type: 'recurring',
      billing_period: 'every-month',
    });

    const webhookCall = calls.find(
      (call) => call.method === 'POST' && call.url.endsWith('/v1/webhooks')
    );
    expect(JSON.parse(webhookCall?.body ?? '{}')).toMatchObject({
      url: 'https://app.example.com/api/webhooks/creem',
      delivery_mode: 'http',
    });
    expect(webhookCall?.body).toContain('subscription.paid');
  });

  it('reuses an existing webhook and fetches its secret', async () => {
    installFetch((call) => {
      const { method, url } = call;

      if (url.includes('/v1/products?page_size=1')) {
        return { body: { items: [], pagination: {} } };
      }
      if (url.includes('/v1/products?')) {
        return {
          body: {
            items: [
              {
                id: 'prod_existing',
                name: 'Pro (monthly)',
                price: 990,
                currency: 'USD',
                billing_type: 'recurring',
                status: 'active',
              },
            ],
            pagination: {},
          },
        };
      }
      if (url.includes('/v1/webhooks?')) {
        return {
          body: {
            items: [
              {
                id: 'wh_existing',
                url: 'https://app.example.com/api/webhooks/creem',
              },
            ],
            pagination: {},
          },
        };
      }
      if (url.endsWith('/v1/webhooks/wh_existing/secret')) {
        return { body: { secret: 'whsec_existing' } };
      }

      throw new Error(`unexpected ${method} ${url}`);
    });

    const result = await provisionCreem({
      apiKey: 'creem_test_key',
      projectName: 'acme',
      baseUrl: 'https://app.example.com',
      options: creemOptions({
        creemProductProYearly: 'prod_yearly',
        creemProductLifetime: 'prod_lifetime',
      }),
    });

    expect(result.status).toBe('reused');
    expect(result.values.creemProductProMonthly).toBe('prod_existing');
    expect(result.values.creemWebhookSecret).toBe('whsec_existing');
  });

  it('reports an invalid key instead of throwing', async () => {
    installFetch(() => ({
      status: 401,
      body: { message: 'Invalid API key' },
    }));

    const result = await provisionCreem({
      apiKey: 'creem_bad',
      projectName: 'acme',
      baseUrl: 'https://app.example.com',
      options: creemOptions(),
    });

    expect(result.status).toBe('failed');
    expect(result.error).toContain('Invalid API key');
  });
});
