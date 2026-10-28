import { PACKAGE_MANAGERS } from '../types.js';
import { projectHasModule, selectedModules } from '../presets.js';
import {
  validateBaseUrl,
  validateClarityProjectId,
  validateCreemKey,
  validateCrispWebsiteId,
  validateDomain,
  validateEmail,
  validateMailbox,
  validateGitHubRepo,
  validateGoogleAnalyticsId,
  validateSiteName,
  validateStripeKey,
  validateStripeWebhookSecret,
  validateUrl,
  validateWaffoMerchantId,
} from '../validate.js';
import {
  BUILD_TARGETS,
  ENV_TARGETS,
  SECRET_TARGETS,
  type OptionSpec,
  type OptionTarget,
  type OptionValues,
} from './types.js';

/** Runtime-only values live in Worker secrets and in the build env for CI. */
const RUNTIME_TARGETS: readonly OptionTarget[] = [
  'env.local',
  'env.production',
  'worker.secret',
  'github.secret',
];

/**
 * A yes/no project choice.
 *
 * `requiredWhen` decides whether the question is asked at all. A toggle whose
 * module is absent is not a default to accept — it is a question with no
 * meaning, and answering it would write env vars nothing reads.
 */
const feature = (
  key: string,
  flag: string,
  message: string,
  defaultValue: boolean,
  requiredWhen?: (values: OptionValues) => boolean
): OptionSpec => ({
  key,
  flag,
  group: 'features',
  kind: 'boolean',
  message,
  default: defaultValue,
  cliOnly: true,
  ...(requiredWhen ? { requiredWhen } : {}),
});

const envOption = (
  key: string,
  flag: string,
  envVar: string,
  group: OptionSpec['group'],
  message: string,
  extra: Partial<OptionSpec> = {}
): OptionSpec => ({
  key,
  flag,
  envVar,
  group,
  kind: 'string',
  message,
  targets: ENV_TARGETS,
  ...extra,
});

const secretOption = (
  key: string,
  flag: string,
  envVar: string,
  group: OptionSpec['group'],
  message: string,
  extra: Partial<OptionSpec> = {}
): OptionSpec => ({
  key,
  flag,
  envVar,
  group,
  kind: 'secret',
  message,
  targets: SECRET_TARGETS,
  advanced: true,
  ...extra,
});

const buildOption = (
  key: string,
  flag: string,
  envVar: string,
  group: OptionSpec['group'],
  message: string,
  extra: Partial<OptionSpec> = {}
): OptionSpec => ({
  key,
  flag,
  envVar,
  group,
  kind: 'string',
  message,
  targets: BUILD_TARGETS,
  ...extra,
});

// `selectedModules` and `projectHasModule` come from `../presets`, so the
// "which modules does this project have" answer lives in one place.
export { selectedModules };

/**
 * Single source of truth for every configurable value.
 *
 * The array order is also the guided-flow order, so conditional options must
 * come after the flag they depend on (e.g. an analytics toggle precedes its id).
 */
