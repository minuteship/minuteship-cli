import type { TemplateRewriteOptions } from '../scaffold.js';
import type { CreateOptions } from './types.js';

function text(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() !== ''
    ? value.trim()
    : undefined;
}

/** Split a comma-separated flag value into module keys. */
function list(value: unknown): string[] {
  if (typeof value !== 'string') return [];
  return value
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item !== '');
}

function paymentProvider(
  value: unknown
): { provider: 'stripe' | 'creem' | 'waffo' } | undefined {
  const provider = text(value);
  return provider === 'stripe' || provider === 'creem' || provider === 'waffo'
    ? { provider }
    : undefined;
}

function flag(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined;
}

/**
 * Turn the resolved options into the template rewrite input.
 *
 * The shape mirrors `minuteship.config.ts`: a project is a preset, a module
 * list, a theme and a brand. Feature toggles do not appear here because they no
 * longer exist in the template — a capability is included or it is not, and the
 * build prunes what is not.
 */
export function toTemplateRewriteOptions(
  options: CreateOptions,
  authSecret: string
): TemplateRewriteOptions {
  const siteName = String(options.siteName);
  const domain = text(options.domain);
  const baseUrl = text(options.baseUrl);
  const modules = list(options.modules);
  const payment = paymentProvider(options.paymentProvider);

  return {
    projectName: String(options.projectName),
    preset: text(options.preset) ?? 'saas',
    modules,
    theme: text(options.theme) ?? 'amber',
    site: {
      name: siteName,
      title: text(options.siteTitle) ?? `${siteName} - Built with MinuteShip`,
      description:
        text(options.siteDescription) ?? `${siteName} is built with MinuteShip.`,
      url: baseUrl ?? (domain ? `https://${domain}` : 'http://localhost:3000'),
      locales: text(options.locales)
        ? list(options.locales)
        : ['en', 'zh'],
    },
    // These are project choices, not just env values: the app reads mail,
    // newsletter and notification providers from `minuteship.config.ts`, so a
    // provider picked here has to be written there or the answer goes nowhere.
    auth: {
      googleLogin: flag(options.enableGoogleLogin),
      credentialLogin: flag(options.enableCredentialLogin),
      deleteAccount: flag(options.enableDeleteAccount),
    },
    mail: {
      provider: text(options.mailProvider),
      fromEmail: text(options.mailFromEmail),
      supportEmail: text(options.mailSupportEmail),
    },
    newsletter: {
      provider: text(options.newsletterProvider),
      autoSubscribeAfterSignUp: flag(options.autoSubscribeAfterSignUp),
    },
    notification: { provider: text(options.notificationProvider) },
    packageManager: options.packageManager,
    authSecret,
    ...(domain ? { domain } : {}),
    ...(payment ? { payment } : {}),
  };
}
