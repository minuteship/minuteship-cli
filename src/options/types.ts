import type { PackageManager } from '../types.js';

export type OptionGroup =
  | 'project'
  | 'features'
  | 'cloudflare'
  | 'auth'
  | 'payment'
  | 'mail'
  | 'newsletter'
  | 'notification'
  | 'analytics'
  | 'chat'
  | 'ai';

export type OptionTarget =
  | 'env.local'
  | 'env.production'
  | 'worker.secret'
  | 'github.secret';

export type OptionKind =
  | 'string'
  | 'secret'
  | 'boolean'
  | 'enum'
  | 'url'
  | 'email';

export interface OptionChoice {
  label: string;
  value: string;
}

/** Values gathered so far; used by `requiredWhen` predicates. */
export type OptionValues = Record<string, string | boolean | undefined>;

export interface OptionSpec {
  /** camelCase key in the resolved config. */
  key: string;
  /** Long flag without the leading `--`. Boolean options also get `--no-<flag>`. */
  flag?: string;
  /** Env variable written by this option. */
  envVar?: string;
  group: OptionGroup;
  kind: OptionKind;
  message: string;
  hint?: string;
  default?: string | boolean;
  choices?: readonly OptionChoice[];
  /** Where the value is written. Defaults to local and production env files. */
  targets?: readonly OptionTarget[];
  /** Ask for (and require) this value only when the predicate is true. */
  requiredWhen?: (values: OptionValues) => boolean;
  validate?: (value: string) => string | null;
  /** CLI-only options are never written to env files or secrets. */
  cliOnly?: boolean;
  /** Hidden from the guided flow; still available as a flag. */
  advanced?: boolean;
  /** No provisioning API exists; the CLI prints manual steps instead. */
  manual?: boolean;
  /**
   * Filled in by a provisioning adapter during `create`. Missing values are
   * only an error when provisioning is disabled, because the value is needed
   * at build time and cannot be added later from the admin console.
   */
  provisionedBy?: 'stripe' | 'creem' | 'waffo' | 'cloudflare' | 'resend';
}

/**
 * The fully resolved `create` input. Indexed so integrations can read
 * provider-specific values without a giant literal type.
 */
export interface CreateOptions extends OptionValues {
  projectName: string;
  siteName: string;
  packageManager: PackageManager;
  targetDir: string;
}

export const ENV_TARGETS: readonly OptionTarget[] = [
  'env.local',
  'env.production',
];

export const SECRET_TARGETS: readonly OptionTarget[] = [
  'env.local',
  'env.production',
  'worker.secret',
  'github.secret',
];

/** Build-time values: they must be present during `vite build`. */
export const BUILD_TARGETS: readonly OptionTarget[] = [
  'env.local',
  'env.production',
  'github.secret',
];
