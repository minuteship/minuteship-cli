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
  // Editor and local-tool caches. The template's own checkout has these, and a
  // generated project should not inherit one machine's editor state.
  '.idea',
  '.code-review-graph',
  '.vscode-test',
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
