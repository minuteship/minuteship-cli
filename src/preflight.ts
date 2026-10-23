import type { PackageManager } from './types.js';
import { commandExists, run } from './exec.js';

export interface PreflightInput {
  packageManager: PackageManager;
  /** Cloudflare resources will be created or the Worker deployed. */
  needsCloudflare: boolean;
  /** A GitHub repository will be created or pushed. */
  needsGithub: boolean;
  needsInstall: boolean;
  env?: NodeJS.ProcessEnv;
}

export interface PreflightResult {
  issues: string[];
  warnings: string[];
}

const MIN_NODE = { major: 22, minor: 12 };

function checkNodeVersion(): string | null {
  const [major = 0, minor = 0] = process.versions.node
    .split('.')
    .map((part) => Number.parseInt(part, 10));

  const ok =
    major > MIN_NODE.major ||
    (major === MIN_NODE.major && minor >= MIN_NODE.minor);

  return ok
    ? null
    : `Node.js ${MIN_NODE.major}.${MIN_NODE.minor}+ is required (found ${process.versions.node}).`;
}

export async function runPreflight(
  input: PreflightInput
): Promise<PreflightResult> {
  const issues: string[] = [];
  const warnings: string[] = [];

  const nodeIssue = checkNodeVersion();
  if (nodeIssue) issues.push(nodeIssue);

  if (input.needsInstall && !(await commandExists(input.packageManager))) {
    issues.push(
      `\`${input.packageManager}\` was not found on PATH. Install it or pass --no-install.`
    );
  }

  if (input.needsGithub) {
    if (!(await commandExists('git'))) {
      issues.push('`git` was not found on PATH.');
    }
    if (!(await commandExists('gh'))) {
      issues.push(
        '`gh` (GitHub CLI) was not found on PATH. Install it or pass --no-github.'
      );
    } else {
      const auth = await run('gh', ['auth', 'status'], {
        allowFailure: true,
      });
      if (auth.exitCode !== 0) {
        issues.push(
          'GitHub CLI is not authenticated. Run `gh auth login` or pass --no-github.'
        );
      }
    }
  }

  if (input.needsCloudflare && !(await commandExists('wrangler'))) {
    // Dependencies are installed before Cloudflare work starts, so a local
    // wrangler is acceptable; warn here and re-check in the step.
    warnings.push(
      '`wrangler` is not on PATH. The project-local copy is used after install.'
    );
  }

  const env = input.env ?? process.env;
  if (input.needsCloudflare && !env.CLOUDFLARE_API_TOKEN) {
    warnings.push(
      'CLOUDFLARE_API_TOKEN is not set. Resource creation falls back to `wrangler login`, and provisioning APIs that need a token are skipped.'
    );
  }

  return { issues, warnings };
}
