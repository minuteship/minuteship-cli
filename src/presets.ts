import type { OptionValues } from './options/types.js';

/**
 * The modules each site type enables by default.
 *
 * The CLI asks only the questions that apply to the project it is building: a
 * tool site has no accounts, so asking it for a Google OAuth client id produces
 * a warning about a value nothing will read.
 *
 * This is a copy of the template's `PRESETS`, which is unavoidable — the CLI
 * ships separately and must answer before any template has been downloaded.
 * `tests/manifest-contract.test.ts` pins it against a snapshot of the template's
 * committed manifest, so the two cannot drift silently.
 */
export const PRESET_MODULES: Record<string, readonly string[]> = {
  saas: [
    'auth',
    'admin',
    'payment',
    'blog',
    'ai',
    'newsletter',
    'mail',
    'storage',
    'cache',
    'notification',
  ],
  tools: ['ai', 'blog', 'newsletter', 'mail', 'cache', 'notification'],
  directory: ['blog', 'newsletter', 'mail', 'cache', 'notification'],
};

/** Comma-separated `--modules`, or an empty list when it was not passed. */
export function selectedModules(values: OptionValues): string[] {
  const raw = values.modules;
  if (typeof raw !== 'string') return [];
  return raw
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item !== '');
}

/**
 * The project's modules, falling back to the preset's defaults.
 *
 * An explicit list wins even when it is empty in the template's eyes: the CLI
 * cannot tell "the user named nothing" from "the user wants the preset", so it
 * treats an absent `--modules` as the preset and a present one as the answer.
 */
export function projectModules(values: OptionValues): readonly string[] {
  const selected = selectedModules(values);
  if (selected.length > 0) return selected;
  const preset = typeof values.preset === 'string' ? values.preset : 'saas';
  return PRESET_MODULES[preset] ?? [];
}

/**
 * Whether the project includes `key`, directly or through a dependency.
 *
 * Dependencies are followed because the template expands them: selecting
 * `payment` means `auth` exists, so auth's env vars have to be collected even
 * though the user never named it.
 */
export function projectHasModule(values: OptionValues, key: string): boolean {
  const modules = new Set(projectModules(values));
  if (modules.has(key)) return true;

  // Dependencies in the manifest are few and stable; following them here keeps
  // the answer honest without a second copy of the dependency graph.
  const requires: Record<string, readonly string[]> = {
    admin: ['auth'],
    payment: ['auth'],
    storage: ['auth'],
  };
  for (const module of [...modules]) {
    for (const dependency of requires[module] ?? []) modules.add(dependency);
  }
  return modules.has(key);
}
