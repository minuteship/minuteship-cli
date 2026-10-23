import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  copyTemplate,
  createEnvLocal,
  generateAuthSecret,
  pathExists,
  rewritePackageJson,
  rewriteSiteMessages,
  rewriteWebsiteConfig,
  rewriteWranglerConfig,
  shouldExclude,
} from '../src/files.js';
import {
  parseD1DatabaseId,
  parseKvNamespaceId,
  parseR2BucketName,
  summarizeCommandError,
} from '../src/cloudflare.js';

const WRANGLER_FIXTURE = `{
  "$schema": "node_modules/wrangler/config-schema.json",
  "name": "minuteship",
  // keep this comment
  "triggers": {
    "crons": ["17 3 * * *"]
  },
  "routes": [
    {
      "pattern": "demo.example.com",
      "custom_domain": true
    }
  ],
  "d1_databases": [
    {
      "binding": "DB",
      "database_name": "minuteship",
      "database_id": "00000000-0000-4000-8000-000000000001",
      "migrations_dir": "./src/db/migrations"
    }
  ],
  "r2_buckets": [
    {
      "bucket_name": "minuteship",
      "binding": "BUCKET"
    }
  ],
  "kv_namespaces": [
    {
      "binding": "CACHE",
      "id": "0123456789abcdef0123456789abcdef"
    }
  ]
}
`;

const WEBSITE_FIXTURE = `export const websiteConfig = {
  social: {
    github: 'https://github.com/example',
    discord: 'https://discord.gg/example',
    twitter: 'https://x.com/example',
    youtube: 'https://www.youtube.com/@example',
  },
  docs: {
    enable: true,
  },
  newsletter: {
    enable: true,
  },
  payment: {
    enable: true,
    provider: isPaymentEnabled ? paymentProvider : undefined,
  },
  credits: {
    enable: true,
    costs: {
      summarizeText: 1,
    },
  },
};
`;

describe('shouldExclude', () => {
  it('keeps application source files', () => {
    expect(shouldExclude('src/routes/index.tsx')).toBe(false);
    expect(shouldExclude('content/docs/faq.md')).toBe(false);
    expect(shouldExclude('.env.example')).toBe(false);
  });

  it('drops build output, dependencies, and local secrets', () => {
    for (const relativePath of [
      'node_modules/react/index.js',
      'dist/index.html',
      '.wrangler/state/v3/d1.sqlite',
      '.tanstack/router/tree.json',
      '.content-collections/generated/index.js',
      'src/locale/paraglide/messages.js',
      '.env',
      '.env.local',
      '.env.production',
      '.env.test',
      '.env.e2e',
      '.dev.vars',
      '.minuteship/state.json',
      'playwright-report/index.html',
      '.worker-configuration.d.ts.swp',
      'packages/create-minuteship/package.json',
    ]) {
      expect(shouldExclude(relativePath)).toBe(true);
    }
  });

  it('keeps .env.example but drops .env.* files', () => {
    expect(shouldExclude('.env.example')).toBe(false);
    expect(shouldExclude('.env.development')).toBe(true);
  });
});

describe('copyTemplate', () => {
  it('copies only the allowed files', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'ct-copy-'));
    const source = path.join(root, 'template');
    const target = path.join(root, 'project');

    await mkdir(path.join(source, 'src'), { recursive: true });
    await mkdir(path.join(source, 'node_modules', 'dep'), { recursive: true });
    await writeFile(path.join(source, 'src', 'index.ts'), 'export {};\n');
    await writeFile(path.join(source, '.env.example'), "A=''\n");
    await writeFile(path.join(source, '.env'), 'SECRET=1\n');
    await writeFile(
      path.join(source, 'node_modules', 'dep', 'index.js'),
      'module.exports = 1;\n'
    );

    await copyTemplate(source, target);

    expect(await pathExists(path.join(target, 'src', 'index.ts'))).toBe(true);
    expect(await pathExists(path.join(target, '.env.example'))).toBe(true);
    expect(await pathExists(path.join(target, '.env'))).toBe(false);
    expect(await pathExists(path.join(target, 'node_modules'))).toBe(false);
  });
});

describe('rewriteWranglerConfig', () => {
  it('renames resources, keeps comments, and removes the demo domain', () => {
    const result = rewriteWranglerConfig(WRANGLER_FIXTURE, {
      projectName: 'acme',
      databaseId: '11111111-2222-3333-4444-555555555555',
      databaseName: 'acme-db',
      bucketName: 'acme-bucket',
      kvNamespaceId: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    });

    expect(result).toContain('// keep this comment');
    expect(result).toContain('"name": "acme"');
    expect(result).toContain('"database_name": "acme-db"');
    expect(result).toContain(
      '"database_id": "11111111-2222-3333-4444-555555555555"'
    );
    expect(result).toContain('"bucket_name": "acme-bucket"');
    expect(result).toContain('"id": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"');
    expect(result).not.toContain('demo.example.com');
    expect(result).not.toContain('minuteship');
    expect(result).toContain('"crons": ["17 3 * * *"]');
  });

  it('leaves clear placeholders when resources were not created', () => {
    const result = rewriteWranglerConfig(WRANGLER_FIXTURE, {
      projectName: 'acme',
    });

    expect(result).toContain('REPLACE_WITH_D1_DATABASE_ID');
    expect(result).toContain('REPLACE_WITH_KV_NAMESPACE_ID');
  });

  it('rejects invalid JSONC', () => {
    expect(() =>
      rewriteWranglerConfig('{ "name": ', { projectName: 'acme' })
    ).toThrow(/not valid JSONC/);
  });
});

