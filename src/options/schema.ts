import { PACKAGE_MANAGERS, type PackageManager } from '../types.js';
import { OPTIONS, isActive, isProvisionable } from './registry.js';
import type { CreateOptions, OptionValues } from './types.js';

export interface ResolvedValues {
  values: CreateOptions;
  errors: string[];
  warnings: string[];
}

function stringValue(value: string | boolean | undefined): string {
  return typeof value === 'string' ? value.trim() : '';
}

function flagHint(flag: string | undefined): string {
  return flag ? `--${flag}` : 'the guided prompt';
}

/**
 * Fill values that are derived from the project name or the local
 * environment. Explicit answers always win.
 */
export function applyDerivedDefaults(
  input: OptionValues,
  env: NodeJS.ProcessEnv = process.env
): CreateOptions {
  const projectName = stringValue(input.projectName);
  const values: OptionValues = { ...input };

  if (!stringValue(values.siteName)) values.siteName = projectName;
  if (!stringValue(values.packageManager)) values.packageManager = 'pnpm';

  // Cloudflare credentials are commonly exported in the shell.
  for (const key of ['cloudflareAccountId', 'cloudflareApiToken'] as const) {
    if (!stringValue(values[key])) {
      const envVar = key === 'cloudflareAccountId'
        ? 'CLOUDFLARE_ACCOUNT_ID'
        : 'CLOUDFLARE_API_TOKEN';
      const fromEnv = env[envVar]?.trim();
      if (fromEnv) values[key] = fromEnv;
    }
  }

  if (!stringValue(values.workerName)) values.workerName = projectName;
  if (!stringValue(values.databaseName)) values.databaseName = projectName;
  if (!stringValue(values.bucketName)) values.bucketName = projectName;
  if (!stringValue(values.kvName)) values.kvName = `${projectName}-CACHE`;

  const domain = stringValue(values.domain);
  const baseUrl = stringValue(values.baseUrl);
  if (domain && (!baseUrl || baseUrl === 'http://localhost:3000')) {
    values.baseUrl = `https://${domain}`;
  }

  const packageManager = stringValue(values.packageManager);
  return {
    ...values,
    projectName,
    siteName: stringValue(values.siteName),
    packageManager: (PACKAGE_MANAGERS as readonly string[]).includes(
      packageManager
    )
      ? (packageManager as PackageManager)
      : 'pnpm',
    targetDir: stringValue(values.targetDir),
  } as CreateOptions;
}

/**
 * Validate the fully resolved answers. Returns errors that must stop the run
 * and warnings that only need to be printed.
 */
export function validateResolved(values: CreateOptions): {
  errors: string[];
  warnings: string[];
} {
  const errors: string[] = [];
  const warnings: string[] = [];

  for (const spec of OPTIONS) {
    // Booleans always resolve to true/false; there is no string to validate.
    if (spec.kind === 'boolean') continue;
    if (!isActive(spec, values)) continue;

    const value = stringValue(values[spec.key]);
    if (!value) {
      if (isProvisionable(spec, values)) {
        // An adapter fills this in before the build; nothing to report yet.
        continue;
      }
      if (spec.requiredWhen && spec.manual === true) {
        warnings.push(
          `${spec.message} is not set. Configure it in the admin console or with \`wrangler secret put\` before using the integration.`
        );
      } else if (spec.requiredWhen) {
        errors.push(
          `${spec.message} is required when the related option is enabled (use ${flagHint(spec.flag)}).`
        );
      }
      continue;
    }

    const error = spec.validate?.(value);
    if (error) errors.push(`${spec.message}: ${error}`);
  }

  const logins = [
    'enableCredentialLogin',
    'enableEmailOtpLogin',
    'enableGoogleLogin',
    'enableGithubLogin',
    'enableAppleLogin',
  ].filter((key) => values[key] === true);

  if (logins.length === 0) {
    errors.push(
      'At least one login method must stay enabled, otherwise nobody can sign in.'
    );
  }

  if (values.enableEmailOtpLogin === true && values.mailProvider === 'cloudflare') {
    // Cloudflare Email needs a verified destination; Resend is the safer default
    // for OTP delivery in a fresh project.
    warnings.push(
      'Email OTP uses the mail provider. Cloudflare Email requires a verified destination address before codes are delivered.'
    );
  }

  const provider = stringValue(values.paymentProvider);
  const hasProviderCredentials =
    provider === 'stripe'
      ? Boolean(stringValue(values.stripeSecretKey))
      : provider === 'creem'
        ? Boolean(stringValue(values.creemApiKey))
        : provider === 'waffo'
          ? Boolean(
              stringValue(values.waffoMerchantId) &&
                stringValue(values.waffoPrivateKey)
            )
          : false;

  if (provider && !hasProviderCredentials) {
    warnings.push(
      `Payment is set to ${provider} but no credential was provided. Checkout stays disabled until you add it in the admin console or with \`wrangler secret put\`.`
    );
  }

  if (values.enableCredits === true && provider === '') {
    warnings.push(
      'Credits are enabled without a payment provider, so credit packs cannot be purchased.'
    );
  }

  if (values.deploy === true) {
    const baseUrl = stringValue(values.baseUrl);
    // Auth callbacks and SEO metadata are baked in at build time, so a
    // localhost URL would produce a broken deployment.
    if (!baseUrl || /^https?:\/\/localhost(?::\d+)?\/?$/i.test(baseUrl)) {
      errors.push(
        'A public base URL is required when deploying. Pass --domain <hostname> or --base-url <url>.'
      );
    }
  }

  return { errors, warnings };
}
