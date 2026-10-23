import { OPTIONS } from '../options/registry.js';
import type { OptionGroup, OptionSpec } from '../options/types.js';

/**
 * Markdown options table generated from the single option registry.
 *
 * `docs/cli.md` and `docs/cli.zh.md` embed the output between the markers
 * below; a unit test regenerates it and fails when the docs drift.
 */

export const CLI_OPTIONS_BEGIN = '<!-- BEGIN:cli-options -->';
export const CLI_OPTIONS_END = '<!-- END:cli-options -->';

const GROUP_ORDER: readonly OptionGroup[] = [
  'project',
  'features',
  'cloudflare',
  'auth',
  'payment',
  'mail',
  'newsletter',
  'notification',
  'analytics',
  'chat',
  'ai',
];

const GROUP_LABELS: Record<OptionGroup, string> = {
  project: 'Project',
  features: 'Features',
  cloudflare: 'Cloudflare',
  auth: 'Auth',
  payment: 'Payment',
  mail: 'Mail',
  newsletter: 'Newsletter',
  notification: 'Notification',
  analytics: 'Analytics',
  chat: 'Chat',
  ai: 'AI',
};

function escapeCell(value: string): string {
  return value.replaceAll('|', '\\|').replaceAll('\n', ' ');
}

function flagLabel(spec: OptionSpec): string {
  if (!spec.flag) return '_(positional)_';
  const flag = `\`--${spec.flag}\``;
  return spec.kind === 'boolean' ? `${flag} / \`--no-${spec.flag}\`` : flag;
}

function description(spec: OptionSpec): string {
  return spec.hint ? `${spec.message} (${spec.hint})` : spec.message;
}

export function renderOptionsTable(
  options: readonly OptionSpec[] = OPTIONS
): string {
  const rows: string[] = [
    '| Group | Flag | Env variable | Description |',
    '|-------|------|--------------|-------------|',
  ];

  for (const group of GROUP_ORDER) {
    for (const spec of options) {
      if (spec.group !== group) continue;
      rows.push(
        `| ${GROUP_LABELS[group]} | ${flagLabel(spec)} | ${
          spec.envVar ? `\`${spec.envVar}\`` : '—'
        } | ${escapeCell(description(spec))} |`
      );
    }
  }

  return rows.join('\n');
}

/** Replace the generated block in a docs file, or throw when markers are absent. */
export function replaceOptionsTable(markdown: string): string {
  const begin = markdown.indexOf(CLI_OPTIONS_BEGIN);
  const end = markdown.indexOf(CLI_OPTIONS_END);
  if (begin === -1 || end === -1 || end < begin) {
    throw new Error('CLI options markers are missing from the docs file.');
  }
  const before = markdown.slice(0, begin + CLI_OPTIONS_BEGIN.length);
  const after = markdown.slice(end);
  return `${before}\n\n${renderOptionsTable()}\n\n${after}`;
}