describe('rewritePackageJson / rewriteCtaJson', () => {
  it('renames the package and drops the inherited packageManager field', () => {
    const result = rewritePackageJson(
      JSON.stringify({
        name: 'minuteship',
        packageManager: 'pnpm@10.30.3',
        private: true,
      }),
      'acme'
    );

    expect(JSON.parse(result)).toEqual({ name: 'acme', private: true });
  });
});

describe('rewriteWebsiteConfig', () => {
  it('clears demo links and applies feature flags', () => {
    const result = rewriteWebsiteConfig(WEBSITE_FIXTURE, {
      paymentProvider: 'stripe',
      enableDocs: false,
      enableCredits: false,
    });

    expect(result).not.toContain('MinuteShip');
    expect(result).not.toContain('discord.gg/example');
    expect(result).toContain(`github: ''`);
    expect(result).toMatch(/docs: \{\n\s*enable: false,\n\s*\},/);
    expect(result).toMatch(/credits: \{\n\s*enable: false,/);
    expect(result).toMatch(/payment: \{\n\s*enable: true,/);
  });

  it('disables payment when no provider was chosen', () => {
    const result = rewriteWebsiteConfig(WEBSITE_FIXTURE, {
      paymentProvider: '',
      enableDocs: true,
      enableCredits: true,
    });

    expect(result).toMatch(/payment: \{\n\s*enable: false,/);
  });

  it('fails loudly when a marker is missing', () => {
    expect(() =>
      rewriteWebsiteConfig('export const websiteConfig = {};', {
        paymentProvider: '',
        enableDocs: true,
        enableCredits: true,
      })
    ).toThrow(/social block/);
  });
});

describe('rewriteSiteMessages', () => {
  it('replaces the demo site metadata', () => {
    const source = JSON.stringify({
      site_name: 'MinuteShip Demo',
      site_title: 'MinuteShip',
      site_description: 'MinuteShip description',
      other_key: 'unchanged',
    });

    const result = JSON.parse(
      rewriteSiteMessages(source, { siteName: 'Acme' })
    ) as Record<string, string>;

    expect(result.site_name).toBe('Acme');
    expect(result.site_title).toBe('Acme');
    expect(result.site_description).toBe('Acme is built with MinuteShip.');
    expect(result.other_key).toBe('unchanged');
  });

  it('rejects message files without site_name', () => {
    expect(() =>
      rewriteSiteMessages(JSON.stringify({ other: 'x' }), {
        siteName: 'Acme',
      })
    ).toThrow(/site_name/);
  });
});

describe('createEnvLocal', () => {
  it('fills in the auth secret and keeps placeholders', () => {
    const source = [
      "VITE_BASE_URL='http://localhost:3000'",
      "BETTER_AUTH_SECRET=''",
      "STRIPE_SECRET_KEY=''",
      '',
    ].join('\n');

    const result = createEnvLocal(source, { authSecret: 'abc123' });

    expect(result).toContain("BETTER_AUTH_SECRET='abc123'");
    expect(result).toContain("STRIPE_SECRET_KEY=''");
    expect(result.endsWith('\n')).toBe(true);
    expect(result).not.toContain('\n\n\n');
  });

  it('generates a 64 character hex secret', () => {
    const secret = generateAuthSecret(new Uint8Array(32).fill(7));
    expect(secret).toHaveLength(64);
    expect(secret).toBe('07'.repeat(32));
  });
});

describe('Cloudflare output parsing', () => {
  it('parses D1 ids from human and JSON output', () => {
    expect(
      parseD1DatabaseId(
        'd1_databases:\n  - database_id = "00000000-0000-4000-8000-000000000001"'
      )
    ).toBe('00000000-0000-4000-8000-000000000001');
    expect(
      parseD1DatabaseId('{\n  "database_id": "00000000-0000-4000-8000-000000000001"\n}')
    ).toBe('00000000-0000-4000-8000-000000000001');
    expect(parseD1DatabaseId('no id here')).toBeUndefined();
  });

  it('parses KV namespace ids', () => {
    expect(
      parseKvNamespaceId(
        'kv_namespaces:\n  - id = "0123456789abcdef0123456789abcdef"'
      )
    ).toBe('0123456789abcdef0123456789abcdef');
    expect(parseKvNamespaceId('failed')).toBeUndefined();
  });

  it('falls back to the project name for buckets', () => {
    expect(parseR2BucketName('', 'acme')).toBe('acme');
  });

  it('summarizes command errors without dumping the whole log', () => {
    const summary = summarizeCommandError('\n\n  Authentication error  \nmore');
    expect(summary).toBe('Authentication error');
    expect(summarizeCommandError('')).toBe('unknown error');
  });
});
