import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { PLAN_PRICES } from '../src/plans.js';

const envExample = readFileSync(
  new URL('./fixtures/template.env.example', import.meta.url),
  'utf8'
);

/** Price id env var names the template declares, e.g. `VITE_STRIPE_PRICE_PRO_MONTHLY`. */
function templatePriceKeys(prefix: string): string[] {
  return envExample
    .split('\n')
    .map((line) => /^([A-Z0-9_]+)=/.exec(line)?.[1])
    .filter((key): key is string => Boolean(key?.startsWith(prefix)))
    .map((key) => key.slice(prefix.length));
}

describe('plan catalog', () => {
  it('matches the plans the template declares', () => {
    // The template's pricing page builds every plan below from these env vars,
    // so a plan the CLI does not provision ships with an empty price id.
    const expected = ['PRO_MONTHLY', 'PRO_YEARLY', 'LIFETIME'];

    for (const prefix of [
      'VITE_STRIPE_PRICE_',
      'VITE_CREEM_PRODUCT_',
      'VITE_WAFFO_PRODUCT_',
    ]) {
      expect(templatePriceKeys(prefix)).toEqual(expected);
    }

    expect(
      PLAN_PRICES.map((plan) =>
        plan.id.replace(/([A-Z])/g, '_$1').toUpperCase()
      )
    ).toEqual(expected);
  });

  it('labels every plan for the provider dashboard', () => {
    for (const plan of PLAN_PRICES) {
      expect(plan.name).not.toBe('');
      expect(plan.description).not.toBe('');
      expect(plan.amount).toBeGreaterThan(0);
      expect(plan.currency).toHaveLength(3);
    }
  });
});
