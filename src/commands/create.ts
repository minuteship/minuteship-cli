import { chmod, mkdir, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { ensureCloudflareResources, type CloudflareResources } from '../adapters/cloudflare-cli.js';
import { provisionIntegrations } from '../adapters/index.js';
import { resolveBindingsFor } from '../bindings.js';
import { parseEnvFile, readEnvValue } from '../env-file.js';
import { PreflightError, UsageError } from '../errors.js';
import { run } from '../exec.js';
import {
  copyTemplate,
  generateAuthSecret,
  pathExists,
} from '../files.js';
import type { Logger } from '../log.js';
import { renderEnv } from '../options/env.js';
import { toTemplateRewriteOptions } from '../options/template.js';
import type { CreateOptions } from '../options/types.js';
import { buildPlan, formatPlan } from '../plan.js';
import { runPreflight } from '../preflight.js';
import { applyTemplateRewrites } from '../scaffold.js';
import {
  backupState,
  createState,
  readState,
  recordStep,
  updateState,
  writeState,
  type ProjectState,
  type StepStatus,
} from '../state.js';
import { fetchTemplate } from '../template.js';
import { createAdminAccount } from './admin.js';
import { runDeploy } from './deploy.js';
import { syncGitHub } from './github.js';
import { seedPaymentPrices } from './seed.js';

export interface CreateCommandInput {
  options: CreateOptions;
  resume: boolean;
  dryRun: boolean;
  logger: Logger;
  env?: NodeJS.ProcessEnv;
  resetAdminPassword?: boolean;
  /** Back up an existing state file and start the bookkeeping from scratch. */
  forceNewState?: boolean;
}

export interface CreateResult {
  projectName: string;
  targetDir: string;
  deployedUrl?: string;
  adminPassword?: string;
  adminEmail?: string;
  manual: string[];
}

async function isEmptyDirectory(dir: string): Promise<boolean> {
  try {
    return (await readdir(dir)).length === 0;
  } catch {
    return true;
  }
}

function text(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() !== ''
    ? value.trim()
    : undefined;
}

export async function runCreate(
  input: CreateCommandInput
): Promise<CreateResult> {
  const { options, logger } = input;
  const targetDir = options.targetDir;
  const plan = buildPlan(options);
  const manual = plan
    .filter((item) => item.status === 'manual')
    .map((item) => (item.detail ? `${item.title} — ${item.detail}` : item.title));

  if (input.dryRun) {
    logger.plain(formatPlan(plan));
    return { projectName: options.projectName, targetDir, manual };
  }

  const dirExists = await pathExists(targetDir);
  let existingState = dirExists ? await readState(targetDir) : null;

  if (input.forceNewState) {
    const backup = await backupState(targetDir);
    if (backup) logger.warn(`Previous state moved to ${backup}.`);
    existingState = null;
  }

  if (
    dirExists &&
    !existingState &&
    !input.forceNewState &&
    !(await isEmptyDirectory(targetDir))
  ) {
    throw new UsageError(
      `Target directory is not empty: ${targetDir}. Choose another name or remove it.`
    );
  }
  if (existingState && !input.resume) {
    throw new UsageError(
      `${targetDir} is already initialized. Pass --resume to continue.`
    );
  }
  if (!dirExists && input.resume) {
    throw new UsageError(`--resume needs an existing project at ${targetDir}.`);
  }

  const preflight = await runPreflight({
    packageManager: options.packageManager,
    needsCloudflare: options.provision !== false || options.deploy !== false,
    needsGithub: options.githubEnabled === true,
    needsInstall: options.install !== false,
    ...(input.env ? { env: input.env } : {}),
  });

  for (const warning of preflight.warnings) logger.warn(warning);
  if (preflight.issues.length > 0) {
    throw new PreflightError(
      `Preflight failed:\n${preflight.issues.map((issue) => `  - ${issue}`).join('\n')}`
    );
  }

  await mkdir(targetDir, { recursive: true });

  let state: ProjectState =
    existingState ??
    createState({
      projectName: options.projectName,
      siteName: options.siteName,
      targetDir,
    });
  if (!existingState) await writeState(targetDir, state);

  // Record the intended names even when provisioning is skipped: `delete`
  // needs the Worker name, and `deploy` may create it later.
  await updateState(targetDir, {
    cloudflare: {
      workerName: String(options.workerName),
      ...(text(options.cloudflareAccountId)
        ? { accountId: text(options.cloudflareAccountId) }
        : {}),
      ...(text(options.domain) ? { domain: text(options.domain) } : {}),
    },
  });

  const completed = new Set(
    Object.entries(state.steps)
      .filter(([, record]) => record.status === 'done')
      .map(([id]) => id)
  );

  const mark = async (id: string, status: StepStatus = 'done') => {
    if (status === 'done') completed.add(id);
    await recordStep(targetDir, id, status);
    state = (await readState(targetDir)) ?? state;
  };

  let authSecret = text(options.betterAuthSecret) ?? '';
  if (!authSecret) {
    authSecret =
      (await readEnvValue(
        path.join(targetDir, '.env.production'),
        'BETTER_AUTH_SECRET'
      )) ??
      (await readEnvValue(
        path.join(targetDir, '.env.local'),
        'BETTER_AUTH_SECRET'
      )) ??
      generateAuthSecret(crypto.getRandomValues(new Uint8Array(32)));
  }

  if (!completed.has('template')) {
    logger.info('Downloading the MinuteShip template…');
    const template = await fetchTemplate();
    try {
      await copyTemplate(template.dir, targetDir);
    } finally {
      await template.cleanup();
    }
    await mark('template');
  } else {
    logger.verbose('Template already copied.');
  }

  if (options.install !== false && !completed.has('install')) {
    if (options.packageManager !== 'pnpm') {
      await rm(path.join(targetDir, 'pnpm-lock.yaml'), { force: true });
    }
    logger.info(`Installing dependencies with ${options.packageManager}…`);
    await run(options.packageManager, ['install'], {
      cwd: targetDir,
      env: input.env ?? process.env,
    });
    await mark('install');
  }

  // Bindings come from the copied template's own manifest, which records what
  // each module reads. Creating the resources a tools site never touches leaves
  // orphans in the account and makes `wrangler deploy` demand a bucket the
  // Worker does not have a use for.
  const bindings = await resolveBindingsFor(targetDir, {
    modules: toTemplateRewriteOptions(options, authSecret).modules,
    ...(text(options.preset) ? { preset: text(options.preset) as string } : {}),
  });

  let resources: CloudflareResources | undefined;
  if (options.provision !== false) {
    if (
      completed.has('cloudflare') &&
      state.cloudflare?.databaseId &&
      state.cloudflare.kvNamespaceId
    ) {
      resources = {
        ...(state.cloudflare.databaseId
          ? {
              databaseId: state.cloudflare.databaseId,
              databaseName:
                state.cloudflare.databaseName ?? options.projectName,
            }
          : {}),
        ...(state.cloudflare.bucketName
          ? { bucketName: state.cloudflare.bucketName }
          : {}),
        ...(state.cloudflare.kvNamespaceId
          ? { kvNamespaceId: state.cloudflare.kvNamespaceId }
          : {}),
      };
    } else {
      logger.info('Creating Cloudflare resources…');
      resources = await ensureCloudflareResources({
        targetDir,
        packageManager: options.packageManager,
        databaseName: String(options.databaseName),
        bucketName: String(options.bucketName),
        kvName: String(options.kvName),
        bindings,
        log: (message) => logger.info(message),
      });
      await updateState(targetDir, {
        cloudflare: {
          kvName: String(options.kvName),
          ...resources,
        },
      });
      await mark('cloudflare');
    }
  } else {
    logger.warn('Skipping Cloudflare resource creation (--no-provision).');
    await mark('cloudflare', 'skipped');
  }

  // Payment ids are baked in at build time, so provisioning has to happen
  // before the env files are written and the project is built.
  let envDirty = false;
  if (text(options.paymentProvider) && !completed.has('integrations')) {
    logger.info('Provisioning payment resources…');
    const provisioned = await provisionIntegrations({ options, logger });

    if (provisioned.error) logger.warn(provisioned.error);
    for (const warning of provisioned.warnings) logger.warn(warning);
    manual.push(...provisioned.manualInstructions);

    if (Object.keys(provisioned.values).length > 0) {
      Object.assign(options, provisioned.values);
      envDirty = true;
    }

    await updateState(targetDir, {
      payment: {
        provider: String(options.paymentProvider),
        provisioned:
          provisioned.status === 'created' || provisioned.status === 'reused',
      },
    });
    await mark(
      'integrations',
      provisioned.status === 'failed'
        ? 'manual'
        : provisioned.status === 'skipped'
          ? 'skipped'
          : 'done'
    );
  }

  if (!completed.has('rewrite')) {
    logger.info('Rewriting project configuration…');
    await applyTemplateRewrites(
      targetDir,
      toTemplateRewriteOptions(options, authSecret),
      {
        bindings,
        ...(resources?.databaseId ? { databaseId: resources.databaseId } : {}),
        ...(resources?.databaseName
          ? { databaseName: resources.databaseName }
          : {}),
        ...(resources?.bucketName ? { bucketName: resources.bucketName } : {}),
        ...(resources?.kvNamespaceId
          ? { kvNamespaceId: resources.kvNamespaceId }
          : {}),
      }
    );
    await mark('rewrite');
  }

  if (!completed.has('env') || envDirty) {
    logger.info('Writing environment files…');
    const rendered = renderEnv({
      options,
      authSecret,
      ...(resources?.databaseId ? { databaseId: resources.databaseId } : {}),
    });

    for (const [name, content] of [
      ['.env.local', rendered.local],
      ['.env.production', rendered.production],
    ] as const) {
      const file = path.join(targetDir, name);
      await writeFile(file, content, { encoding: 'utf8', mode: 0o600 });
      await chmod(file, 0o600);
    }
    await mark('env');
  }

  if (options.migrateLocal !== false && !completed.has('migrate-local')) {
    logger.info('Applying local database migrations…');
    await run(options.packageManager, ['db:migrate:local'], {
      cwd: targetDir,
      env: input.env ?? process.env,
    });
    await mark('migrate-local');
  }

  let deployedUrl: string | undefined;
  if (options.deploy !== false) {
    const deploy = await runDeploy({
      targetDir,
      packageManager: options.packageManager,
      dryRun: false,
      logger,
      ...(input.env ? { env: input.env } : {}),
    });
    deployedUrl = deploy.url;
    await mark('deploy');
  }

  let adminPassword: string | undefined;
  const adminEmail = text(options.adminEmail);
  if (options.createAdmin !== false && adminEmail) {
    if (options.deploy === false) {
      logger.info('Applying remote database migrations before admin creation…');
      await run(options.packageManager, ['db:migrate:remote'], {
        cwd: targetDir,
        env: input.env ?? process.env,
      });

      // The Worker resolves checkout prices from D1 at runtime, so the ids
      // written into `.env.production` must also live in `payment_price`.
      try {
        const production = await parseEnvFile(
          path.join(targetDir, '.env.production')
        );
        await seedPaymentPrices({
          targetDir,
          packageManager: options.packageManager,
          databaseName: resources?.databaseName ?? String(options.databaseName),
          provider: production.VITE_PAYMENT_PROVIDER ?? '',
          env: production,
          logger,
        });
        await mark('seed-prices');
      } catch (error) {
        logger.warn(
          `Skipped payment price seeding: ${
            error instanceof Error ? error.message : String(error)
          }`
        );
      }
    }

    logger.info(`Creating admin account ${adminEmail}…`);
    const admin = await createAdminAccount({
      targetDir,
      packageManager: options.packageManager,
      databaseName: resources?.databaseName ?? String(options.databaseName),
      email: adminEmail,
      ...(input.resetAdminPassword ? { resetPassword: true } : {}),
      logger,
    });

    if (admin.warning) logger.warn(admin.warning);
    adminPassword = admin.password;
    await updateState(targetDir, {
      admin: { email: adminEmail, userId: admin.userId },
    });
    await mark('admin', admin.created || admin.reset ? 'done' : 'skipped');
  }

  if (options.githubEnabled === true && text(options.githubRepo)) {
    const github = await syncGitHub({
      targetDir,
      packageManager: options.packageManager,
      repo: text(options.githubRepo) as string,
      visibility: options.githubVisibility === 'public' ? 'public' : 'private',
      logger,
    });
    await updateState(targetDir, {
      github: {
        repo: text(options.githubRepo),
        visibility: options.githubVisibility === 'public' ? 'public' : 'private',
      },
    });
    await mark('github', github.pushed ? 'done' : 'skipped');
  }

  return {
    projectName: options.projectName,
    targetDir,
    ...(deployedUrl ? { deployedUrl } : {}),
    ...(adminPassword ? { adminPassword } : {}),
    ...(adminEmail ? { adminEmail } : {}),
    manual,
  };
}
