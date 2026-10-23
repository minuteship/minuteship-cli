import { run } from '../exec.js';
import type { Logger } from '../log.js';
import type { PackageManager } from '../types.js';

export interface GitHubSyncInput {
  targetDir: string;
  packageManager: PackageManager;
  repo: string;
  visibility: 'private' | 'public';
  logger: Logger;
}

export interface GitHubSyncResult {
  created: boolean;
  pushed: boolean;
}

async function git(
  targetDir: string,
  args: string[],
  options: { allowFailure?: boolean } = {}
) {
  return run('git', args, {
    cwd: targetDir,
    allowFailure: options.allowFailure ?? false,
  });
}

async function ensureGitIdentity(targetDir: string): Promise<void> {
  const name = await git(targetDir, ['config', 'user.name'], {
    allowFailure: true,
  });
  if (name.exitCode !== 0 || name.stdout.trim() === '') {
    await git(targetDir, ['config', 'user.name', 'MinuteShip CLI']);
  }

  const email = await git(targetDir, ['config', 'user.email'], {
    allowFailure: true,
  });
  if (email.exitCode !== 0 || email.stdout.trim() === '') {
    await git(targetDir, ['config', 'user.email', 'noreply@example.com']);
  }
}

/**
 * Create the repository (if needed), sync Actions secrets, then make the first
 * commit and push. Secrets are pushed before the commit so CI has them on the
 * very first workflow run.
 */
export async function syncGitHub(
  input: GitHubSyncInput
): Promise<GitHubSyncResult> {
  const { targetDir, repo, logger } = input;

  const init = await git(targetDir, ['rev-parse', '--is-inside-work-tree'], {
    allowFailure: true,
  });
  if (init.exitCode !== 0) {
    await git(targetDir, ['init', '-b', 'main']);
  }

  const existing = await run('gh', ['repo', 'view', repo, '--json', 'name'], {
    cwd: targetDir,
    allowFailure: true,
  });

  let created = false;
  if (existing.exitCode !== 0) {
    logger.info(`Creating GitHub repository ${repo}…`);
    await run(
      'gh',
      [
        'repo',
        'create',
        repo,
        `--${input.visibility}`,
        '--source',
        '.',
        '--remote',
        'origin',
      ],
      { cwd: targetDir }
    );
    created = true;
  } else {
    logger.info(`Using existing GitHub repository ${repo}.`);
  }

  const remote = await git(targetDir, ['remote', 'get-url', 'origin'], {
    allowFailure: true,
  });
  if (remote.exitCode !== 0) {
    await git(targetDir, [
      'remote',
      'add',
      'origin',
      `https://github.com/${repo}.git`,
    ]);
  }

  logger.info('Syncing GitHub Actions secrets…');
  await run(
    input.packageManager,
    ['sync-github-secrets', '--repo', repo],
    { cwd: targetDir }
  );

  await ensureGitIdentity(targetDir);
  await git(targetDir, ['add', '-A']);
  await git(targetDir, ['commit', '-m', 'Initial commit from MinuteShip'], {
    allowFailure: true,
  });
  await git(targetDir, ['branch', '-M', 'main']);
  await git(targetDir, ['push', '-u', 'origin', 'main']);

  logger.success(`Pushed to https://github.com/${repo}`);
  return { created, pushed: true };
}
