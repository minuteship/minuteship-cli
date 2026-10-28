import {
  parseD1DatabaseId,
  parseKvNamespaceId,
  parseR2BucketName,
  summarizeCommandError,
} from '../cloudflare.js';
import type { PackageManager } from '../types.js';
import { wranglerRun } from './wrangler.js';

export interface CloudflareResourceInput {
  targetDir: string;
  packageManager: PackageManager;
  databaseName: string;
  bucketName: string;
  kvName: string;
  /**
   * Bindings the project actually reads. A tool site with no storage has no
   * bucket, and creating one anyway leaves an orphan in the account that
   * `delete` has no reason to remove.
   */
  bindings?: { d1: boolean; r2: boolean; kv: boolean };
  log?: (message: string) => void;
}

export interface CloudflareResources {
  /** Present only when the project's modules read D1. */
  databaseId?: string;
  databaseName?: string;
  bucketName?: string;
  kvNamespaceId?: string;
}

function wrangler(
  input: CloudflareResourceInput,
  args: string[],
  options: { allowFailure?: boolean } = {}
) {
  return wranglerRun(
    { targetDir: input.targetDir, packageManager: input.packageManager },
    args,
    { allowFailure: options.allowFailure ?? false }
  );
}

function parseJsonArray<T>(stdout: string): T[] {
  try {
    const parsed = JSON.parse(stdout) as unknown;
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
}

async function ensureD1(
  input: CloudflareResourceInput
): Promise<{ id: string; name: string }> {
  const list = await wrangler(
    input,
    ['d1', 'list', '--json'],
    { allowFailure: true }
  );

  const existing = parseJsonArray<{ uuid?: string; name?: string }>(list.stdout)
    .find((database) => database.name === input.databaseName);

  if (existing?.uuid) {
    input.log?.(`Reusing D1 database ${input.databaseName}.`);
    return { id: existing.uuid, name: input.databaseName };
  }

  input.log?.(`Creating D1 database ${input.databaseName}…`);
  const created = await wrangler(input, [
    'd1',
    'create',
    input.databaseName,
    '--json',
  ]);
  const id = parseD1DatabaseId(created.stdout);
  if (!id) {
    throw new Error(
      `Could not read the D1 database id from wrangler output: ${summarizeCommandError(created.stdout)}`
    );
  }
  return { id, name: input.databaseName };
}

async function ensureKv(input: CloudflareResourceInput): Promise<string> {
  const list = await wrangler(
    input,
    ['kv', 'namespace', 'list', '--json'],
    { allowFailure: true }
  );

  const existing = parseJsonArray<{ id?: string; title?: string }>(list.stdout)
    .find((namespace) => namespace.title === input.kvName);

  if (existing?.id) {
    input.log?.(`Reusing KV namespace ${input.kvName}.`);
    return existing.id;
  }

  input.log?.(`Creating KV namespace ${input.kvName}…`);
  const created = await wrangler(input, [
    'kv',
    'namespace',
    'create',
    input.kvName,
    '--json',
  ]);
  const id = parseKvNamespaceId(created.stdout);
  if (!id) {
    throw new Error(
      `Could not read the KV namespace id from wrangler output: ${summarizeCommandError(created.stdout)}`
    );
  }
  return id;
}

async function ensureR2(input: CloudflareResourceInput): Promise<string> {
  const list = await wrangler(
    input,
    ['r2', 'bucket', 'list', '--json'],
    { allowFailure: true }
  );

  const existing = parseJsonArray<{ name?: string }>(list.stdout).find(
    (bucket) => bucket.name === input.bucketName
  );
  if (existing?.name) {
    input.log?.(`Reusing R2 bucket ${input.bucketName}.`);
    return existing.name;
  }

  input.log?.(`Creating R2 bucket ${input.bucketName}…`);
  const created = await wrangler(
    input,
    ['r2', 'bucket', 'create', input.bucketName],
    { allowFailure: true }
  );

  if (created.exitCode !== 0) {
    const summary = summarizeCommandError(created.stderr);
    // Creating an existing bucket is not an error for an idempotent step.
    if (!/already exists|already owned|10004/i.test(summary)) {
      throw new Error(`wrangler r2 bucket create failed: ${summary}`);
    }
  }

  return parseR2BucketName(created.stdout, input.bucketName);
}

/**
 * Create the bindings the project's modules need, reusing anything that already
 * exists under the same name. Safe to re-run.
 */
export async function ensureCloudflareResources(
  input: CloudflareResourceInput
): Promise<CloudflareResources> {
  const bindings = input.bindings ?? { d1: true, r2: true, kv: true };
  const resources: CloudflareResources = {};

  if (bindings.d1) {
    const database = await ensureD1(input);
    resources.databaseId = database.id;
    resources.databaseName = database.name;
  }
  if (bindings.r2) {
    resources.bucketName = await ensureR2(input);
  }
  if (bindings.kv) {
    resources.kvNamespaceId = await ensureKv(input);
  }

  return resources;
}
