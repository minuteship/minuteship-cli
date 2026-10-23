import { readFileSync } from 'node:fs';
import path from 'node:path';
import { Command, CommanderError } from 'commander';
import pc from 'picocolors';
import { runCreate, type CreateResult } from './commands/create.js';
import { runDelete } from './commands/delete.js';
import { runDeploy } from './commands/deploy.js';
import { syncGitHub } from './commands/github.js';
import { CliError, UsageError } from './errors.js';
import { parseEnvFile } from './env-file.js';
import { pathExists } from './files.js';
import { createLogger, type Logger } from './log.js';
import { collectOptions } from './options/prompts.js';
import { OPTIONS } from './options/registry.js';
import type { OptionValues } from './options/types.js';
import { readState } from './state.js';
import type { PackageManager } from './types.js';

interface CommonOptions {
  yes?: boolean;
  dryRun?: boolean;
  resume?: boolean;
  verbose?: boolean;
  json?: boolean;
  dir?: string;
}

function readVersion(): string {
  try {
    const manifest = JSON.parse(
      readFileSync(new URL('../package.json', import.meta.url), 'utf8')
    ) as { version?: string };
    return manifest.version ?? '0.0.0';
  } catch {
    return '0.0.0';
  }
}

function camelize(flag: string): string {
  return flag.replace(/-([a-z0-9])/g, (_, char: string) => char.toUpperCase());
}

function addCommonOptions(command: Command): Command {
  return command
    .option('--yes', 'accept defaults instead of prompting')
    .option('--dry-run', 'print the plan without changing anything')
    .option('--verbose', 'print commands and extra detail')
    .option('--json', 'print one JSON document (requires --yes)')
    .option('--dir <path>', 'project directory (default: the current directory)');
}

/** Register every registry option so flags stay in sync with the prompts. */
function addRegistryOptions(command: Command): void {
  for (const spec of OPTIONS) {
    if (!spec.flag) continue;

    if (spec.kind === 'boolean') {
      command.option(`--${spec.flag}`, spec.message);
      command.option(`--no-${spec.flag}`, `Disable: ${spec.message}`);
    } else {
      command.option(`--${spec.flag} <value>`, spec.message);
    }
  }
}

function optionsFromCommand(command: Command): OptionValues {
  const raw = command.opts() as Record<string, unknown>;
  const values: OptionValues = {};

  for (const spec of OPTIONS) {
    if (!spec.flag) continue;
    const value = raw[camelize(spec.flag)];
    if (typeof value === 'string') values[spec.key] = value;
    else if (typeof value === 'boolean') values[spec.key] = value;
  }

  return values;
}

/**
 * Reuse the answers of an interrupted run so `--resume` does not silently
 * fall back to defaults (which could switch the payment provider, for example).
 */
async function seedResumeValues(
  targetDir: string
): Promise<OptionValues | null> {
  const state = await readState(targetDir);
  if (!state) return null;

  const initial: OptionValues = {
    projectName: state.projectName,
    siteName: state.siteName,
  };

  const production = await parseEnvFile(path.join(targetDir, '.env.production'));
  const local = await parseEnvFile(path.join(targetDir, '.env.local'));
  const merged = { ...local, ...production };

  for (const spec of OPTIONS) {
    if (!spec.envVar) continue;
    const value = merged[spec.envVar];
    if (value === undefined) continue;
    initial[spec.key] = spec.kind === 'boolean' ? value === 'true' : value;
  }

  return initial;
}

async function detectPackageManager(targetDir: string): Promise<PackageManager> {
  for (const [file, manager] of [
    ['pnpm-lock.yaml', 'pnpm'],
    ['bun.lockb', 'bun'],
    ['bun.lock', 'bun'],
    ['yarn.lock', 'yarn'],
    ['package-lock.json', 'npm'],
  ] as const) {
    if (await pathExists(path.join(targetDir, file))) return manager;
  }
  return 'pnpm';
}

function loggerFor(options: CommonOptions): Logger {
  return createLogger({
    verbose: options.verbose === true,
    json: options.json === true,
  });
}

