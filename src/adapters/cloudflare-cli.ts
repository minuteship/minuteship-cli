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

/**
 * Create a resource unless one with this name already exists.
 *
 * `wrangler create` is not idempotent — a second run fails on the name clash —
 * so an existing resource is discovered first and reused. A failed create is
 * only fatal when it is not the "already exists" case, which can still happen
 * when the list call was rate-limited or blocked.
 */
async function ensureD1(
  input: CloudflareResourceInput
): Promise<{ id: string; name: string }> {
  const list = await wrangler(input, ['d1', 'list', '--json'], {
    allowFailure: true,
  });

  const existing = parseJsonArray<{ uuid?: string; name?: string }>(
    list.stdout
  ).find((database) => database.name === input.databaseName);

  if (existing?.uuid) {
    input.log?.(`Reusing D1 database ${input.databaseName}.`);
    return { id: existing.uuid, name: input.databaseName };
  }

  input.log?.(`Creating D1 database ${input.databaseName}…`);
  const created = await wrangler(
    input,
    ['d1', 'create', input.databaseName],
    { allowFailure: true }
  );

  // `d1 create` prints a config snippet on success and an error on a clash;
  // both are parsed the same way because the id is what matters.
  const id = parseD1DatabaseId(created.stdout + created.stderr);
  if (id) return { id, name: input.databaseName };

  if (created.exitCode === 0) {
    throw new Error(
      `Could not read the D1 database id from wrangler output: ${summarizeCommandError(created.stdout)}`
    );
  }

  // A clash here means the list call above did not see it (rate limit, or a
  // name owned by another account). Re-listing is the only way to get its id.
  const retry = await wrangler(input, ['d1', 'list', '--json'], {
    allowFailure: true,
  });
  const found = parseJsonArray<{ uuid?: string; name?: string }>(
    retry.stdout
  ).find((database) => database.name === input.databaseName);
  if (found?.uuid) {
    input.log?.(`Reusing D1 database ${input.databaseName}.`);
    return { id: found.uuid, name: input.databaseName };
  }

  throw new Error(
    `wrangler d1 create failed: ${summarizeCommandError(created.stderr)}`
  );
}

async function ensureKv(input: CloudflareResourceInput): Promise<string> {
  // `kv namespace list` prints JSON by default; it has no `--json` flag, and
  // passing one fails the command outright on wrangler 4.
  const list = await wrangler(input, ['kv', 'namespace', 'list'], {
    allowFailure: true,
  });

  const existing = parseJsonArray<{ id?: string; title?: string }>(
    list.stdout
  ).find((namespace) => namespace.title === input.kvName);

  if (existing?.id) {
    input.log?.(`Reusing KV namespace ${input.kvName}.`);
    return existing.id;
  }

  input.log?.(`Creating KV namespace ${input.kvName}…`);
  const created = await wrangler(
    input,
    ['kv', 'namespace', 'create', input.kvName],
    { allowFailure: true }
  );

  const id = parseKvNamespaceId(created.stdout + created.stderr);
  if (id) return id;

  if (created.exitCode === 0) {
    throw new Error(
      `Could not read the KV namespace id from wrangler output: ${summarizeCommandError(created.stdout)}`
    );
  }

  throw new Error(
    `wrangler kv namespace create failed: ${summarizeCommandError(created.stderr)}`
  );
}

async function ensureR2(input: CloudflareResourceInput): Promise<string> {
  // `r2 bucket list` prints `name:  <bucket>` lines; it accepts no `--json`.
  const list = await wrangler(input, ['r2', 'bucket', 'list'], {
    allowFailure: true,
  });

  const existing = [...list.stdout.matchAll(/^name:\s+(\S+)$/gm)]
    .map((match) => match[1])
    .find((name) => name === input.bucketName);

  if (existing) {
    input.log?.(`Reusing R2 bucket ${input.bucketName}.`);
    return existing;
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
