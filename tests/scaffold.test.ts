import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { applyTemplateRewrites } from '../src/scaffold.js';
import type { ScaffoldOptions } from '../src/types.js';

const options: ScaffoldOptions = {
  projectName: 'acme',
  siteName: 'Acme SaaS',
  packageManager: 'pnpm',
  paymentProvider: '',
  enableDocs: false,
  enableCredits: true,
  createCloudflareResources: false,
};

async function writeFixture(root: string) {
  await mkdir(path.join(root, 'src/config'), { recursive: true });
  await mkdir(path.join(root, 'project.inlang/messages'), { recursive: true });

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
  "routes": [{ "pattern": "demo.example.com", "custom_domain": true }]
}
`,
    'src/config/website.ts': `export const websiteConfig = {
  social: {
    github: 'https://github.com/example',
    twitter: 'https://x.com/example',
  },
  docs: {
    enable: true,
  },
  payment: {
    enable: true,
  },
  credits: {
    enable: true,
  },
};
`,
    '.env.example': [
      "VITE_BASE_URL='http://localhost:3000'",
      "BETTER_AUTH_SECRET=''",
      '',
    ].join('\n'),
  };

  for (const locale of ['en', 'zh']) {
    files[`project.inlang/messages/${locale}.json`] = JSON.stringify({
      site_name: 'MinuteShip Demo',
      site_title: 'MinuteShip',
      site_description: 'MinuteShip description',
      keep_me: 'yes',
    });
  }

  for (const [relativePath, content] of Object.entries(files)) {
    await writeFile(path.join(root, relativePath), content);
  }
}

describe('applyTemplateRewrites', () => {
  it('rewrites a copied template without touching license or unrelated keys', async () => {
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

    const wrangler = await readFile(
      path.join(root, 'wrangler.jsonc'),
      'utf8'
    );
    expect(wrangler).toContain('// template comment');
    expect(wrangler).toContain('"name": "acme"');
    expect(wrangler).not.toContain('demo.example.com');

    const website = await readFile(
      path.join(root, 'src/config/website.ts'),
      'utf8'
    );
    expect(website).toMatch(/docs: \{\n\s*enable: false,/);
    expect(website).toMatch(/credits: \{\n\s*enable: true,/);
    expect(website).toMatch(/payment: \{\n\s*enable: false,/);

    for (const locale of ['en', 'zh']) {
      const messages = JSON.parse(
        await readFile(
          path.join(root, `project.inlang/messages/${locale}.json`),
          'utf8'
        )
      ) as Record<string, string>;
      expect(messages.site_name).toBe('Acme SaaS');
      expect(messages.keep_me).toBe('yes');
    }

    const envLocal = await readFile(path.join(root, '.env.local'), 'utf8');
    const secret = envLocal.match(/BETTER_AUTH_SECRET='([0-9a-f]+)'/)?.[1];
    expect(secret).toMatch(/^[0-9a-f]{64}$/);
    expect(envLocal).toContain("VITE_BASE_URL='http://localhost:3000'");
  });
});