function requireYesForJson(options: CommonOptions): void {
  if (options.json === true && options.yes !== true) {
    throw new UsageError('--json requires --yes so nothing waits for input.');
  }
}

function printCreateResult(
  result: CreateResult,
  logger: Logger,
  options: CommonOptions,
  packageManager: PackageManager
): void {
  if (options.json === true) {
    logger.plain(JSON.stringify({ ok: true, ...result }, null, 2));
    return;
  }

  if (options.dryRun === true) {
    logger.plain('');
    logger.plain('Dry run complete. Nothing was changed.');
    return;
  }

  logger.success(`Project ${result.projectName} is ready at ${result.targetDir}`);

  if (result.deployedUrl) {
    logger.success(`Live at ${result.deployedUrl}`);
  }

  if (result.adminEmail && result.adminPassword) {
    logger.plain('');
    logger.plain('  Admin sign-in');
    logger.plain(`    Email:    ${result.adminEmail}`);
    logger.plain(`    Password: ${result.adminPassword}`);
    logger.plain(
      '  This password is shown once. You will be asked to change it on first sign-in.'
    );
  } else if (result.adminEmail) {
    logger.warn(`Admin ${result.adminEmail} was not created.`);
  }

  if (result.manual.length > 0) {
    logger.plain('');
    logger.plain('  Manual steps (can also be done in the admin console)');
    for (const item of result.manual) logger.plain(`    - ${item}`);
  }

  const relative = path.relative(process.cwd(), result.targetDir);
  const displayPath =
    relative && !relative.startsWith('..') ? relative : result.targetDir;
  logger.plain('');
  logger.plain(`Next: cd ${displayPath} && ${packageManager} dev`);
}

