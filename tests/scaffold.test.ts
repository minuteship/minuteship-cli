import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { applyTemplateRewrites } from '../src/scaffold.js';
import type { TemplateRewriteOptions } from '../src/scaffold.js';

const options: TemplateRewriteOptions = {
  projectName: 'acme',
  preset: 'saas',
  modules: ['auth', 'payment', 'blog'],
  theme: 'ocean',
  site: {
    name: "Acme's SaaS",
    title: 'Acme - ship faster',
    description: 'Acme is a SaaS built with MinuteShip.',
    url: 'https://acme.example.com',
    locales: ['en', 'zh'],
  },
  packageManager: 'pnpm',
  authSecret: 'a'.repeat(64),
  domain: 'acme.example.com',
  payment: { provider: 'stripe' },
};

async function writeFixture(root: string) {
  const files: Record<string, string> = {
    'package.json': JSON.stringify({
      name: 'minuteship',
      packageManager: 'pnpm@10.30.3',
      private: true,
      dependencies: {},
    }),
    '.cta.json': JSON.stringify({ projectName: 'minuteship' }),
    'wrangler.jsonc': `{
  // template comment
  "name": "minuteship",
  "d1_databases": [
    {
      "binding": "DB",
      "database_name": "minuteship",
      "database_id": "00000000-0000-4000-8000-000000000001"
    }
  ],
  "r2_buckets": [{ "bucket_name": "minuteship", "binding": "BUCKET" }],
  "kv_namespaces": [{ "binding": "CACHE", "id": "0123456789abcdef0123456789abcdef" }],
  "routes": []
}
`,
    '.env.example': [
      "VITE_BASE_URL='http://localhost:3000'",
      "BETTER_AUTH_SECRET=''",
      '',
    ].join('\n'),
  };

  for (const [relativePath, content] of Object.entries(files)) {
    await writeFile(path.join(root, relativePath), content);
  }
}

describe('applyTemplateRewrites', () => {
  it('rewrites identity, infrastructure and the project config', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'ct-scaffold-'));
    await writeFixture(root);

    await applyTemplateRewrites(root, options);

    const packageJson = JSON.parse(
      await readFile(path.join(root, 'package.json'), 'utf8')
    ) as Record<string, unknown>;
    expect(packageJson.name).toBe('acme');
    expect(packageJson.packageManager).toBe('pnpm@10.30.3');

    const cta = JSON.parse(
      await readFile(path.join(root, '.cta.json'), 'utf8')
    ) as Record<string, unknown>;
    expect(cta.projectName).toBe('acme');

    const wrangler = await readFile(path.join(root, 'wrangler.jsonc'), 'utf8');
    expect(wrangler).toContain('// template comment');
    expect(wrangler).toContain('"name": "acme"');
    expect(wrangler).toContain('"pattern": "acme.example.com"');

    const config = await readFile(
      path.join(root, 'minuteship.config.ts'),
      'utf8'
    );
    expect(config).toContain(
      "import type { MinuteshipConfig } from './src/config/project-config.ts';"
    );
    expect(config).toContain("preset: 'saas'");
    expect(config).toContain("theme: 'ocean'");
    expect(config).toContain("    'auth',");
    expect(config).toContain("    'payment',");
    expect(config).toContain("    'blog',");
    // Site names are user data, so they must survive quoting verbatim.
    expect(config).toContain("name: 'Acme\\'s SaaS'");
    expect(config).toContain("provider: 'stripe'");

    const envLocal = await readFile(path.join(root, '.env.local'), 'utf8');
    expect(envLocal).toContain(`BETTER_AUTH_SECRET='${options.authSecret}'`);
    expect(envLocal).toContain("VITE_BASE_URL='http://localhost:3000'");
  });

  it('generates a fresh secret when none is passed in', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'ct-scaffold-'));
    await writeFixture(root);

    const { authSecret: _ignored, ...withoutSecret } = options;
    await applyTemplateRewrites(root, withoutSecret);

    const envLocal = await readFile(path.join(root, '.env.local'), 'utf8');
    const secret = envLocal.match(/BETTER_AUTH_SECRET='([0-9a-f]+)'/)?.[1];
    expect(secret).toMatch(/^[0-9a-f]{64}$/);
  });
});
