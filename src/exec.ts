import { spawn } from 'node:child_process';
import { summarizeCommandError } from './cloudflare.js';

export interface RunOptions {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  /** Written to stdin, then the stream is closed. */
  input?: string;
  /** Values replaced with `***` in logs and error messages. */
  redact?: readonly string[];
  timeoutMs?: number;
  /** Return the result instead of throwing on a non-zero exit. */
  allowFailure?: boolean;
}

export interface RunResult {
  command: string;
  args: string[];
  stdout: string;
  stderr: string;
  exitCode: number;
}

export class CommandError extends Error {
  readonly result: RunResult;

  constructor(result: RunResult, redact: readonly string[] = []) {
    const summary = redactText(
      summarizeCommandError(result.stderr),
      redact
    );
    super(
      `${result.command} ${result.args.join(' ')} failed (exit ${result.exitCode}): ${summary}`
    );
    this.name = 'CommandError';
    this.result = result;
  }
}

export function redactText(text: string, secrets: readonly string[]): string {
  return secrets.reduce((output, secret) => {
    if (!secret) return output;
    return output.split(secret).join('***');
  }, text);
}

/**
 * Run a command without a shell. Secrets must be passed through `env` or
 * `input`, never interpolated into `args`, so they do not appear in process
 * listings or debug logs.
 */
export async function run(
  command: string,
  args: string[],
  options: RunOptions = {}
): Promise<RunResult> {
  const redact = options.redact ?? [];

  return new Promise<RunResult>((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: options.env ?? process.env,
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: options.timeoutMs,
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    child.on('error', (error) => {
      reject(
        new Error(
          `Could not run ${command}: ${redactText(error.message, redact)}`
        )
      );
    });

    child.on('close', (code) => {
      const result: RunResult = {
        command,
        args,
        stdout,
        stderr,
        exitCode: code ?? 1,
      };
      if (result.exitCode !== 0 && !options.allowFailure) {
        reject(new CommandError(result, redact));
        return;
      }
      resolve(result);
    });

    if (options.input !== undefined) {
      child.stdin.end(options.input);
    } else {
      child.stdin.end();
    }
  });
}

/** True when `command --version` starts successfully. */
export async function commandExists(command: string): Promise<boolean> {
  try {
    await run(command, ['--version'], {
      allowFailure: true,
      timeoutMs: 10_000,
    });
    return true;
  } catch {
    return false;
  }
}
