import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  bindingsFromManifest,
  readTemplateManifest,
  resolveBindingsFor,
} from '../src/bindings.js';

/**
 * These pin the decision that a project only gets the resources its modules
 * read. Every case corresponds to a real template manifest shape: a tools site
 * with no storage has no bucket, and `wrangler deploy` refuses to publish a
 * Worker whose declared bucket was never created.
 */

const MANIFEST = {
  modules: [
    { key: 'auth', bindings: ['d1'] },
    { key: 'payment', requires: ['auth'], bindings: ['d1'] },
    { key: 'storage', requires: ['auth'], bindings: ['r2', 'd1'] },
    { key: 'blog' },
    { key: 'cache', bindings: ['kv'] },
  ],
  presets: [
    { key: 'saas', modules: ['auth', 'payment', 'storage', 'blog', 'cache'] },
    { key: 'tools', modules: ['blog', 'cache'] },
  ],
};

describe('bindingsFromManifest', () => {
  it('always keeps D1: core db reads env.DB in every build', () => {
    expect(bindingsFromManifest(MANIFEST, ['blog'])).toEqual({
      d1: true,
      r2: false,
      kv: false,
    });
  });

  it('adds KV only for a module that declares it', () => {
    expect(bindingsFromManifest(MANIFEST, ['blog', 'cache']).kv).toBe(true);
  });

  it('expands dependencies before deciding', () => {
    // `storage` needs `auth`, and both need D1; only storage needs R2. Naming
    // storage alone has to be enough.
    const bindings = bindingsFromManifest(MANIFEST, ['storage']);
    expect(bindings.r2).toBe(true);
    expect(bindings.d1).toBe(true);
  });

  it('reports nothing extra for an empty module list', () => {
    expect(bindingsFromManifest(MANIFEST, [])).toEqual({
      d1: true,
      r2: false,
      kv: false,
    });
  });
});

describe('resolveBindingsFor', () => {
  it('falls back to every binding when the template has no manifest', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'ct-bindings-'));
    expect(await readTemplateManifest(root)).toEqual({});
    expect(
      await resolveBindingsFor(root, { modules: ['blog'], preset: 'tools' })
    ).toEqual({ d1: true, r2: true, kv: true });
  });

  it('reads the manifest shipped with the project', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'ct-bindings-'));
    await writeFile(
      path.join(root, 'minuteship.manifest.json'),
      JSON.stringify(MANIFEST),
      'utf8'
    );

    expect(
      await resolveBindingsFor(root, { modules: ['blog', 'cache'] })
    ).toEqual({ d1: true, r2: false, kv: true });
  });

  it('expands the preset when no modules were named', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'ct-bindings-'));
    await writeFile(
      path.join(root, 'minuteship.manifest.json'),
      JSON.stringify(MANIFEST),
      'utf8'
    );

    // `tools` has no storage, so no bucket — the whole point of the change.
    expect(await resolveBindingsFor(root, { modules: [], preset: 'tools' })).toEqual(
      { d1: true, r2: false, kv: true }
    );
    // `saas` does have storage.
    expect(await resolveBindingsFor(root, { modules: [], preset: 'saas' })).toEqual(
      { d1: true, r2: true, kv: true }
    );
  });
});
