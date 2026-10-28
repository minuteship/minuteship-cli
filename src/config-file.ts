/**
 * Render `minuteship.config.ts` for a generated project.
 *
 * This is the only thing the CLI writes about *what the project is*. The
 * template derives routes, shell UI, theme CSS and `websiteConfig` from this
 * file at build time, so there is no second copy to keep in sync — which is
 * what made the previous approach (regex-editing `website.ts`, then editing the
 * locale JSON) fragile: two sources, two chances to disagree.
 *
 * The type lives in the template (`src/config/project-config.ts`), so this file
 * only writes values. That is deliberate: a type declaration reproduced here
 * would drift from the template's the first time a field is added.
 *
 * The output reads like something a person wrote — their own values, no marker
 * comments telling them a tool was here.
 */

export interface ConfigSite {
  name: string;
  title: string;
  description: string;
  url: string;
  locales: readonly string[];
  /** Address visitors write to; shown even when the site cannot send mail. */
  supportEmail?: string;
  localized?: Record<string, { title?: string; description?: string }>;
}

export interface ConfigFileInput {
  preset: string;
  modules: readonly string[];
  theme: string;
  site: ConfigSite;
  /**
   * Where the landing page's primary button points. Omitted leaves the preset's
   * own choice; the template validates it against the routes the build has.
   */
  ctaRoute?: string;
  payment?: { provider: 'stripe' | 'creem' | 'waffo' };
  auth?: {
    googleLogin?: boolean;
    credentialLogin?: boolean;
    deleteAccount?: boolean;
  };
  mail?: {
    provider?: string;
    fromEmail?: string;
    supportEmail?: string;
  };
  newsletter?: {
    provider?: string;
    autoSubscribeAfterSignUp?: boolean;
  };
  notification?: { provider?: string };
}

function quote(value: string): string {
  // Single quotes, matching the template's Biome style.
  return `'${value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
}

/** Drop keys the caller left undefined, so the file has no `field: undefined`. */
function defined<T extends Record<string, unknown>>(input: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(input).filter(([, value]) => value !== undefined)
  ) as Partial<T>;
}

/**
 * Emit `  <name>: {` … `  },` for the fields that were answered.
 *
 * Values are pre-formatted (already quoted, or a bare boolean), so this stays a
 * formatter and each block reads as the shape it writes.
 */
function pushBlock(
  lines: string[],
  name: string,
  fields: Record<string, string | undefined>
): void {
  const answered = Object.entries(defined(fields));
  if (answered.length === 0) return;

  lines.push(`  ${name}: {`);
  for (const [field, value] of answered) {
    lines.push(`    ${field}: ${value},`);
  }
  lines.push('  },');
}

export function renderConfigFile(input: ConfigFileInput): string {
  const lines: string[] = [];

  lines.push('/**');
  lines.push(' * MinuteShip project configuration.');
  lines.push(' *');
  lines.push(' * This file decides what the site is: its type, the modules it');
  lines.push(' * includes, and its brand. Routes, navigation, theme CSS and');
  lines.push(' * `websiteConfig` are all derived from it at build time, so editing');
  lines.push(' * this file is enough — there is nothing else to keep in sync.');
  lines.push(' *');
  lines.push(' * After editing, run `pnpm dev` (or `pnpm build`); the generated');
  lines.push(' * artifacts are rebuilt from this file. Keep it plain data: it is');
  lines.push(' * imported by code that reaches the browser, so a value import here');
  lines.push(' * would ship whatever it pulls in.');
  lines.push(' */');
  lines.push('');
  lines.push(
    "import type { MinuteshipConfig } from './src/config/project-config.ts';"
  );
  lines.push('');
  lines.push('export const config: MinuteshipConfig = {');
  lines.push(`  preset: ${quote(input.preset)},`);
  lines.push('  modules: [');
  for (const key of input.modules) lines.push(`    ${quote(key)},`);
  lines.push('  ],');
  lines.push('  site: {');
  lines.push(`    name: ${quote(input.site.name)},`);
  lines.push(`    title: ${quote(input.site.title)},`);
  lines.push(`    description: ${quote(input.site.description)},`);
  lines.push(`    url: ${quote(input.site.url)},`);
  lines.push(`    locales: [${input.site.locales.map(quote).join(', ')}],`);
  if (input.site.supportEmail) {
    lines.push(`    supportEmail: ${quote(input.site.supportEmail)},`);
  }

  const localized = Object.entries(input.site.localized ?? {}).filter(
    ([, value]) => value.title !== undefined || value.description !== undefined
  );
  if (localized.length > 0) {
    lines.push('    localized: {');
    for (const [locale, value] of localized) {
      lines.push(`      ${locale}: {`);
      if (value.title !== undefined) {
        lines.push(`        title: ${quote(value.title)},`);
      }
      if (value.description !== undefined) {
        lines.push(`        description: ${quote(value.description)},`);
      }
      lines.push('      },');
    }
    lines.push('    },');
  }
  lines.push('  },');

  if (input.ctaRoute) {
    lines.push(`  ctaRoute: ${quote(input.ctaRoute)},`);
  }

  if (input.payment) {
    lines.push('  payment: {');
    lines.push(`    provider: ${quote(input.payment.provider)},`);
    lines.push('  },');
  }

  // Module settings. Each block is written only when the project actually has
  // that module, so a tools site's config does not carry an `auth` block it
  // will never read.
  const has = (key: string) => input.modules.includes(key);
  const bool = (value: boolean | undefined) =>
    value === undefined ? undefined : String(value);
  const str = (value: string | undefined) =>
    value === undefined ? undefined : quote(value);

  if (has('auth')) {
    pushBlock(lines, 'auth', {
      googleLogin: bool(input.auth?.googleLogin),
      credentialLogin: bool(input.auth?.credentialLogin),
      deleteAccount: bool(input.auth?.deleteAccount),
    });
  }

  if (has('mail')) {
    pushBlock(lines, 'mail', {
      provider: str(input.mail?.provider),
      fromEmail: str(input.mail?.fromEmail),
      // The visible address lives on `site`, so every page can show it whether
      // or not this project can send mail. Writing it here too would be a
      // second copy of the same string.
    });
  }

  if (has('newsletter')) {
    pushBlock(lines, 'newsletter', {
      provider: str(input.newsletter?.provider),
      autoSubscribeAfterSignUp: bool(input.newsletter?.autoSubscribeAfterSignUp),
    });
  }

  if (has('notification')) {
    pushBlock(lines, 'notification', {
      provider: str(input.notification?.provider),
    });
  }

  lines.push(`  theme: ${quote(input.theme)},`);
  lines.push('};');
  lines.push('');

  return lines.join('\n');
}

/**
 * Modules to write into the config, deduplicated, in the order chosen.
 *
 * Dependencies are *not* expanded here: the template's `resolveModules` does
 * that at build time, and duplicating the expansion in the CLI would mean two
 * implementations to keep in step. The file records the user's choice.
 */
export function configModules(modules: readonly string[]): string[] {
  return [...new Set(modules)];
}
