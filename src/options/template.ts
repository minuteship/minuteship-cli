import type { TemplateRewriteOptions } from '../scaffold.js';
import type { CreateOptions } from './types.js';

function text(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() !== ''
    ? value.trim()
    : undefined;
}

function flag(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined;
}

/**
 * Convert the loose resolved options into the typed shape used by the
 * template rewriters. Keeps `string | boolean | undefined` out of files.ts.
 */
export function toTemplateRewriteOptions(
  options: CreateOptions,
  authSecret: string
): TemplateRewriteOptions {
  const provider = text(options.paymentProvider);

  return {
    projectName: String(options.projectName),
    siteName: String(options.siteName),
    packageManager: options.packageManager,
    authSecret,
    paymentProvider:
      provider === 'stripe' || provider === 'creem' || provider === 'waffo'
        ? provider
        : '',
    enableDocs: flag(options.enableDocs) ?? true,
    enableCredits: flag(options.enableCredits) ?? true,
    ...(flag(options.enableBlog) !== undefined
      ? { enableBlog: flag(options.enableBlog) }
      : {}),
    ...(flag(options.enableStorage) !== undefined
      ? { enableStorage: flag(options.enableStorage) }
      : {}),
    ...(flag(options.enableCache) !== undefined
      ? { enableCache: flag(options.enableCache) }
      : {}),
    ...(flag(options.enableNewsletter) !== undefined
      ? { enableNewsletter: flag(options.enableNewsletter) }
      : {}),
    ...(flag(options.enableNotification) !== undefined
      ? { enableNotification: flag(options.enableNotification) }
      : {}),
    ...(text(options.newsletterProvider)
      ? {
          newsletterProvider: text(options.newsletterProvider) as
            | 'resend'
            | 'beehiiv'
            | 'mailcheap',
        }
      : {}),
    ...(text(options.notificationProvider)
      ? {
          notificationProvider: text(options.notificationProvider) as
            | 'discord'
            | 'feishu',
        }
      : {}),
    ...(text(options.mailProvider)
      ? {
          mailProvider: text(options.mailProvider) as 'cloudflare' | 'resend',
        }
      : {}),
    ...(text(options.mailFromEmail)
      ? { mailFromEmail: text(options.mailFromEmail) }
      : {}),
    ...(text(options.mailSupportEmail)
      ? { mailSupportEmail: text(options.mailSupportEmail) }
      : {}),
    ...(flag(options.autoSubscribeAfterSignUp) !== undefined
      ? { autoSubscribeAfterSignUp: flag(options.autoSubscribeAfterSignUp) }
      : {}),
    ...(text(options.domain) ? { domain: text(options.domain) } : {}),
    auth: {
      ...(flag(options.enableGoogleLogin) !== undefined
        ? { enableGoogleLogin: flag(options.enableGoogleLogin) }
        : {}),
      ...(flag(options.enableGithubLogin) !== undefined
        ? { enableGithubLogin: flag(options.enableGithubLogin) }
        : {}),
      ...(flag(options.enableAppleLogin) !== undefined
        ? { enableAppleLogin: flag(options.enableAppleLogin) }
        : {}),
      ...(flag(options.enableEmailOtpLogin) !== undefined
        ? { enableEmailOtpLogin: flag(options.enableEmailOtpLogin) }
        : {}),
      ...(flag(options.enableCredentialLogin) !== undefined
        ? { enableCredentialLogin: flag(options.enableCredentialLogin) }
        : {}),
      ...(flag(options.enableDeleteAccount) !== undefined
        ? { enableDeleteAccount: flag(options.enableDeleteAccount) }
        : {}),
    },
  };
}
