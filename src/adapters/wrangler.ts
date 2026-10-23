import { run, type RunResult } from '../exec.js';
import type { PackageManager } from '../types.js';

export interface WranglerContext {
  targetDir: string;
  packageManager: PackageManager;
}

export interface WranglerRunOptions {
  allowFailure?: boolean;
  input?: string;
  redact?: readonly string[];
}

/**
 * Resolve the project-local Wrangler. `pnpm exec` and friends keep the
 * generated project's pinned version in charge instead of a global install.
 */
export function wranglerInvocation(
  packageManager: PackageManager,
  args: string[]
): { command: string; args: string[] } {
  switch (packageManager) {
    case 'npm':
      return { command: 'npx', args: ['--yes', 'wrangler', ...args] };
    case 'yarn':
      return { command: 'yarn', args: ['wrangler', ...args] };
    case 'bun':
      return { command: 'bunx', args: ['wrangler', ...args] };
    default:
      return { command: 'pnpm', args: ['exec', 'wrangler', ...args] };
  }
}

export async function wranglerRun(
  context: WranglerContext,
  args: string[],
  options: WranglerRunOptions = {}
): Promise<RunResult> {
  const invocation = wranglerInvocation(context.packageManager, args);
  return run(invocation.command, invocation.args, {
    cwd: context.targetDir,
    allowFailure: options.allowFailure ?? false,
    ...(options.input !== undefined ? { input: options.input } : {}),
    ...(options.redact ? { redact: options.redact } : {}),
  });
}
