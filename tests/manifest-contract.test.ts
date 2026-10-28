import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { OPTIONS } from '../src/options/registry.js';
import { PRESET_MODULES } from '../src/presets.js';

/**
 * The CLI asks about providers and modules; the template decides what is legal.
 *
 * Both lists are real: the CLI needs them to build prompts, the template needs
 * them to validate `minuteship.config.ts`. They are duplicated by necessity —
 * the CLI ships separately — so this test pins one against a snapshot of the
 * template's committed manifest. A provider added or removed on either side
 * fails here instead of producing a prompt that writes a config the build
 * rejects.
 */

interface Manifest {
  modules: Array<{ key: string; presets?: string[] }>;
  presets: Array<{ key: string; modules: string[]; ctaRoutes: string[] }>;
  themes: Array<{ key: string }>;
  moduleSettings: Record<string, string[]>;
}

const manifest = JSON.parse(
  readFileSync(
    new URL('./fixtures/template.manifest.json', import.meta.url),
    'utf8'
  )
) as Manifest;

function choices(key: string): string[] {
  const spec = OPTIONS.find((option) => option.key === key);
  if (!spec) throw new Error(`no option ${key}`);
  return (spec.choices ?? []).map((choice) => choice.value);
}

describe('option registry vs template manifest', () => {
  it('offers exactly the presets the template defines', () => {
    expect(choices('preset').sort()).toEqual(
      manifest.presets.map((preset) => preset.key).sort()
    );
  });

  it('offers exactly the themes the template can render', () => {
    expect(choices('theme').sort()).toEqual(
      manifest.themes.map((theme) => theme.key).sort()
    );
  });

  it('offers exactly the providers the template accepts', () => {
    // Key names differ by convention (`mailProvider` vs `mail.provider`), so
    // the mapping is explicit rather than inferred.
    const pairs: Array<[string, string]> = [
      ['mailProvider', 'mail.provider'],
      ['newsletterProvider', 'newsletter.provider'],
      ['notificationProvider', 'notification.provider'],
    ];

    for (const [optionKey, manifestKey] of pairs) {
      expect(choices(optionKey).sort(), optionKey).toEqual(
        [...manifest.moduleSettings[manifestKey]!].sort()
      );
    }
  });

  it('knows the module list each preset enables', () => {
    // The CLI asks questions per module before it has downloaded a template, so
    // it carries its own copy of these lists; this is what keeps it honest.
    for (const preset of manifest.presets) {
      expect([...PRESET_MODULES[preset.key]!].sort(), preset.key).toEqual(
        [...preset.modules].sort()
      );
    }
    expect(Object.keys(PRESET_MODULES).sort()).toEqual(
      manifest.presets.map((preset) => preset.key).sort()
    );
  });
});
