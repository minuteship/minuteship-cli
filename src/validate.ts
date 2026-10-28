import { PAYMENT_PROVIDERS, type ScaffoldOptions } from './types.js';

export const PROJECT_NAME_PATTERN = /^[a-z0-9][a-z0-9._-]{0,63}$/;
export const RESERVED_NAMES = new Set([
  'node_modules',
  'package.json',
  'src',
  'dist',
]);

/**
 * Returns an error message, or `null` when the name is usable.
 * The name becomes both the directory name and the npm package name.
 */
export function validateProjectName(value: string): string | null {
  const name = value.trim();

  if (!name) return 'Project name is required.';
  if (name.length > 64) return 'Project name must be 64 characters or fewer.';
  if (!PROJECT_NAME_PATTERN.test(name)) {
    return 'Use lowercase letters, digits, dots, dashes, or underscores, and start with a letter or digit.';
  }
  if (RESERVED_NAMES.has(name)) return `"${name}" is reserved.`;

  return null;
}

export function validateSiteName(value: string): string | null {
  const name = value.trim();
  if (!name) return 'Site name is required.';
  if (name.length > 100) return 'Site name must be 100 characters or fewer.';
  return null;
}

export function isPaymentProvider(
  value: string
): value is ScaffoldOptions['paymentProvider'] {
  return (PAYMENT_PROVIDERS as readonly string[]).includes(value);
}

const DOMAIN_PATTERN =
  /^(?!-)[a-z0-9-]{1,63}(?<!-)(\.(?!-)[a-z0-9-]{1,63}(?<!-))+$/i;
const GITHUB_REPO_PATTERN = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** A bare hostname such as `app.example.com` (no protocol, path, or port). */
export function validateDomain(value: string): string | null {
  const domain = value.trim();
  if (!domain) return 'Domain is required.';
  if (!DOMAIN_PATTERN.test(domain)) {
    return 'Use a bare hostname such as app.example.com (no https:// or path).';
  }
  return null;
}

export function validateBaseUrl(value: string): string | null {
  const raw = value.trim();
  if (!raw) return 'Base URL is required.';

  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return 'Enter a full URL such as https://app.example.com.';
  }

  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    return 'Base URL must use http:// or https://.';
  }
  if (parsed.search || parsed.hash) {
    return 'Base URL must not include a query string or fragment.';
  }
  return null;
}

export function validateUrl(value: string): string | null {
  const raw = value.trim();
  if (!raw) return 'URL is required.';
  try {
    const parsed = new URL(raw);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:'
      ? null
      : 'URL must use http:// or https://.';
  } catch {
    return 'Enter a full URL.';
  }
}

export function validateEmail(value: string): string | null {
  const email = value.trim();
  if (!email) return 'Email is required.';
  if (!EMAIL_PATTERN.test(email)) return 'Enter a valid email address.';
  return null;
}

/**
 * A mail address as the template stores it: either the bare address or the
 * display-name form `Name <address>` that mail clients show.
 *
 * The template's `mail.fromEmail` and `supportEmail` are rendered into the
 * `From:` header, so a project that wants "MinuteShip <support@…>" (the usual
 * case) has to be able to type exactly that.
 */
export function validateMailbox(value: string): string | null {
  const raw = value.trim();
  if (!raw) return 'Email is required.';

  const angled = raw.match(/^(.+?)\s*<([^<>]+)>$/);
  const address = (angled?.[2] ?? raw).trim();
  if (!EMAIL_PATTERN.test(address)) {
    return 'Enter an address, or a display name followed by one: Name <name@example.com>.';
  }
  return null;
}

export function validateGitHubRepo(value: string): string | null {
  const repo = value.trim();
  if (!repo) return 'Repository is required.';
  if (!GITHUB_REPO_PATTERN.test(repo)) {
    return 'Use the owner/name form, for example acme/saas.';
  }
  return null;
}

/** Stripe secret or restricted key. */
export function validateStripeKey(value: string): string | null {
  const key = value.trim();
  if (!key) return 'Stripe key is required.';
  if (!/^(sk|rk)_(test|live)_/.test(key)) {
    return 'Stripe keys start with sk_test_, sk_live_, rk_test_, or rk_live_.';
  }
  return null;
}

export function validateStripeWebhookSecret(value: string): string | null {
  const secret = value.trim();
  if (!secret) return 'Stripe webhook secret is required.';
  if (!secret.startsWith('whsec_')) {
    return 'Stripe webhook secrets start with whsec_.';
  }
  return null;
}

export function validateCreemKey(value: string): string | null {
  return value.trim() ? null : 'Creem API key is required.';
}

export function validateWaffoMerchantId(value: string): string | null {
  const id = value.trim();
  if (!id) return 'Waffo merchant id is required.';
  if (!/^[A-Za-z0-9_-]+$/.test(id)) {
    return 'Waffo merchant id contains unsupported characters.';
  }
  return null;
}

/** Google Analytics 4 measurement id, e.g. `G-ABC123XYZ`. */
export function validateGoogleAnalyticsId(value: string): string | null {
  const id = value.trim();
  if (!id) return 'Google Analytics id is required.';
  if (!/^G-[A-Z0-9]{4,}$/i.test(id)) {
    return 'Google Analytics ids look like G-XXXXXXXXXX.';
  }
  return null;
}

export function validateClarityProjectId(value: string): string | null {
  const id = value.trim();
  if (!id) return 'Clarity project id is required.';
  if (!/^[A-Za-z0-9]+$/.test(id)) {
    return 'Clarity project ids contain only letters and digits.';
  }
  return null;
}

export function validateCrispWebsiteId(value: string): string | null {
  const id = value.trim();
  if (!id) return 'Crisp website id is required.';
  if (!/^[A-Za-z0-9-]+$/.test(id)) {
    return 'Crisp website ids contain letters, digits, and dashes.';
  }
  return null;
}
