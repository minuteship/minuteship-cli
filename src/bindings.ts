import { readFile } from 'node:fs/promises';
import path from 'node:path';

/**
 * Which Cloudflare resources a given module selection needs.
 *
 * The template's `minuteship.manifest.json` already records each module's
 * bindings and dependencies, and it is committed, so it is the right source:
 * computing this from a copy in the CLI would be a second catalogue to keep in
 * step. The manifest is read from the scaffolded project, which is why this runs
 * after the template is copied.
 */
export interface BindingsNeeded {
  /** Always required: see the note in `requiredBindings`. */
  d1: boolean;
  r2: boolean;
  kv: boolean;
}

interface ManifestModule {
  key?: string;
  requires?: string[];
  bindings?: string[];
}

interface ManifestPreset {
  key?: string;
  modules?: string[];
}

interface Manifest {
  modules?: ManifestModule[];
  presets?: ManifestPreset[];
}

export function bindingsFromManifest(
  manifest: Manifest,
  modules: readonly string[]
): BindingsNeeded {
  const byKey = new Map<string, ManifestModule>();
  for (const module of manifest.modules ?? []) {
    if (module.key) byKey.set(module.key, module);
  }

  // Presets and module lists name only what the user chose; a dependency such
  // as `payment -> auth -> d1` still has to be provisioned.
  const seen = new Set<string>();
  const visit = (key: string): void => {
    if (seen.has(key)) return;
    seen.add(key);
    for (const dependency of byKey.get(key)?.requires ?? []) visit(dependency);
  };
  for (const key of modules) visit(key);

  const needed = new Set<string>();
  for (const key of seen) {
    for (const binding of byKey.get(key)?.bindings ?? []) needed.add(binding);
  }

  /**
   * D1 is not optional, even for a project whose modules need no tables.
   *
   * `src/db/**` is core rather than a module, so it is type-checked in every
   * build, and it reads `env.DB`. `wrangler types` derives the `Env` interface
   * from `wrangler.jsonc`, so dropping the binding would turn every build into
   * a type error. Making the database itself optional means making `src/db`
   * a module first; until then, declaring it is the honest answer.
   */
  return {
    d1: true,
    r2: needed.has('r2'),
    kv: needed.has('kv'),
  };
}

/** Read the manifest shipped with a scaffolded project. */
export async function readTemplateManifest(
  targetDir: string
): Promise<Manifest> {
  try {
    const source = await readFile(
      path.join(targetDir, 'minuteship.manifest.json'),
      'utf8'
    );
    return JSON.parse(source) as Manifest;
  } catch {
    // A template pinned before the manifest existed cannot answer; assuming
    // every binding matches what the template itself declares, so provisioning
    // is never skipped for a resource the app still reads.
    return {};
  }
}

/**
 * The project's modules, as the manifest spells them.
 *
 * An empty selection means "the preset's defaults" — `configModules` writes the
 * user's choice, and the template expands nothing in the CLI, so the preset has
 * to be expanded here before its bindings can be known.
 */
function projectModules(
  manifest: Manifest,
  modules: readonly string[],
  preset: string | undefined
): readonly string[] {
  if (modules.length > 0) return modules;
  const defaults = manifest.presets?.find(
    (candidate) => candidate.key === preset
  );
  return defaults?.modules ?? [];
}

/** The bindings for a project, falling back to all three when unanswerable. */
export async function resolveBindingsFor(
  targetDir: string,
  options: { modules: readonly string[]; preset?: string }
): Promise<BindingsNeeded> {
  const manifest = await readTemplateManifest(targetDir);
  if (!manifest.modules?.length) {
    return { d1: true, r2: true, kv: true };
  }
  return bindingsFromManifest(
    manifest,
    projectModules(manifest, options.modules, options.preset)
  );
}
