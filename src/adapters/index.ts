import type { Logger } from '../log.js';
import type { CreateOptions } from '../options/types.js';
import { provisionCreem } from './creem.js';
import { provisionStripe } from './stripe.js';
import {
  mergeProvisionResults,
  provisionResult,
  type ProvisionResult,
} from './types.js';

export interface ProvisionIntegrationsInput {
  options: CreateOptions;
  logger: Logger;
}

function webhookUrl(baseUrl: string, provider: string): string {
  return `${baseUrl.replace(/\/$/, '')}/api/webhooks/${provider}`;
}

/**
 * Create everything a third-party API can create before the project is built.
 *
 * Anything without a provisioning API (or that fails) becomes a manual
 * instruction; the run continues so the site can still go live.
 */
export async function provisionIntegrations(
  input: ProvisionIntegrationsInput
): Promise<ProvisionResult> {
  const { options, logger } = input;
  const provider =
    typeof options.paymentProvider === 'string'
      ? options.paymentProvider
      : '';

  if (provider === '') {
    return provisionResult('skipped');
  }

  const baseUrl = String(options.baseUrl ?? 'http://localhost:3000');
  const isPublicBaseUrl = !/^https?:\/\/localhost(?::\d+)?\/?$/i.test(baseUrl);

  if (options.provisionPayment === false) {
    return provisionResult('skipped', {
      manualInstructions: [
        `Create the ${provider} products and prices in the provider dashboard, then set the VITE_${provider.toUpperCase()}_* ids.`,
        ...(isPublicBaseUrl
          ? [
              `Register the webhook ${webhookUrl(baseUrl, provider)} in the provider dashboard.`,
            ]
          : []),
      ],
    });
  }

  if (provider === 'stripe') {
    const secretKey =
      typeof options.stripeSecretKey === 'string'
        ? options.stripeSecretKey.trim()
        : '';

    if (!secretKey) {
      return provisionResult('manual', {
        manualInstructions: [
          'Set STRIPE_SECRET_KEY to create Stripe products, prices, and the webhook automatically.',
        ],
      });
    }

    logger.info('Creating Stripe products, prices, and webhook…');
    return provisionStripe({
      secretKey,
      projectName: options.projectName,
      baseUrl,
      options,
    });
  }

  if (provider === 'creem') {
    const apiKey =
      typeof options.creemApiKey === 'string'
        ? options.creemApiKey.trim()
        : '';

    if (!apiKey) {
      return provisionResult('manual', {
        manualInstructions: [
          'Set CREEM_API_KEY to create Creem products and the webhook automatically.',
        ],
      });
    }

    logger.info('Creating Creem products and webhook…');
    return provisionCreem({
      apiKey,
      projectName: options.projectName,
      baseUrl,
      options,
    });
  }

  if (provider === 'waffo') {
    return provisionResult('manual', {
      manualInstructions: [
        'Create the Waffo store and products in the Waffo dashboard, then set VITE_WAFFO_PRODUCT_* and WAFFO_STORE_ID.',
        `Register the webhook with: pnpm tsx scripts/setup-waffo.ts --store <STORE_ID> --url ${webhookUrl(baseUrl, 'waffo')}`,
      ],
    });
  }

  return provisionResult('skipped');
}

export { mergeProvisionResults };
