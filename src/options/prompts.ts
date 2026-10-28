import prompts from 'prompts';
import { CliError, UsageError } from '../errors.js';
import { validateProjectName } from '../validate.js';
import { OPTIONS, isActive, isProvisionable } from './registry.js';
import { applyDerivedDefaults, validateResolved } from './schema.js';
import type { CreateOptions, OptionSpec, OptionValues } from './types.js';

export interface CollectOptionsInput {
  initial: OptionValues;
  /** Accept defaults instead of prompting. */
  yes: boolean;
  /** Ask the options that are normally hidden behind `--advanced`. */
  advanced: boolean;
  env?: NodeJS.ProcessEnv;
}

export interface CollectOptionsResult {
  values: CreateOptions;
  warnings: string[];
}

async function ask<T extends string>(
  question: prompts.PromptObject<T>
): Promise<prompts.Answers<T>> {
  return prompts(question, {
    onCancel: () => {
      throw new CliError('Cancelled.');
    },
  });
}

function asText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function promptMessage(spec: OptionSpec): string {
  const optional = spec.requiredWhen ? '' : ' (optional)';
  return spec.hint ? `${spec.message} — ${spec.hint}${optional}` : `${spec.message}${optional}`;
}

async function askValue(
  spec: OptionSpec,
  options: { initial?: string; required: boolean }
): Promise<string | boolean | undefined> {
  if (spec.kind === 'boolean') {
    const answer = await ask<typeof spec.key>({
      type: 'toggle',
      name: spec.key,
      message: spec.message,
      initial: Boolean(spec.default),
      active: 'yes',
      inactive: 'no',
    });
    return Boolean(answer[spec.key]);
  }

  if (spec.kind === 'enum') {
    const choices = spec.choices ?? [];
    const initial = Math.max(
      0,
      choices.findIndex((choice) => choice.value === (options.initial ?? spec.default))
    );
    const answer = await ask<typeof spec.key>({
      type: 'select',
      name: spec.key,
      message: spec.message,
      choices: choices.map((choice) => ({
        title: choice.label,
        value: choice.value,
      })),
      initial,
    });
    return asText(answer[spec.key]);
  }

  const validate = (value: string): true | string => {
    const trimmed = value.trim();
    if (!trimmed) {
      return options.required ? 'This value is required.' : true;
    }
    return spec.validate?.(trimmed) ?? true;
  };

  if (spec.kind === 'secret') {
    const answer = await ask<typeof spec.key>({
      type: 'password',
      name: spec.key,
      message: promptMessage(spec),
      validate,
    });
    return asText(answer[spec.key]);
  }

  const answer = await ask<typeof spec.key>({
    type: 'text',
    name: spec.key,
    message: promptMessage(spec),
    initial: options.initial ?? (typeof spec.default === 'string' ? spec.default : ''),
    validate,
  });
  return asText(answer[spec.key]);
}

/**
 * Resolve every option from flags, the environment, and interactive answers.
 *
 * Boolean switches are asked in array order, and dependent options come after
 * the switch they depend on, so `isActive` always sees a settled answer.
 */
export async function collectOptions(
  input: CollectOptionsInput
): Promise<CollectOptionsResult> {
  const env = input.env ?? process.env;
  const values: OptionValues = { ...input.initial };

  const projectName = asText(values.projectName);
  if (!projectName) {
    if (input.yes) {
      throw new UsageError(
        'Project name is required. Pass it as the first argument: create-minuteship create acme --yes'
      );
    }
    const answer = await ask<'projectName'>({
      type: 'text',
      name: 'projectName',
      message: 'Project name',
      initial: 'my-saas',
      validate: (value) => validateProjectName(value) ?? true,
    });
    values.projectName = asText(answer.projectName);
  }

  const nameError = validateProjectName(asText(values.projectName));
  if (nameError) throw new UsageError(nameError);

  // Values exported in the shell are treated as answers, so `--yes` works in CI.
  for (const spec of OPTIONS) {
    if (!spec.envVar || asText(values[spec.key])) continue;
    const fromEnv = env[spec.envVar]?.trim();
    if (fromEnv) values[spec.key] = fromEnv;
  }

  if (!asText(values.siteName)) {
    values.siteName = input.yes ? asText(values.projectName) : undefined;
  }

  for (const spec of OPTIONS) {
    if (spec.key === 'projectName') continue;

    if (spec.kind === 'boolean') {
      // A toggle whose module is absent is not asked, and must not fall back to
      // its default either: doing that would leave `enableGoogleLogin: true` on
      // a project with no auth, and every dependent option would then warn
      // about a credential nothing reads.
      if (!isActive(spec, values)) continue;
      if (values[spec.key] === undefined) {
        values[spec.key] = input.yes
          ? Boolean(spec.default)
          : await askValue(spec, { required: false });
      }
      continue;
    }

    if (!isActive(spec, values)) continue;

    const current = asText(values[spec.key]);
    if (current) {
      const error = spec.validate?.(current);
      if (error) throw new UsageError(`${spec.message}: ${error}`);
      continue;
    }

    // Options marked `manual` have no provisioning API and can be filled in
    // later from the admin console, so they never block a `--yes` run.
    // Provisionable values are created by an adapter later in the run.
    const required =
      spec.requiredWhen !== undefined &&
      spec.manual !== true &&
      !isProvisionable(spec, values);

    if (input.yes) {
      if (typeof spec.default === 'string' && spec.default) {
        values[spec.key] = spec.default;
        continue;
      }
      if (required) {
        throw new UsageError(
          `${spec.message} is required. Pass --${spec.flag ?? spec.key} <value>.`
        );
      }
      continue;
    }

    // Advanced options are only asked when they are needed or the user opted in.
    if (spec.advanced && !input.advanced && !required) continue;

    const initial =
      spec.key === 'siteName' ? asText(values.projectName) : undefined;
    const answer = await askValue(spec, {
      required,
      ...(initial ? { initial } : {}),
    });
    if (typeof answer === 'boolean') {
      values[spec.key] = answer;
    } else if (answer) {
      values[spec.key] = answer;
    } else if (required) {
      throw new UsageError(`${spec.message} is required.`);
    }
  }

  const resolved = applyDerivedDefaults(values, env);
  const { errors, warnings } = validateResolved(resolved);
  if (errors.length > 0) {
    throw new UsageError(
      `Invalid configuration:\n${errors.map((error) => `  - ${error}`).join('\n')}`
    );
  }

  return { values: resolved, warnings };
}
