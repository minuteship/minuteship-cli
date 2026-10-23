import { copyFile, mkdir, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import {
  applyEdits,
  modify,
  parse as parseJsonc,
  type ParseError,
  printParseErrorCode,
} from 'jsonc-parser';
import type { PackageManager } from './types.js';

/** Never copy these into a generated project. */
const EXCLUDED_DIRECTORIES = new Set([
  '.git',
  'node_modules',
  '.wrangler',
  'dist',
  '.output',
  '.tanstack',
  '.content-collections',
  'playwright-report',
  'test-results',
  '.minuteship',
]);

const EXCLUDED_FILES = new Set(['.DS_Store', 'auth.schema.backup.ts']);

/**
 * Local secrets and CLI state must never reach a generated project.
 * `.env.example` is the only env file the template ships on purpose, so it is
 * the one exception to the `.env*` rule.
 */
function isExcludedEnvFile(fileName: string): boolean {
  if (fileName === '.env.example') return false;
  return fileName === '.dev.vars' || fileName.startsWith('.env');
}

const EXCLUDED_PATH_PREFIXES = [
  'src/locale/paraglide',
  'packages/',
  '.worker-configuration.d.ts',
];

/**
 * Decide whether a template path is copied into the new project.
 * Paths are relative to the template root and use forward slashes.
 */
export function shouldExclude(relativePath: string): boolean {
  const normalized = relativePath.split(path.sep).join('/');

  if (!normalized) return true;
  if (EXCLUDED_PATH_PREFIXES.some((prefix) => normalized.startsWith(prefix))) {
    return true;
  }

  const segments = normalized.split('/');
  if (segments.some((segment) => EXCLUDED_DIRECTORIES.has(segment))) {
    return true;
  }

  const fileName = segments[segments.length - 1] ?? '';
  if (EXCLUDED_FILES.has(fileName)) return true;
  if (isExcludedEnvFile(fileName)) return true;
  if (fileName.endsWith('.tsbuildinfo')) return true;
  if (fileName.endsWith('.swp')) return true;

  return false;
}

/** Copy a template directory, skipping build output and local secrets. */
export async function copyTemplate(
  sourceDir: string,
  targetDir: string,
  options: { ignore?: (relativePath: string) => boolean } = {}
): Promise<void> {
  const isIgnored = (relativePath: string) =>
    shouldExclude(relativePath) || (options.ignore?.(relativePath) ?? false);

  const walk = async (relativeDir: string) => {
    const absoluteDir = path.join(sourceDir, relativeDir);
    const entries = await readdir(absoluteDir, { withFileTypes: true });
    await mkdir(path.join(targetDir, relativeDir), { recursive: true });

    for (const entry of entries) {
      const relativePath = relativeDir
        ? `${relativeDir}/${entry.name}`
        : entry.name;
      if (isIgnored(relativePath)) continue;

      if (entry.isDirectory()) {
        await walk(relativePath);
        continue;
      }

      if (entry.isSymbolicLink()) continue;

      await copyFile(
        path.join(sourceDir, relativePath),
        path.join(targetDir, relativePath)
      );
    }
  };

  await walk('');
}

export function applyJsoncEdits(
  source: string,
  edits: Array<(content: string) => string>
): string {
  return edits.reduce((content, edit) => edit(content), source);
}

function editJsonc(
  source: string,
  jsonPath: (string | number)[],
  value: unknown
): string {
  const edits = modify(source, jsonPath, value, {
    formattingOptions: { insertSpaces: true, tabSize: 2 },
  });
  return applyEdits(source, edits);
}

const WRANGLER_SCHEMA_COMMENT = 'node_modules/wrangler/config-schema.json';

export interface WranglerRewriteOptions {
  projectName: string;
  databaseId?: string;
  databaseName?: string;
  bucketName?: string;
  kvNamespaceId?: string;
  /** Bare hostname; written as a custom-domain route. */
  domain?: string;
}

/**
 * Rewrite the Cloudflare Worker config for a new project:
 * - worker name, D1 database name/id, R2 bucket, KV namespace id;
 * - drop the demo custom domain so the generated project never deploys to it.
 */
export function rewriteWranglerConfig(
  source: string,
  options: WranglerRewriteOptions
): string {
  const errors: ParseError[] = [];
  parseJsonc(source, errors, { allowTrailingComma: true });
  if (errors.length > 0) {
    const [first] = errors;
    throw new Error(
      `wrangler.jsonc is not valid JSONC: ${first ? printParseErrorCode(first.error) : 'unknown error'}`
    );
  }

  let content = source;
  content = editJsonc(content, ['name'], options.projectName);

  const database = {
    binding: 'DB',
    database_name: options.databaseName ?? options.projectName,
    database_id: options.databaseId ?? 'REPLACE_WITH_D1_DATABASE_ID',
    migrations_dir: './src/db/migrations',
  };
  content = editJsonc(content, ['d1_databases'], [database]);

  content = editJsonc(content, ['r2_buckets'], [
    {
      bucket_name: options.bucketName ?? options.projectName,
      binding: 'BUCKET',
    },
  ]);

  content = editJsonc(content, ['kv_namespaces'], [
    {
      binding: 'CACHE',
      id: options.kvNamespaceId ?? 'REPLACE_WITH_KV_NAMESPACE_ID',
    },
  ]);

  content = editJsonc(
    content,
    ['routes'],
    options.domain
      ? [{ pattern: options.domain, custom_domain: true }]
      : []
  );

  // Keep the schema reference pointing at the generated project's own
  // node_modules after `pnpm install`.
  return content.replace(
    /"(\$schema)":\s*"[^"]*config-schema\.json"/,
    `"$schema": "${WRANGLER_SCHEMA_COMMENT}"`
  );
}

