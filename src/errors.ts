/** Base class for errors that map to a documented exit code. */
export class CliError extends Error {
  readonly exitCode: number;

  constructor(message: string, exitCode = 1) {
    super(message);
    this.name = 'CliError';
    this.exitCode = exitCode;
  }
}

/** Bad flags, missing required values, or an unusable combination. */
export class UsageError extends CliError {
  constructor(message: string) {
    super(message, 2);
    this.name = 'UsageError';
  }
}

/** A local tool, credential, or version is missing before any work starts. */
export class PreflightError extends CliError {
  constructor(message: string) {
    super(message, 3);
    this.name = 'PreflightError';
  }
}
