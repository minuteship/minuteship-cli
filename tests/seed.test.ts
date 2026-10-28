import { describe, expect, it } from 'vitest';
import {
  buildPaymentPriceSql,
  collectPriceRows,
} from '../src/commands/seed.js';

describe('collectPriceRows', () => {
  it('maps Stripe price env vars to runtime catalog keys', () => {
    const rows = collectPriceRows('stripe', {
      VITE_STRIPE_PRICE_PRO_MONTHLY: 'price_monthly',
      VITE_STRIPE_PRICE_PRO_YEARLY: 'price_yearly',
      VITE_STRIPE_PRICE_LIFETIME: 'price_lifetime',
      VITE_PAYMENT_PROVIDER: 'stripe',
      STRIPE_SECRET_KEY: 'sk_live_should_not_leak',
    });

    expect(rows).toEqual([
      { planKey: 'lifetime', priceId: 'price_lifetime' },
      { planKey: 'pro-monthly', priceId: 'price_monthly' },
      { planKey: 'pro-yearly', priceId: 'price_yearly' },
    ]);
  });

  it('uses the product prefix for Creem and Waffo', () => {
    expect(
      collectPriceRows('creem', {
        VITE_CREEM_PRODUCT_PRO_MONTHLY: 'prod_creem_monthly',
      })
    ).toEqual([{ planKey: 'pro-monthly', priceId: 'prod_creem_monthly' }]);

    expect(
      collectPriceRows('waffo', {
        VITE_WAFFO_PRODUCT_PRO_YEARLY: 'waffo_yearly',
      })
    ).toEqual([{ planKey: 'pro-yearly', priceId: 'waffo_yearly' }]);
  });

  it('ignores blank ids, unknown suffixes, and other providers', () => {
    expect(
      collectPriceRows('stripe', {
        VITE_STRIPE_PRICE_PRO_MONTHLY: '   ',
        VITE_STRIPE_PRICE_UNKNOWN: 'price_unknown',
        VITE_CREEM_PRODUCT_PRO_MONTHLY: 'prod_creem_monthly',
      })
    ).toEqual([]);
  });

  it('returns nothing when payment is disabled or the provider is unknown', () => {
    expect(
      collectPriceRows('', { VITE_STRIPE_PRICE_PRO_MONTHLY: 'price_monthly' })
    ).toEqual([]);
    expect(
      collectPriceRows('paypal', {
        VITE_STRIPE_PRICE_PRO_MONTHLY: 'price_monthly',
      })
    ).toEqual([]);
  });
});

describe('buildPaymentPriceSql', () => {
  it('writes an idempotent upsert keyed by provider and plan key', () => {
    const sql = buildPaymentPriceSql(
      'stripe',
      [
        { planKey: 'lifetime', priceId: 'price_lifetime' },
        { planKey: 'pro-monthly', priceId: 'price_monthly' },
      ],
      1_700_000_000_000
    );

    expect(sql).toContain(
      'INSERT INTO payment_price (provider, plan_key, price_id, updated_at) VALUES'
    );
    expect(sql).toContain(
      "  ('stripe', 'lifetime', 'price_lifetime', 1700000000000)"
    );
    expect(sql).toContain(
      "  ('stripe', 'pro-monthly', 'price_monthly', 1700000000000)"
    );
    expect(sql).toContain(
      'ON CONFLICT(provider, plan_key) DO UPDATE SET'
    );
    expect(sql).toContain('price_id = excluded.price_id,');
    expect(sql).toContain('updated_at = excluded.updated_at;');
  });

  it('escapes quotes so a malformed id cannot break out of the literal', () => {
    const sql = buildPaymentPriceSql('stripe', [
      { planKey: 'pro-monthly', priceId: "price_o'brien" },
    ]);

    expect(sql).toContain("'price_o''brien'");
  });
});