/**
 * The template pins pnpm through `packageManager`, and its `pnpm.overrides`
 * only work with that major version, so the pin is kept for pnpm projects.
 * Other package managers would refuse to run under a pnpm pin, so it is
 * dropped for them.
 */
export function rewritePackageJson(
  source: string,
  projectName: string,
  packageManager: PackageManager = 'pnpm'
): string {
  const parsed = JSON.parse(source) as Record<string, unknown>;
  parsed.name = projectName;
  if (packageManager !== 'pnpm') {
    delete parsed.packageManager;
  }
  return `${JSON.stringify(parsed, null, 2)}\n`;
}

export function rewriteCtaJson(source: string, projectName: string): string {
  const parsed = JSON.parse(source) as Record<string, unknown>;
  parsed.projectName = projectName;
  return `${JSON.stringify(parsed, null, 2)}\n`;
}

export interface WebsiteRewriteOptions {
  paymentProvider: 'stripe' | 'creem' | 'waffo' | '';
  enableDocs: boolean;
  enableCredits: boolean;
  enableBlog?: boolean;
  enableStorage?: boolean;
  enableCache?: boolean;
  enableNewsletter?: boolean;
  enableNotification?: boolean;
  newsletterProvider?: 'resend' | 'beehiiv' | 'mailcheap';
  notificationProvider?: 'discord' | 'feishu';
  mailProvider?: 'cloudflare' | 'resend';
  mailFromEmail?: string;
  mailSupportEmail?: string;
  autoSubscribeAfterSignUp?: boolean;
  auth?: {
    enableGoogleLogin?: boolean;
    enableGithubLogin?: boolean;
    enableAppleLogin?: boolean;
    enableEmailOtpLogin?: boolean;
    enableCredentialLogin?: boolean;
    enableDeleteAccount?: boolean;
  };
}

function blockPattern(block: string): RegExp {
  return new RegExp(`(${block}:\\s*\\{)([\\s\\S]*?)(\\n {2}\\},)`);
}

/** Replace the body of a top-level config block, failing loudly if missing. */
function editBlock(
  source: string,
  block: string,
  edit: (body: string) => string
): string {
  const pattern = blockPattern(block);
  const match = source.match(pattern);
  if (!match) {
    throw new Error(`Could not find the ${block} block in website.ts`);
  }
  const [, open = '', body = '', close = ''] = match;
  return source.replace(pattern, `${open}${edit(body)}${close}`);
}

function setBoolean(body: string, key: string, value: boolean): string {
  const pattern = new RegExp(
    `(${key}:\\s*)(?:true|false|import\\.meta\\.env\\.MODE !== 'e2e')`
  );
  if (!pattern.test(body)) {
    throw new Error(`Could not find ${key} in website.ts`);
  }
  return body.replace(pattern, `$1${value}`);
}

function setString(body: string, key: string, value: string): string {
  const pattern = new RegExp(`(${key}:\\s*)'[^']*'`);
  if (!pattern.test(body)) {
    throw new Error(`Could not find ${key} in website.ts`);
  }
  return body.replace(pattern, `$1'${value}'`);
}

/**
 * Point the config at the buyer's own project: clear MinuteShip demo/social
 * links and apply the selected feature flags.
 *
 * Optional blocks are only touched when the caller provides a value, so older
 * callers (and fixtures) that only know about docs/credits keep working.
 */
