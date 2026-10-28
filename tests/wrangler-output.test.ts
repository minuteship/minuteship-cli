import { describe, expect, it } from 'vitest';
import {
  parseD1DatabaseId,
  parseKvNamespaceId,
  parseR2BucketName,
} from '../src/cloudflare.js';

/**
 * Real wrangler 4 output, captured from the commands the adapter runs.
 *
 * These are worth pinning because the commands disagree about machine-readable
 * flags — `d1 list` accepts `--json`, while every `create`, `kv namespace list`
 * and `r2 bucket list` reject it. So the adapter has to read human output, and
 * the shapes below are the contract.
 */

const D1_CREATE = `To access your new D1 Database in your Worker, add the following snippet to your configuration file:
{
  "d1_databases": [
    {
      "binding": "minuteship_website",
      "database_name": "minuteship-website",
      "database_id": "d2bcb2a0-13f9-4fa3-93d2-e3339419e7fc"
    }
  ]
}
? Would you like Wrangler to add it on your behalf?
🤖 Using fallback value in non-interactive context: no`;

const KV_CREATE = `🌀 Creating namespace with title "MINUTESHIP_WEBSITE_CACHE"
✨ Success!
To access your new KV Namespace in your Worker, add the following snippet to your configuration file:
{
  "kv_namespaces": [
    {
      "binding": "MINUTESHIP_WEBSITE_CACHE",
      "id": "0a686088ed284fd59da629796aa41caf"
    }
  ]
}`;

describe('parsing wrangler create output', () => {
  it('reads the D1 id, ignoring the interactive prompt', () => {
    expect(parseD1DatabaseId(D1_CREATE)).toBe(
      'd2bcb2a0-13f9-4fa3-93d2-e3339419e7fc'
    );
  });

  it('reads the KV id from the snippet', () => {
    expect(parseKvNamespaceId(KV_CREATE)).toBe(
      '0a686088ed284fd59da629796aa41caf'
    );
  });

  it('does not mistake the account id for a namespace id', () => {
    // `kv namespace list` output includes no account id, but wrangler prints
    // one on other commands; the 32-hex pattern is what keeps them apart.
    const withAccount = 'Account ID: 45ad027180ebcdfb75f38b61036ac042';
    expect(parseKvNamespaceId(withAccount)).toBeUndefined();
  });

  it('falls back to the requested name when R2 prints no snippet', () => {
    expect(parseR2BucketName('', 'minuteship-website')).toBe(
      'minuteship-website'
    );
  });
});

describe('parsing r2 bucket list', () => {
  const LIST = `Listing buckets...
name:           minuteship
creation_date:  2026-10-28T00:08:41.894Z
name:           other-bucket
creation_date:  2026-10-01T11:41:00.000Z`;

  it('reads one name per line', () => {
    expect([...LIST.matchAll(/^name:\s+(\S+)$/gm)].map((m) => m[1])).toEqual([
      'minuteship',
      'other-bucket',
    ]);
  });

  it('does not match the creation_date line', () => {
    const names = [...LIST.matchAll(/^name:\s+(\S+)$/gm)].map((m) => m[1]);
    expect(names).not.toContain('creation_date:');
  });
});
