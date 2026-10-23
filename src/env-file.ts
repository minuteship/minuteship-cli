import { readFile } from 'node:fs/promises';

function unquote(value: string): string {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith("'") && trimmed.endsWith("'")) ||
    (trimmed.startsWith('"') && trimmed.endsWith('"'))
  ) {
    const inner = trimmed.slice(1, -1);
    return trimmed.startsWith("'")
      ? inner.replace(/\\'/g, "'").replace(/\\\\/g, '\\')
      : inner.replace(/\\"/g, '"').replace(/\\\\/g, '\\');
  }
  return trimmed;
}

/** Minimal dotenv parser: `KEY=value`, optional quotes, `#` comments. */
export function parseEnvContent(content: string): Record<string, string> {
  const values: Record<string, string> = {};

  for (const rawLine of content.split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;

    const separator = line.indexOf('=');
    if (separator <= 0) continue;

    const key = line.slice(0, separator).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;

    values[key] = unquote(line.slice(separator + 1));
  }

  return values;
}

export async function parseEnvFile(
  filePath: string
): Promise<Record<string, string>> {
  try {
    return parseEnvContent(await readFile(filePath, 'utf8'));
  } catch {
    return {};
  }
}

export async function readEnvValue(
  filePath: string,
  key: string
): Promise<string | undefined> {
  const values = await parseEnvFile(filePath);
  const value = values[key];
  return value && value !== '' ? value : undefined;
}