export function rewriteWebsiteConfig(
  source: string,
  options: WebsiteRewriteOptions
): string {
  let content = source;

  content = replaceOnce(
    content,
    /social:\s*\{[\s\S]*?\n {2}\},/,
    `social: {
    github: '',
    discord: '',
    twitter: '',
    youtube: '',
  },`,
    'social'
  );

  content = editBlock(content, 'docs', (body) =>
    setBoolean(body, 'enable', options.enableDocs)
  );

  content = editBlock(content, 'credits', (body) =>
    setBoolean(body, 'enable', options.enableCredits)
  );

  if (options.enableBlog !== undefined) {
    content = editBlock(content, 'blog', (body) =>
      setBoolean(body, 'enable', options.enableBlog as boolean)
    );
  }

  if (options.enableStorage !== undefined) {
    content = editBlock(content, 'storage', (body) =>
      setBoolean(body, 'enable', options.enableStorage as boolean)
    );
  }

  if (options.enableCache !== undefined) {
    content = editBlock(content, 'cache', (body) =>
      setBoolean(body, 'enable', options.enableCache as boolean)
    );
  }

  if (options.enableNewsletter !== undefined) {
    content = editBlock(content, 'newsletter', (body) => {
      let next = setBoolean(body, 'enable', options.enableNewsletter as boolean);
      if (options.newsletterProvider) {
        next = setString(next, 'provider', options.newsletterProvider);
      }
      if (options.autoSubscribeAfterSignUp !== undefined) {
        next = setBoolean(
          next,
          'autoSubscribeAfterSignUp',
          options.autoSubscribeAfterSignUp
        );
      }
      return next;
    });
  }

  if (options.enableNotification !== undefined) {
    content = editBlock(content, 'notification', (body) => {
      let next = setBoolean(
        body,
        'enable',
        options.enableNotification as boolean
      );
      if (options.notificationProvider) {
        next = setString(next, 'provider', options.notificationProvider);
      }
      return next;
    });
  }

  if (
    options.mailProvider !== undefined ||
    options.mailFromEmail !== undefined ||
    options.mailSupportEmail !== undefined
  ) {
    content = editBlock(content, 'mail', (body) => {
      let next = body;
      if (options.mailProvider) {
        next = setString(next, 'provider', options.mailProvider);
      }
      if (options.mailFromEmail) {
        next = setString(next, 'fromEmail', options.mailFromEmail);
      }
      if (options.mailSupportEmail) {
        next = setString(next, 'supportEmail', options.mailSupportEmail);
      }
      return next;
    });
  }

  if (options.auth) {
    content = editBlock(content, 'auth', (body) => {
      let next = body;
      for (const [key, value] of Object.entries(options.auth ?? {})) {
        if (value === undefined) continue;
        next = setBoolean(next, key, value);
      }
      return next;
    });
  }

  if (options.paymentProvider === '') {
    content = disablePayment(content);
  }

  return content;
}

function disablePayment(source: string): string {
  const pattern = /(payment:\s*\{\s*\n\s*enable:\s*)([^,\n]+)(,)/;
  if (!pattern.test(source)) {
    throw new Error('Could not find the payment.enable marker in website.ts');
  }
  return source.replace(pattern, '$1false$3');
}

function replaceOnce(
  source: string,
  pattern: RegExp,
  replacement: string,
  label: string
): string {
  if (!pattern.test(source)) {
    throw new Error(`Could not find the ${label} block in website.ts`);
  }
  return source.replace(pattern, replacement);
}

/**
 * Site metadata is read from the locale message files, so the generated
 * project's name lives there rather than in website.ts.
 */
export function rewriteSiteMessages(
  source: string,
  options: { siteName: string }
): string {
  const messages = JSON.parse(source) as Record<string, string>;
  if (!('site_name' in messages)) {
    throw new Error('Could not find site_name in the locale messages');
  }

  messages.site_name = options.siteName;
  messages.site_title = options.siteName;
  messages.site_description = `${options.siteName} is built with MinuteShip.`;

  return `${JSON.stringify(messages, null, 2)}\n`;
}

export function generateAuthSecret(randomBytes: Uint8Array): string {
  return Array.from(randomBytes, (byte) =>
    byte.toString(16).padStart(2, '0')
  ).join('');
}

/**
 * Build `.env.local` from `.env.example`: keep the documented keys, drop
 * placeholders for the demo deployment, and fill in a fresh auth secret.
 */
export function createEnvLocal(
  exampleSource: string,
  options: { authSecret: string }
): string {
  const lines = exampleSource.split('\n').map((line) => {
    if (/^BETTER_AUTH_SECRET=/.test(line)) {
      return `BETTER_AUTH_SECRET='${options.authSecret}'`;
    }
    return line;
  });

  return `${lines.join('\n').replace(/\n+$/, '')}\n`;
}

export async function pathExists(targetPath: string): Promise<boolean> {
  try {
    await stat(targetPath);
    return true;
  } catch {
    return false;
  }
}
