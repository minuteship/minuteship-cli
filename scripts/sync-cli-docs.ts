import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { replaceOptionsTable } from '../src/docs/generate-options-table.js';

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..'
);

for (const name of ['cli.md', 'cli.zh.md']) {
  const file = path.join(repoRoot, 'docs', name);
  const markdown = await readFile(file, 'utf8');
  const next = replaceOptionsTable(markdown);
  if (next !== markdown) {
    await writeFile(file, next, 'utf8');
    process.stdout.write(`Updated docs/${name}\n`);
  } else {
    process.stdout.write(`docs/${name} already up to date\n`);
  }
}
