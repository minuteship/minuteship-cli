import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { renderConfigFile, type ConfigSite } from './config-file.js';
import {
  createEnvLocal,
  generateAuthSecret,
  pathExists,
  rewriteCtaJson,
  rewritePackageJson,
  rewriteWranglerConfig,
} from './files.js';
import type { PackageManager } from './types.js';

export interface CloudflareResourceIds {
  databaseId?: string;
  databaseName?: string;
  bucketName?: string;
  kvNamespaceId?: string;
}

export interface TemplateRewriteOptions {
  projectName: string;
  /** Site type, e.g. `saas` | `tools` | `directory`. */
  preset: string;
  /** Module keys the user selected. Dependencies are expanded by the template. */
  modules: readonly string[];
  theme: string;
  site: ConfigSite;
  /** Module settings, written into the config for the modules that exist. */
  auth?: {
    googleLogin?: boolean;
    credentialLogin?: boolean;
    deleteAccount?: boolean;
  };
  mail?: {
    provider?: string;
    fromEmail?: string;
    supportEmail?: string;
  };
  newsletter?: {
    provider?: string;
    autoSubscribeAfterSignUp?: boolean;
  };
  notification?: { provider?: string };
  packageManager?: PackageManager;
  /** Reuse the secret from the CLI so every env file matches. */
  authSecret?: string;
  domain?: string;
  payment?: { provider: 'stripe' | 'creem' | 'waffo' };
}

/**
 * Rewrite the copied template in place so it belongs to the buyer's project.
 *
 * The only project-shaping write is `minuteship.config.ts`. Everything else is
 * identity (package/worker names) or infrastructure ids — the template derives
 * routes, navigation, theme CSS and `websiteConfig` from the config at build
 * time, so nothing here patches application source.
 *
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
    rewritePackageJson(
      await read('package.json'),
      options.projectName,
      options.packageManager
    )
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
    'minuteship.config.ts',
    renderConfigFile({
      preset: options.preset,
      modules: options.modules,
      theme: options.theme,
      site: options.site,
      ...(options.payment ? { payment: options.payment } : {}),
      ...(options.auth ? { auth: options.auth } : {}),
      ...(options.mail ? { mail: options.mail } : {}),
      ...(options.newsletter ? { newsletter: options.newsletter } : {}),
      ...(options.notification ? { notification: options.notification } : {}),
    })
  );

  await write(
    '.env.local',
    createEnvLocal(await read('.env.example'), {
      authSecret:
        options.authSecret ??
        generateAuthSecret(crypto.getRandomValues(new Uint8Array(32))),
    })
  );
}
