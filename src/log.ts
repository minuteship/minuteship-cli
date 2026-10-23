import pc from 'picocolors';

export interface Logger {
  info(message: string): void;
  success(message: string): void;
  warn(message: string): void;
  error(message: string): void;
  verbose(message: string): void;
  /** Always printed, even in `--json` mode, and never decorated. */
  plain(message: string): void;
}

export interface LoggerOptions {
  verbose?: boolean;
  /** Suppress decorative output; the command prints one JSON document. */
  json?: boolean;
}

export function createLogger(options: LoggerOptions = {}): Logger {
  const write = (line: string) => {
    if (!options.json) process.stdout.write(`${line}\n`);
  };
  const writeError = (line: string) => {
    process.stderr.write(`${line}\n`);
  };

  return {
    info: (message) => write(message),
    success: (message) => write(`${pc.green('✔')} ${message}`),
    warn: (message) => writeError(`${pc.yellow('!')} ${message}`),
    error: (message) => writeError(`${pc.red('✖')} ${message}`),
    verbose: (message) => {
      if (options.verbose) write(pc.dim(`  ${message}`));
    },
    plain: (message) => process.stdout.write(`${message}\n`),
  };
}
