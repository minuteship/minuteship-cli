import type { CreateOptions } from './options/types.js';

export type PlanId =
  | 'proMonthly'
  | 'proYearly'
  | 'lifetime'
  | 'creditsStarter'
  | 'creditsPro'
  | 'creditsScale';

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
  credits?: number;
  /** Only provisioned when credits are enabled. */
  requiresCredits?: boolean;
}

/**
 * Mirrors the amounts in the template's `src/config/website.ts`. Keeping the
 * catalog here means provisioning does not have to parse a TypeScript config.
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
  {
    id: 'creditsStarter',
    key: 'credits-starter',
    name: 'Credits starter',
    description: '100 credits',
    amount: 500,
    currency: 'USD',
    credits: 100,
    requiresCredits: true,
  },
  {
    id: 'creditsPro',
    key: 'credits-pro',
    name: 'Credits pro',
    description: '500 credits',
    amount: 2000,
    currency: 'USD',
    credits: 500,
    requiresCredits: true,
  },
  {
    id: 'creditsScale',
    key: 'credits-scale',
    name: 'Credits scale',
    description: '2000 credits',
    amount: 5000,
    currency: 'USD',
    credits: 2000,
    requiresCredits: true,
  },
];

/** Price plans that apply to the current project configuration. */
export function activePlanPrices(
  options: CreateOptions
): PlanPriceDefinition[] {
  return PLAN_PRICES.filter(
    (plan) => plan.requiresCredits !== true || options.enableCredits === true
  );
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