export const OPTIONS: readonly OptionSpec[] = [
  // ---------------------------------------------------------------------------
  // Project
  // ---------------------------------------------------------------------------
  {
    key: 'projectName',
    group: 'project',
    kind: 'string',
    message: 'Project name',
    hint: 'Lowercase, used as the directory and Worker name',
    cliOnly: true,
  },
  {
    key: 'siteName',
    flag: 'site-name',
    group: 'project',
    kind: 'string',
    message: 'Site name (shown in metadata)',
    cliOnly: true,
    validate: validateSiteName,
  },
  {
    key: 'siteTitle',
    flag: 'site-title',
    group: 'project',
    kind: 'string',
    message: 'Browser title and Open Graph title',
    hint: 'Defaults to "<site name> - Built with MinuteShip"',
    cliOnly: true,
  },
  {
    key: 'siteDescription',
    flag: 'site-description',
    group: 'project',
    kind: 'string',
    message: 'Meta description',
    hint: 'Shown in search results and social cards',
    cliOnly: true,
  },
  {
    key: 'locales',
    flag: 'locales',
    group: 'project',
    kind: 'string',
    message: 'Locales to build',
    hint: 'Comma-separated, e.g. en,zh — the first is the default',
    default: 'en,zh',
    cliOnly: true,
  },
  {
    key: 'ctaRoute',
    flag: 'cta-route',
    group: 'features',
    kind: 'string',
    message: 'Where the landing page\'s primary button points',
    hint: 'Leave empty for the preset default, e.g. /docs',
    cliOnly: true,
    advanced: true,
  },
  {
    key: 'packageManager',
    flag: 'package-manager',
    group: 'project',
    kind: 'enum',
    message: 'Package manager',
    default: 'pnpm',
    cliOnly: true,
    choices: PACKAGE_MANAGERS.map((value) => ({ label: value, value })),
  },
  {
    key: 'baseUrl',
    flag: 'base-url',
    envVar: 'VITE_BASE_URL',
    group: 'project',
    kind: 'url',
    message: 'Public base URL of the site',
    hint: 'Used for auth callbacks and SEO',
    default: 'http://localhost:3000',
    targets: BUILD_TARGETS,
    validate: validateBaseUrl,
  },

  // ---------------------------------------------------------------------------
  // Delivery choices (asked before options that depend on them)
  // ---------------------------------------------------------------------------
  {
    key: 'provision',
    flag: 'provision',
    group: 'cloudflare',
    kind: 'boolean',
    message: 'Create missing Cloudflare resources automatically?',
    default: true,
    cliOnly: true,
  },
  {
    key: 'install',
    flag: 'install',
    group: 'project',
    kind: 'boolean',
    message: 'Install dependencies after scaffolding?',
    default: true,
    cliOnly: true,
  },
  {
    key: 'migrateLocal',
    flag: 'migrate-local',
    group: 'project',
    kind: 'boolean',
    message: 'Apply database migrations locally?',
    default: true,
    cliOnly: true,
  },
  {
    key: 'deploy',
    flag: 'deploy',
    group: 'cloudflare',
    kind: 'boolean',
    message: 'Build and deploy to Cloudflare after scaffolding?',
    default: true,
    cliOnly: true,
  },
  {
    key: 'createAdmin',
    flag: 'create-admin',
    group: 'project',
    kind: 'boolean',
    message: 'Create an admin account with a one-time password?',
    default: true,
    cliOnly: true,
  },
  {
    key: 'githubEnabled',
    flag: 'github',
    group: 'project',
    kind: 'boolean',
    message: 'Create a private GitHub repository and push?',
    default: false,
    cliOnly: true,
  },

  // ---------------------------------------------------------------------------
  // What the site is (written into minuteship.config.ts)
  // ---------------------------------------------------------------------------
  {
    key: 'preset',
    flag: 'preset',
    group: 'features',
    kind: 'enum',
    message: 'Site type',
    hint: 'Fixed for the life of the project',
    default: 'saas',
    cliOnly: true,
    choices: [
      { label: 'SaaS — accounts, payments, dashboard', value: 'saas' },
      { label: 'Tool site — public tools, no accounts', value: 'tools' },
      { label: 'Directory — a browsable catalogue', value: 'directory' },
    ],
  },
  {
    key: 'modules',
    flag: 'modules',
    group: 'features',
    kind: 'string',
    message: 'Modules to include',
    hint: 'Comma-separated, e.g. auth,payment,blog — see `minuteship modules`',
    cliOnly: true,
  },
  {
    key: 'theme',
    flag: 'theme',
    group: 'features',
    kind: 'enum',
    message: 'Brand theme',
    default: 'amber',
    cliOnly: true,
    choices: [
      { label: 'Amber — warm', value: 'amber' },
      { label: 'Ocean — cool blue', value: 'ocean' },
    ],
  },
  {
    key: 'newsletterProvider',
    flag: 'newsletter-provider',
    group: 'newsletter',
    kind: 'enum',
    message: 'Newsletter provider',
    default: 'resend',
    cliOnly: true,
    choices: [
      { label: 'Resend', value: 'resend' },
      { label: 'Beehiiv', value: 'beehiiv' },
      { label: 'MailCheap', value: 'mailcheap' },
    ],
    requiredWhen: (values) => selectedModules(values).includes('newsletter'),
  },
  {
    key: 'autoSubscribeAfterSignUp',
    flag: 'auto-subscribe',
    group: 'newsletter',
    kind: 'boolean',
    message: 'Subscribe users automatically after sign-up?',
    default: true,
    cliOnly: true,
    requiredWhen: (values) => selectedModules(values).includes('newsletter'),
  },
  {
    key: 'notificationProvider',
    flag: 'notification-provider',
    group: 'notification',
    kind: 'enum',
    message: 'Notification provider',
    default: 'discord',
    cliOnly: true,
    choices: [
      { label: 'Discord', value: 'discord' },
      { label: 'Feishu', value: 'feishu' },
    ],
    requiredWhen: (values) => selectedModules(values).includes('notification'),
  },
  {
    key: 'mailProvider',
    flag: 'mail-provider',
    group: 'mail',
    kind: 'enum',
    message: 'Transactional mail provider',
    default: 'cloudflare',
    cliOnly: true,
    choices: [
      { label: 'Cloudflare Email (binding)', value: 'cloudflare' },
      { label: 'Resend', value: 'resend' },
    ],
  },
  {
    key: 'mailFromEmail',
    flag: 'mail-from',
    group: 'mail',
    kind: 'email',
    message: 'From address for transactional mail',
    hint: 'Either name@example.com or "Name <name@example.com>"',
    cliOnly: true,
    validate: validateMailbox,
    advanced: true,
  },
  {
    key: 'mailSupportEmail',
    flag: 'mail-support',
    group: 'mail',
    kind: 'email',
    message: 'Support address shown to users',
    hint: 'Either name@example.com or "Name <name@example.com>"',
    cliOnly: true,
    validate: validateMailbox,
    advanced: true,
  },

  // ---------------------------------------------------------------------------
  // Auth
  // ---------------------------------------------------------------------------
  feature(
    'enableCredentialLogin',
    'credential-login',
    'Enable email + password login?',
    true,
    (values) => projectHasModule(values, 'auth')
  ),
  feature(
    'enableGoogleLogin',
    'google-login',
    'Enable Google login?',
    true,
    (values) => projectHasModule(values, 'auth')
  ),
  feature(
    'enableDeleteAccount',
    'delete-account',
    'Allow users to delete their account?',
    true,
    (values) => projectHasModule(values, 'auth')
  ),
  secretOption(
    'betterAuthSecret',
    'better-auth-secret',
    'BETTER_AUTH_SECRET',
    'auth',
    'Better Auth secret',
    { hint: 'Generated automatically when omitted', advanced: true }
  ),
  envOption(
    'betterAuthTrustedOrigins',
    'trusted-origins',
    'BETTER_AUTH_TRUSTED_ORIGINS',
    'auth',
    'Additional trusted origins (comma-separated)',
    { advanced: true }
  ),
  envOption(
    'googleClientId',
    'google-client-id',
    'GOOGLE_CLIENT_ID',
    'auth',
    'Google OAuth client id',
    {
      targets: RUNTIME_TARGETS,
      requiredWhen: (values) => values.enableGoogleLogin === true,
      manual: true,
    }
  ),
  secretOption(
    'googleClientSecret',
    'google-client-secret',
    'GOOGLE_CLIENT_SECRET',
    'auth',
    'Google OAuth client secret',
    {
      targets: RUNTIME_TARGETS,
      requiredWhen: (values) => values.enableGoogleLogin === true,
      manual: true,
    }
  ),
  envOption(
    'googleExtensionClientId',
    'google-extension-client-id',
    'GOOGLE_EXTENSION_CLIENT_ID',
    'auth',
    'Browser-extension Google client id',
    { targets: RUNTIME_TARGETS, advanced: true }
  ),
  // ---------------------------------------------------------------------------
  // Payment
  // ---------------------------------------------------------------------------
  {
    key: 'paymentProvider',
    flag: 'payment',
    envVar: 'VITE_PAYMENT_PROVIDER',
    group: 'payment',
    kind: 'enum',
    message: 'Payment provider',
    default: '',
    targets: BUILD_TARGETS,
    choices: [
      { label: 'None for now', value: '' },
      { label: 'Stripe', value: 'stripe' },
      { label: 'Creem', value: 'creem' },
      { label: 'Waffo Pancake', value: 'waffo' },
    ],
  },
  {
    key: 'provisionPayment',
    flag: 'provision-payment',
    group: 'payment',
    kind: 'boolean',
    message: 'Create products, prices, and webhooks through the provider API?',
    default: true,
    cliOnly: true,
    requiredWhen: (values) =>
      typeof values.paymentProvider === 'string' &&
      values.paymentProvider !== '',
  },
  secretOption(
    'stripeSecretKey',
    'stripe-secret-key',
    'STRIPE_SECRET_KEY',
    'payment',
    'Stripe secret key',
    {
      targets: RUNTIME_TARGETS,
      requiredWhen: (values) => values.paymentProvider === 'stripe',
      validate: validateStripeKey,
    }
  ),
  secretOption(
    'stripeWebhookSecret',
    'stripe-webhook-secret',
    'STRIPE_WEBHOOK_SECRET',
    'payment',
    'Stripe webhook signing secret',
    {
      targets: RUNTIME_TARGETS,
      requiredWhen: (values) => values.paymentProvider === 'stripe',
      provisionedBy: 'stripe',
      validate: validateStripeWebhookSecret,
      hint: 'Printed once by the Stripe dashboard or the provisioning step',
    }
  ),
  buildOption(
    'stripePriceProMonthly',
    'stripe-price-pro-monthly',
    'VITE_STRIPE_PRICE_PRO_MONTHLY',
    'payment',
    'Stripe price id: Pro monthly',
    {
      requiredWhen: (values) => values.paymentProvider === 'stripe',
      provisionedBy: 'stripe',
    }
  ),
  buildOption(
    'stripePriceProYearly',
    'stripe-price-pro-yearly',
    'VITE_STRIPE_PRICE_PRO_YEARLY',
    'payment',
    'Stripe price id: Pro yearly',
    {
      requiredWhen: (values) => values.paymentProvider === 'stripe',
      provisionedBy: 'stripe',
    }
  ),
  buildOption(
    'stripePriceLifetime',
    'stripe-price-lifetime',
    'VITE_STRIPE_PRICE_LIFETIME',
    'payment',
    'Stripe price id: Lifetime',
    {
      requiredWhen: (values) => values.paymentProvider === 'stripe',
      provisionedBy: 'stripe',
    }
  ),
  secretOption(
    'creemApiKey',
    'creem-api-key',
    'CREEM_API_KEY',
    'payment',
    'Creem API key',
    {
      targets: RUNTIME_TARGETS,
      requiredWhen: (values) => values.paymentProvider === 'creem',
      validate: validateCreemKey,
    }
  ),
  secretOption(
    'creemWebhookSecret',
    'creem-webhook-secret',
    'CREEM_WEBHOOK_SECRET',
    'payment',
    'Creem webhook secret',
    {
      targets: RUNTIME_TARGETS,
      requiredWhen: (values) => values.paymentProvider === 'creem',
      provisionedBy: 'creem',
    }
  ),
  {
    key: 'creemDebug',
    flag: 'creem-debug',
    envVar: 'CREEM_DEBUG',
    group: 'payment',
    kind: 'boolean',
    message: 'Use the Creem test environment?',
    default: true,
    targets: RUNTIME_TARGETS,
    requiredWhen: (values) => values.paymentProvider === 'creem',
  },
  buildOption(
    'creemProductProMonthly',
    'creem-product-pro-monthly',
    'VITE_CREEM_PRODUCT_PRO_MONTHLY',
    'payment',
    'Creem product id: Pro monthly',
    {
      requiredWhen: (values) => values.paymentProvider === 'creem',
      provisionedBy: 'creem',
    }
  ),
  buildOption(
    'creemProductProYearly',
    'creem-product-pro-yearly',
    'VITE_CREEM_PRODUCT_PRO_YEARLY',
    'payment',
    'Creem product id: Pro yearly',
    {
      requiredWhen: (values) => values.paymentProvider === 'creem',
      provisionedBy: 'creem',
    }
  ),
  buildOption(
    'creemProductLifetime',
    'creem-product-lifetime',
    'VITE_CREEM_PRODUCT_LIFETIME',
    'payment',
    'Creem product id: Lifetime',
    {
      requiredWhen: (values) => values.paymentProvider === 'creem',
      provisionedBy: 'creem',
    }
  ),
  envOption(
    'waffoMerchantId',
    'waffo-merchant-id',
    'WAFFO_MERCHANT_ID',
    'payment',
    'Waffo merchant id',
    {
      targets: RUNTIME_TARGETS,
      requiredWhen: (values) => values.paymentProvider === 'waffo',
      validate: validateWaffoMerchantId,
      manual: true,
    }
  ),
  secretOption(
    'waffoPrivateKey',
    'waffo-private-key',
    'WAFFO_PRIVATE_KEY',
    'payment',
    'Waffo private key',
    {
      targets: RUNTIME_TARGETS,
      requiredWhen: (values) => values.paymentProvider === 'waffo',
      manual: true,
    }
  ),
  {
    key: 'waffoDebug',
    flag: 'waffo-debug',
    envVar: 'WAFFO_DEBUG',
    group: 'payment',
    kind: 'boolean',
    message: 'Use the Waffo test environment?',
    default: true,
    targets: RUNTIME_TARGETS,
    requiredWhen: (values) => values.paymentProvider === 'waffo',
  },
  buildOption(
    'waffoProductProMonthly',
    'waffo-product-pro-monthly',
    'VITE_WAFFO_PRODUCT_PRO_MONTHLY',
    'payment',
    'Waffo product id: Pro monthly',
    {
      requiredWhen: (values) => values.paymentProvider === 'waffo',
      manual: true,
    }
  ),
  buildOption(
    'waffoProductProYearly',
    'waffo-product-pro-yearly',
    'VITE_WAFFO_PRODUCT_PRO_YEARLY',
    'payment',
    'Waffo product id: Pro yearly',
    {
      requiredWhen: (values) => values.paymentProvider === 'waffo',
      manual: true,
    }
  ),
  buildOption(
    'waffoProductLifetime',
    'waffo-product-lifetime',
    'VITE_WAFFO_PRODUCT_LIFETIME',
    'payment',
    'Waffo product id: Lifetime',
    {
      requiredWhen: (values) => values.paymentProvider === 'waffo',
      manual: true,
    }
  ),

  // ---------------------------------------------------------------------------
  // Mail
  // ---------------------------------------------------------------------------
  secretOption(
    'resendApiKey',
    'resend-api-key',
    'RESEND_API_KEY',
    'mail',
    'Resend API key',
    {
      targets: RUNTIME_TARGETS,
      requiredWhen: (values) =>
        values.mailProvider === 'resend' ||
        (selectedModules(values).includes('newsletter') &&
          values.newsletterProvider === 'resend'),
      manual: true,
    }
  ),

  // ---------------------------------------------------------------------------
  // Newsletter
  // ---------------------------------------------------------------------------
  secretOption(
    'beehiivApiKey',
    'beehiiv-api-key',
    'BEEHIIV_API_KEY',
    'newsletter',
    'Beehiiv API key',
    {
      targets: RUNTIME_TARGETS,
      requiredWhen: (values) =>
        selectedModules(values).includes('newsletter') &&
        values.newsletterProvider === 'beehiiv',
      manual: true,
    }
  ),
  envOption(
    'beehiivPublicationId',
    'beehiiv-publication-id',
    'BEEHIIV_PUBLICATION_ID',
    'newsletter',
    'Beehiiv publication id',
    {
      targets: RUNTIME_TARGETS,
      requiredWhen: (values) =>
        selectedModules(values).includes('newsletter') &&
        values.newsletterProvider === 'beehiiv',
      manual: true,
    }
  ),
  secretOption(
    'mailcheapApiKey',
    'mailcheap-api-key',
    'MAILCHEAP_API_KEY',
    'newsletter',
    'MailCheap API key',
    {
      targets: RUNTIME_TARGETS,
      requiredWhen: (values) =>
        selectedModules(values).includes('newsletter') &&
        values.newsletterProvider === 'mailcheap',
      manual: true,
    }
  ),
  envOption(
    'mailcheapNewsletterId',
    'mailcheap-newsletter-id',
    'MAILCHEAP_NEWSLETTER_ID',
    'newsletter',
    'MailCheap newsletter id',
    {
      targets: RUNTIME_TARGETS,
      requiredWhen: (values) =>
        selectedModules(values).includes('newsletter') &&
        values.newsletterProvider === 'mailcheap',
      manual: true,
    }
  ),

  // ---------------------------------------------------------------------------
  // Notification
  // ---------------------------------------------------------------------------
  secretOption(
    'discordWebhookUrl',
    'discord-webhook-url',
    'DISCORD_WEBHOOK_URL',
    'notification',
    'Discord webhook URL',
    {
      targets: RUNTIME_TARGETS,
      requiredWhen: (values) =>
        selectedModules(values).includes('notification') &&
        values.notificationProvider === 'discord',
      manual: true,
    }
  ),
  secretOption(
    'feishuWebhookUrl',
    'feishu-webhook-url',
    'FEISHU_WEBHOOK_URL',
    'notification',
    'Feishu webhook URL',
    {
      targets: RUNTIME_TARGETS,
      requiredWhen: (values) =>
        selectedModules(values).includes('notification') &&
        values.notificationProvider === 'feishu',
      manual: true,
    }
  ),

  // ---------------------------------------------------------------------------
  // Analytics
  // ---------------------------------------------------------------------------
  {
    key: 'enableGoogleAnalytics',
    flag: 'google-analytics',
    group: 'analytics',
    kind: 'boolean',
    message: 'Enable Google Analytics?',
    default: false,
    cliOnly: true,
  },
  buildOption(
    'googleAnalyticsId',
    'google-analytics-id',
    'VITE_GOOGLE_ANALYTICS_ID',
    'analytics',
    'Google Analytics measurement id',
    {
      hint: 'Looks like G-XXXXXXXXXX',
      requiredWhen: (values) => values.enableGoogleAnalytics === true,
      validate: validateGoogleAnalyticsId,
    }
  ),
  {
    key: 'enableClarity',
    flag: 'clarity',
    group: 'analytics',
    kind: 'boolean',
    message: 'Enable Microsoft Clarity?',
    default: false,
    cliOnly: true,
  },
  buildOption(
    'clarityProjectId',
    'clarity-project-id',
    'VITE_CLARITY_PROJECT_ID',
    'analytics',
    'Clarity project id',
    {
      requiredWhen: (values) => values.enableClarity === true,
      validate: validateClarityProjectId,
      manual: true,
    }
  ),
  {
    key: 'enablePlausible',
    flag: 'plausible',
    group: 'analytics',
    kind: 'boolean',
    message: 'Enable Plausible?',
    default: false,
    cliOnly: true,
  },
  buildOption(
    'plausibleScript',
    'plausible-script',
    'VITE_PLAUSIBLE_SCRIPT',
    'analytics',
    'Plausible script URL',
    {
      requiredWhen: (values) => values.enablePlausible === true,
      validate: validateUrl,
      manual: true,
    }
  ),
  {
    key: 'enableUmami',
    flag: 'umami',
    group: 'analytics',
    kind: 'boolean',
    message: 'Enable Umami?',
    default: false,
    cliOnly: true,
  },
  buildOption(
    'umamiWebsiteId',
    'umami-website-id',
    'VITE_UMAMI_WEBSITE_ID',
    'analytics',
    'Umami website id',
    { requiredWhen: (values) => values.enableUmami === true, manual: true }
  ),
  buildOption(
    'umamiScript',
    'umami-script',
    'VITE_UMAMI_SCRIPT',
    'analytics',
    'Umami script URL',
    {
      requiredWhen: (values) => values.enableUmami === true,
      validate: validateUrl,
      manual: true,
    }
  ),
  // ---------------------------------------------------------------------------
  // Chat and AI
  // ---------------------------------------------------------------------------
  {
    key: 'enableCrisp',
    flag: 'crisp',
    group: 'chat',
    kind: 'boolean',
    message: 'Enable the Crisp chat widget?',
    default: false,
    cliOnly: true,
  },
  buildOption(
    'crispWebsiteId',
    'crisp-website-id',
    'VITE_CRISP_WEBSITE_ID',
    'chat',
    'Crisp website id',
    {
      requiredWhen: (values) => values.enableCrisp === true,
      validate: validateCrispWebsiteId,
      manual: true,
    }
  ),
  secretOption(
    'falKey',
    'fal-key',
    'FAL_KEY',
    'ai',
    'fal.ai API key (AI image playground)',
    { targets: RUNTIME_TARGETS }
  ),

  // ---------------------------------------------------------------------------
  // Cloudflare
  // ---------------------------------------------------------------------------
  {
    key: 'domain',
    flag: 'domain',
    group: 'cloudflare',
    kind: 'string',
    message: 'Custom domain (optional)',
    hint: 'Bare hostname, e.g. app.example.com',
    cliOnly: true,
    validate: validateDomain,
  },
  envOption(
    'cloudflareAccountId',
    'cloudflare-account-id',
    'CLOUDFLARE_ACCOUNT_ID',
    'cloudflare',
    'Cloudflare account id',
    {
      targets: RUNTIME_TARGETS,
      hint: 'Read from CLOUDFLARE_ACCOUNT_ID when omitted; `wrangler login` also works',
    }
  ),
  secretOption(
    'cloudflareApiToken',
    'cloudflare-api-token',
    'CLOUDFLARE_API_TOKEN',
    'cloudflare',
    'Cloudflare API token',
    {
      targets: RUNTIME_TARGETS,
      hint: 'Read from CLOUDFLARE_API_TOKEN when omitted; only needed for REST provisioning',
    }
  ),
  {
    key: 'workerName',
    flag: 'worker-name',
    group: 'cloudflare',
    kind: 'string',
    message: 'Worker name',
    cliOnly: true,
    advanced: true,
  },
  {
    key: 'databaseName',
    flag: 'database-name',
    group: 'cloudflare',
    kind: 'string',
    message: 'D1 database name',
    cliOnly: true,
    advanced: true,
  },
  {
    key: 'bucketName',
    flag: 'bucket-name',
    group: 'cloudflare',
    kind: 'string',
    message: 'R2 bucket name',
    cliOnly: true,
    advanced: true,
  },
  {
    key: 'kvName',
    flag: 'kv-name',
    group: 'cloudflare',
    kind: 'string',
    message: 'KV namespace title',
    cliOnly: true,
    advanced: true,
  },

  // ---------------------------------------------------------------------------
  // Delivery
  // ---------------------------------------------------------------------------
  {
    key: 'adminEmail',
    flag: 'admin-email',
    group: 'project',
    kind: 'email',
    message: 'Admin email address',
    cliOnly: true,
    validate: validateEmail,
    requiredWhen: (values) => values.createAdmin === true,
  },
  {
    key: 'githubRepo',
    flag: 'github-repo',
    group: 'project',
    kind: 'string',
    message: 'GitHub repository (owner/name)',
    cliOnly: true,
    validate: validateGitHubRepo,
    requiredWhen: (values) => values.githubEnabled === true,
  },
  {
    key: 'githubVisibility',
    flag: 'github-visibility',
    group: 'project',
    kind: 'enum',
    message: 'GitHub repository visibility',
    default: 'private',
    cliOnly: true,
    choices: [
      { label: 'Private', value: 'private' },
      { label: 'Public', value: 'public' },
    ],
    requiredWhen: (values) => values.githubEnabled === true,
  },
];

export const OPTIONS_BY_KEY = new Map(OPTIONS.map((spec) => [spec.key, spec]));
export const OPTIONS_BY_ENV = new Map(
  OPTIONS.filter((spec) => spec.envVar).map((spec) => [spec.envVar, spec])
);

/**
 * True when an adapter will fill this value during `create`, so a missing
 * answer is expected rather than an error.
 */
export function isProvisionable(
  spec: OptionSpec,
  values: OptionValues
): boolean {
  if (!spec.provisionedBy) return false;
  if (spec.provisionedBy === 'cloudflare' || spec.provisionedBy === 'resend') {
    return true;
  }
  if (values.provisionPayment === false) return false;
  return values.paymentProvider === spec.provisionedBy;
}

export function specsForGroup(group: OptionSpec['group']): OptionSpec[] {
  return OPTIONS.filter((spec) => spec.group === group);
}

/** True when the option applies to the current answers. */
export function isActive(spec: OptionSpec, values: OptionValues): boolean {
  return spec.requiredWhen ? spec.requiredWhen(values) : true;
}
