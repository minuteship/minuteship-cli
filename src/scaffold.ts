import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  createEnvLocal,
  generateAuthSecret,
  pathExists,
  rewriteCtaJson,
  rewritePackageJson,
  rewriteSiteMessages,
  rewriteWebsiteConfig,
  rewriteWranglerConfig,
  type WebsiteRewriteOptions,
} from './files.js';

export interface CloudflareResourceIds {
  databaseId?: string;
  databaseName?: string;
  bucketName?: string;
  kvNamespaceId?: string;
}

export interface TemplateRewriteOptions extends WebsiteRewriteOptions {
  projectName: string;
  siteName: string;
  /** Reuse the secret from the CLI so every env file matches. */
  authSecret?: string;
  domain?: string;
}

/**
 * Rewrite the copied template in place so it belongs to the buyer's project.
 * Kept separate from the CLI shell so it can be tested without network access.
 */
export async function applyTemplateRewrites(
  targetDir: string,
  options: TemplateRewriteOptions,
  cloudflare: CloudflareResourceIds = {}
): Promise<void> {
  const read = (relativePath: string) =>
    readFile(path.join(targetDir, relativePath), 'utf8');
  const write = (relativePath: string, content: string) =>
    writeFile(path.join(targetDir, relativePath), content);

  await write(
    'package.json',
    rewritePackageJson(await read('package.json'), options.projectName)
  );

  if (await pathExists(path.join(targetDir, '.cta.json'))) {
    await write(
      '.cta.json',
      rewriteCtaJson(await read('.cta.json'), options.projectName)
    );
  }

  await write(
    'wrangler.jsonc',
    rewriteWranglerConfig(await read('wrangler.jsonc'), {
      projectName: options.projectName,
      ...(options.domain ? { domain: options.domain } : {}),
      ...cloudflare,
    })
  );

  await write(
    'src/config/website.ts',
    rewriteWebsiteConfig(await read('src/config/website.ts'), options)
  );

  for (const locale of ['en', 'zh']) {
    const relativePath = `project.inlang/messages/${locale}.json`;
    await write(
      relativePath,
      rewriteSiteMessages(await read(relativePath), {
        siteName: options.siteName,
      })
    );
  }

  await write(
    '.env.local',
    createEnvLocal(await read('.env.example'), {
      authSecret:
        options.authSecret ??
        generateAuthSecret(crypto.getRandomValues(new Uint8Array(32))),
    })
  );
}
