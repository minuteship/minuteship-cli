export type PackageManager = 'pnpm' | 'npm' | 'yarn' | 'bun';

export interface ScaffoldOptions {
  projectName: string;
  /** Display name used for site metadata. Defaults to the project name. */
  siteName: string;
  packageManager: PackageManager;
  paymentProvider: 'stripe' | 'creem' | 'waffo' | '';
  /** Create Cloudflare D1/R2/KV resources and write their ids into wrangler.jsonc. */
  createCloudflareResources: boolean;
}

export const PACKAGE_MANAGERS: PackageManager[] = [
  'pnpm',
  'npm',
  'yarn',
  'bun',
];

export const PAYMENT_PROVIDERS: ScaffoldOptions['paymentProvider'][] = [
  'stripe',
  'creem',
  'waffo',
  '',
];
