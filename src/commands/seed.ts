import { chmod, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { sqlString } from '../adapters/better-auth.js';
import { wranglerRun } from '../adapters/wrangler.js';
import type { Logger } from '../log.js';
import type { PackageManager } from '../types.js';

/**
 * Copy provider price ids from `.env.production` into D1's `payment_price`
 * table.
 *
 * The Worker needs those rows to resolve `{ planId, interval }` for whichever
 * provider is active. Build-time env vars only describe the provider chosen at
 * scaffolding time; a later failover reads the catalog from the database.
 */

const PRICE_ENV_PREFIX: Record<string, string> = {
  stripe: 'VITE_STRIPE_PRICE_',
  creem: 'VITE_CREEM_PRODUCT_',
  waffo: 'VITE_WAFFO_PRODUCT_',
};

/** Must match `catalogKey()` in the template. */
const PLAN_KEY_BY_SUFFIX: Record<string, string> = {
  PRO_MONTHLY: 'pro-monthly',
  PRO_YEARLY: 'pro-yearly',
  LIFETIME: 'lifetime',
};

export interface PriceRow {
  planKey: string;
  priceId: string;
}

export function collectPriceRows(
  provider: string,
  env: Record<string, string>
): PriceRow[] {
  const prefix = PRICE_ENV_PREFIX[provider];
  if (!prefix) return [];

  const rows: PriceRow[] = [];
  for (const [name, value] of Object.entries(env)) {
    if (!name.startsWith(prefix)) continue;
    const planKey = PLAN_KEY_BY_SUFFIX[name.slice(prefix.length)];
    const priceId = value.trim();
    if (!planKey || !priceId) continue;
    rows.push({ planKey, priceId });
  }

  return rows.sort((a, b) => a.planKey.localeCompare(b.planKey));
}

/** Idempotent upsert: re-running a deploy refreshes ids without duplicates. */
export function buildPaymentPriceSql(
  provider: string,
  rows: PriceRow[],
  now = Date.now()
): string {
  const values = rows
    .map(
      (row) =>
        `  (${sqlString(provider)}, ${sqlString(row.planKey)}, ${sqlString(
          row.priceId
        )}, ${now})`
    )
    .join(',\n');

  return [
    'INSERT INTO payment_price (provider, plan_key, price_id, updated_at) VALUES',
    values,
    'ON CONFLICT(provider, plan_key) DO UPDATE SET',
    '  price_id = excluded.price_id,',
    '  updated_at = excluded.updated_at;',
    '',
  ].join('\n');
}

export interface SeedPricesInput {
  targetDir: string;
  packageManager: PackageManager;
  databaseName: string;
  /** Provider that owns these price ids; empty when payment is disabled. */
  provider: string;
  /** Parsed `.env.production`. */
  env: Record<string, string>;
  logger: Logger;
}

export interface SeedPricesResult {
  provider: string;
  keys: string[];
}

export async function seedPaymentPrices(
  input: SeedPricesInput
): Promise<SeedPricesResult> {
  const rows = collectPriceRows(input.provider, input.env);
  if (rows.length === 0) {
    input.logger.verbose(
      `No ${input.provider || 'payment provider'} price ids to seed.`
    );
    return { provider: input.provider, keys: [] };
  }

  const dir = await mkdtemp(path.join(tmpdir(), 'minuteship-prices-'));
  const file = path.join(dir, 'prices.sql');

  try {
    await writeFile(file, buildPaymentPriceSql(input.provider, rows), {
      encoding: 'utf8',
      mode: 0o600,
    });
    await chmod(file, 0o600);

    const result = await wranglerRun(
      { targetDir: input.targetDir, packageManager: input.packageManager },
      [
        'd1',
        'execute',
        input.databaseName,
        '--remote',
        '--file',
        file,
        '--json',
      ],
      { allowFailure: true }
    );

    if (result.exitCode !== 0) {
      throw new Error(
        `Could not seed payment prices: ${
          result.stderr.trim().split('\n')[0] ?? 'unknown error'
        }`
      );
    }
  } finally {
    await rm(dir, { recursive: true, force: true });
  }

  const keys = rows.map((row) => row.planKey);
  input.logger.info(
    `Seeded ${rows.length} price ids for ${input.provider}: ${keys.join(', ')}`
  );
  return { provider: input.provider, keys };
}