function buildProgram(): Command {
  const program = new Command();

  program
    .name('create-minuteship')
    .description('Scaffold and deploy a MinuteShip project')
    .version(readVersion(), '-v, --version', 'print the CLI version')
    .exitOverride();

  const create = program
    .command('create [projectName]')
    .description('scaffold a new project, create Cloudflare resources, and deploy')
    .option('--resume', 'continue a partially completed run')
    .option(
      '--force-new-state',
      'back up an existing .minuteship/state.json and start over'
    )
    .option('--advanced', 'also ask for the advanced options')
    .option(
      '--reset-admin-password',
      'rotate the password of an existing admin account'
    );

  addCommonOptions(create);
  addRegistryOptions(create);

  create.action(
    async (
      projectName: string | undefined,
      options: CommonOptions & {
        advanced?: boolean;
        resetAdminPassword?: boolean;
        forceNewState?: boolean;
      },
      command: Command
    ) => {
      requireYesForJson(options);
      const logger = loggerFor(options);

      const baseDir = path.resolve(options.dir ?? process.cwd());
      let initial = optionsFromCommand(command);

      if (options.resume === true) {
        const seeded = await seedResumeValues(baseDir);
        if (!seeded) {
          throw new UsageError(
            `--resume needs an existing project at ${baseDir}.`
          );
        }
        initial = { ...seeded, ...initial };
      }

      if (projectName) initial.projectName = projectName;

      const { values, warnings } = await collectOptions({
        initial,
        yes: options.yes === true,
        advanced: options.advanced === true,
      });

      values.targetDir =
        options.resume === true
          ? baseDir
          : path.resolve(baseDir, values.projectName);

      for (const warning of warnings) logger.warn(warning);

      const result = await runCreate({
        options: values,
        resume: options.resume === true,
        dryRun: options.dryRun === true,
        logger,
        resetAdminPassword: options.resetAdminPassword === true,
        forceNewState: options.forceNewState === true,
      });

      printCreateResult(result, logger, options, values.packageManager);
    }
  );

  const deploy = program
    .command('deploy')
    .description('build and deploy an existing project')
    .option('--skip-migrate', 'do not apply remote D1 migrations')
    .option('--skip-build', 'deploy the existing build output')
    .option('--github', 'commit, push, and sync GitHub Actions secrets')
    .option('--repo <owner/name>', 'GitHub repository to create or reuse')
    .option('--visibility <visibility>', 'GitHub visibility', 'private');

  addCommonOptions(deploy);

  deploy.action(
    async (
      options: CommonOptions & {
        skipMigrate?: boolean;
        skipBuild?: boolean;
        github?: boolean;
        repo?: string;
        visibility?: string;
      }
    ) => {
      requireYesForJson(options);
      const logger = loggerFor(options);
      const targetDir = path.resolve(options.dir ?? process.cwd());
      const state = await readState(targetDir);

      if (!state) {
        throw new UsageError(
          `No .minuteship/state.json in ${targetDir}. Run \`create\` first.`
        );
      }

      const packageManager = await detectPackageManager(targetDir);

      const result = await runDeploy({
        targetDir,
        packageManager,
        dryRun: options.dryRun === true,
        logger,
        skipMigrate: options.skipMigrate === true,
        skipBuild: options.skipBuild === true,
      });

      if (options.github === true) {
        const repo = options.repo ?? state.github?.repo;
        if (!repo) {
          throw new UsageError(
            'Pass --repo owner/name (or scaffold with --github) to sync a repository.'
          );
        }

        await syncGitHub({
          targetDir,
          packageManager,
          repo,
          visibility: options.visibility === 'public' ? 'public' : 'private',
          logger,
        });
      }

      if (options.json === true) {
        logger.plain(JSON.stringify({ ok: true, ...result }, null, 2));
      }
    }
  );

  const remove = program
    .command('delete')
    .description('delete the Cloudflare resources recorded for a project')
    .option('--delete-github', 'also delete the GitHub repository')
    .option('--package-manager <name>', 'package manager to run wrangler with');

  addCommonOptions(remove);

  remove.action(
    async (
      options: CommonOptions & {
        deleteGithub?: boolean;
        packageManager?: string;
      }
    ) => {
      requireYesForJson(options);
      const logger = loggerFor(options);
      const targetDir = path.resolve(options.dir ?? process.cwd());
      const packageManager =
        options.packageManager !== undefined
          ? (options.packageManager as PackageManager)
          : await detectPackageManager(targetDir);

      const result = await runDelete({
        targetDir,
        packageManager,
        yes: options.yes === true,
        dryRun: options.dryRun === true,
        logger,
        deleteGithub: options.deleteGithub === true,
      });

      for (const warning of result.warnings) logger.warn(warning);

      if (options.json === true) {
        logger.plain(JSON.stringify({ ok: true, ...result }, null, 2));
      }
    }
  );

  return program;
}

function reportError(
  error: unknown,
  options: { verbose: boolean; json: boolean }
): number {
  if (error instanceof CommanderError) {
    // Help and version output already went to stdout.
    if (
      error.code === 'commander.helpDisplayed' ||
      error.code === 'commander.help' ||
      error.code === 'commander.version'
    ) {
      return 0;
    }
    // Commander has already printed a usage message.
    return 2;
  }

  const message = error instanceof Error ? error.message : String(error);
  const exitCode = error instanceof CliError ? error.exitCode : 1;

  if (options.json) {
    process.stderr.write(`${JSON.stringify({ ok: false, error: message })}\n`);
  } else {
    process.stderr.write(`${pc.red('✖')} ${message}\n`);
  }

  if (options.verbose && error instanceof Error && error.stack) {
    process.stderr.write(`${error.stack}\n`);
  }

  return exitCode;
}

/**
 * Parse and run the CLI. Returns the process exit code:
 * 0 success, 1 runtime failure, 2 usage error, 3 preflight failure.
 */
export async function runCli(argv: string[] = process.argv): Promise<number> {
  const program = buildProgram();
  const verbose = argv.includes('--verbose');
  const json = argv.includes('--json');

  try {
    await program.parseAsync(argv);
    return 0;
  } catch (error) {
    return reportError(error, { verbose, json });
  }
}
