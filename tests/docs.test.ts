import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  renderOptionsTable,
  replaceOptionsTable,
} from '../src/docs/generate-options-table.js';
import { OPTIONS } from '../src/options/registry.js';

describe('generated CLI docs', () => {
  for (const name of ['cli.md', 'cli.zh.md']) {
    it(`docs/${name} has the current options table`, async () => {
      const file = fileURLToPath(
        new URL(`../docs/${name}`, import.meta.url)
      );
      const markdown = await readFile(file, 'utf8');

      expect(markdown).toContain(renderOptionsTable());
      // Also proves the markers are present and the block is exactly the
      // generated content, with no manual edits inside it.
      expect(replaceOptionsTable(markdown)).toBe(markdown);
    });
  }
});

describe('option registry', () => {
  it('has unique flags and env variables', () => {
    const flags = OPTIONS.flatMap((spec) =>
      spec.flag ? [spec.flag] : []
    );
    expect(new Set(flags).size).toBe(flags.length);

    const envVars = OPTIONS.flatMap((spec) =>
      spec.envVar ? [spec.envVar] : []
    );
    expect(new Set(envVars).size).toBe(envVars.length);
  });

  it('never documents a secret default value', () => {
    for (const spec of OPTIONS) {
      if (spec.kind === 'secret') {
        expect(
          typeof spec.default === 'string' && spec.default.length > 0
        ).toBe(false);
      }
    }
  });
});
