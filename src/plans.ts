import type { CreateOptions } from './options/types.js';

export type PlanId = 'proMonthly' | 'proYearly' | 'lifetime';

export interface PlanPriceDefinition {
  id: PlanId;
  /** Stable key used for provider-side idempotency markers. */
  key: string;
  name: string;
  description: string;
  /** Amount in the currency's minor unit (cents). */
  amount: number;
  currency: string;
  interval?: 'month' | 'year';
}

/**
 * Mirrors the plans in the template's `src/config/website.ts` (`price.plans`);
 * keeping the catalog here means provisioning does not have to parse a
 * TypeScript config. `tests/plans.test.ts` pins it against the template's
 * `.env.example` snapshot, so a plan added there fails here until it is added
 * above.
 */
export const PLAN_PRICES: readonly PlanPriceDefinition[] = [
  {
    id: 'proMonthly',
    key: 'pro-monthly',
    name: 'Pro (monthly)',
    description: 'Pro subscription, billed monthly',
    amount: 990,
    currency: 'USD',
    interval: 'month',
  },
  {
    id: 'proYearly',
    key: 'pro-yearly',
    name: 'Pro (yearly)',
    description: 'Pro subscription, billed yearly',
    amount: 9900,
    currency: 'USD',
    interval: 'year',
  },
  {
    id: 'lifetime',
    key: 'lifetime',
    name: 'Lifetime',
    description: 'One-time lifetime access',
    amount: 19900,
    currency: 'USD',
  },
];

/**
 * Price plans that apply to the current project configuration.
 *
 * Every plan in the catalog is provisioned: the template's pricing page reads
 * them unconditionally, so creating a subset would leave checkout pointing at
 * ids that were never minted.
 */
export function activePlanPrices(
  _options: CreateOptions
): PlanPriceDefinition[] {
  return [...PLAN_PRICES];
}

/** The option key holding a provider's id for a plan. */
export function planOptionKey(
  provider: 'stripe' | 'creem' | 'waffo',
  plan: PlanPriceDefinition
): string {
  const suffix = plan.id.charAt(0).toUpperCase() + plan.id.slice(1);
  const prefix =
    provider === 'stripe'
      ? 'stripePrice'
      : provider === 'creem'
        ? 'creemProduct'
        : 'waffoProduct';
  return `${prefix}${suffix}`;
}
