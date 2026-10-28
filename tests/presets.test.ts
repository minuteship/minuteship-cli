import { describe, expect, it } from 'vitest';
import { applyDerivedDefaults } from '../src/options/schema.js';
import { PRESET_MODULES, projectHasModule, projectModules } from '../src/presets.js';

/**
 * The questions a project is asked must match the modules it will have. A tool
 * site has no accounts, so asking for a Google OAuth client id — or requiring
 * "at least one login method" — blocks a project that is perfectly valid.
 */

function options(overrides: Record<string, unknown> = {}) {
  return applyDerivedDefaults(
    { projectName: 'acme', targetDir: '/tmp/acme', ...overrides },
    {}
  );
}

describe('projectModules', () => {
  it('uses the preset defaults when no modules were named', () => {
    expect(projectModules(options({ preset: 'tools' }))).toEqual(
      PRESET_MODULES.tools
    );
  });

  it('prefers an explicit list', () => {
    expect(
      projectModules(options({ preset: 'saas', modules: 'blog,docs' }))
    ).toEqual(['blog', 'docs']);
  });

  it('defaults to the SaaS preset when nothing was chosen', () => {
    expect(projectModules(options())).toEqual(PRESET_MODULES.saas);
  });
});

describe('projectHasModule', () => {
  it('answers from the preset when no list was given', () => {
    expect(projectHasModule(options({ preset: 'tools' }), 'auth')).toBe(false);
    expect(projectHasModule(options({ preset: 'saas' }), 'auth')).toBe(true);
  });

  it('follows an explicit list even when the preset would include the module', () => {
    expect(
      projectHasModule(options({ preset: 'saas', modules: 'blog' }), 'auth')
    ).toBe(false);
  });

  it('counts a dependency as present', () => {
    // `payment` requires `auth`, so auth's questions and env vars apply.
    expect(
      projectHasModule(options({ preset: 'tools', modules: 'payment' }), 'auth')
    ).toBe(true);
  });
});
