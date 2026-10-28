import { describe, expect, it } from 'vitest';
import { configModules, renderConfigFile } from '../src/config-file.js';

describe('renderConfigFile', () => {
  it('writes values only, importing the type from the template', () => {
    const output = renderConfigFile({
      preset: 'tools',
      modules: ['ai', 'blog'],
      theme: 'amber',
      site: {
        name: 'Acme',
        title: 'Acme tools',
        description: 'Small tools for small jobs.',
        url: 'https://acme.example.com',
        locales: ['en'],
      },
    });

    expect(output).toContain(
      "import type { MinuteshipConfig } from './src/config/project-config.ts';"
    );
    expect(output).toContain('export const config: MinuteshipConfig = {');
    expect(output).toContain("preset: 'tools'");
    expect(output).toContain("theme: 'amber'");
    expect(output).toContain('    \'ai\',');
    expect(output).toContain('    \'blog\',');
    expect(output).toContain("url: 'https://acme.example.com'");
    expect(output).toContain('locales: [\'en\']');
    // No payment block when the picker was not answered.
    expect(output).not.toContain('payment:');
    // No second source of truth: the file must not declare the type.
    expect(output).not.toContain('interface MinuteshipConfig');
  });

  it('escapes quotes so a brand name cannot break the file', () => {
    const output = renderConfigFile({
      preset: 'saas',
      modules: [],
      theme: 'ocean',
      site: {
        name: "Bob's Shop",
        title: "Bob's Shop",
        description: 'Backslash \\ and apostrophe \'',
        url: 'http://localhost:3000',
        locales: ['en'],
      },
    });

    expect(output).toContain("name: 'Bob\\'s Shop'");
    expect(output).toContain("description: 'Backslash \\\\ and apostrophe \\''");
  });

  it('writes localized overrides and the payment provider', () => {
    const output = renderConfigFile({
      preset: 'saas',
      modules: ['payment'],
      theme: 'amber',
      site: {
        name: 'Acme',
        title: 'Acme',
        description: 'Acme.',
        url: 'https://acme.example.com',
        locales: ['en', 'zh'],
        localized: { zh: { title: '极致' } },
      },
      payment: { provider: 'creem' },
    });

    expect(output).toContain('    localized: {');
    expect(output).toContain('      zh: {');
    expect(output).toContain("        title: '极致',");
    expect(output).toContain('  payment: {');
    expect(output).toContain("    provider: 'creem',");
    // The payment block comes before the theme, matching the template shape.
    expect(output.indexOf('  payment: {')).toBeLessThan(
      output.indexOf('  theme:')
    );
  });

  it('omits empty localization entries', () => {
    const output = renderConfigFile({
      preset: 'saas',
      modules: [],
      theme: 'amber',
      site: {
        name: 'Acme',
        title: 'Acme',
        description: 'Acme.',
        url: 'http://localhost:3000',
        locales: ['en'],
        localized: { zh: {}, fr: { title: 'Acme FR' } },
      },
    });

    expect(output).not.toContain('zh: {');
    expect(output).toContain("fr: {");
  });

  it('writes module settings only for modules the project has', () => {
    const saas = renderConfigFile({
      preset: 'saas',
      modules: ['auth', 'mail', 'newsletter', 'notification'],
      theme: 'amber',
      site: {
        name: 'Acme',
        title: 'Acme',
        description: 'Acme.',
        url: 'https://acme.example.com',
        locales: ['en'],
      },
      auth: { googleLogin: true, credentialLogin: true, deleteAccount: false },
      mail: {
        provider: 'resend',
        fromEmail: 'Acme <hi@acme.example.com>',
        supportEmail: 'help@acme.example.com',
      },
      newsletter: { provider: 'beehiiv', autoSubscribeAfterSignUp: false },
      notification: { provider: 'feishu' },
    });

    expect(saas).toContain('  auth: {');
    expect(saas).toContain('    googleLogin: true,');
    expect(saas).toContain('    deleteAccount: false,');
    expect(saas).toContain("    provider: 'resend',");
    expect(saas).toContain("    fromEmail: 'Acme <hi@acme.example.com>',");
    expect(saas).toContain("    provider: 'beehiiv',");
    expect(saas).toContain('    autoSubscribeAfterSignUp: false,');
    expect(saas).toContain('  notification: {');
    expect(saas).toContain("    provider: 'feishu',");
  });

  it('omits module settings for modules the project does not have', () => {
    const tools = renderConfigFile({
      preset: 'tools',
      modules: ['blog'],
      theme: 'amber',
      site: {
        name: 'Acme',
        title: 'Acme',
        description: 'Acme.',
        url: 'https://acme.example.com',
        locales: ['en'],
      },
      auth: { googleLogin: true },
      mail: { provider: 'resend' },
      newsletter: { provider: 'resend' },
      notification: { provider: 'discord' },
    });

    // The answers do not apply to a site with no auth, mail, newsletter or
    // notification module, so writing them would be dead config.
    expect(tools).not.toContain('  auth: {');
    expect(tools).not.toContain('  mail: {');
    expect(tools).not.toContain('  newsletter: {');
    expect(tools).not.toContain('  notification: {');
  });

  it('ends with a newline and no trailing whitespace lines', () => {
    const output = renderConfigFile({
      preset: 'directory',
      modules: ['blog'],
      theme: 'amber',
      site: {
        name: 'Acme',
        title: 'Acme',
        description: 'Acme.',
        url: 'http://localhost:3000',
        locales: ['en'],
      },
    });

    expect(output.endsWith('\n')).toBe(true);
    expect(output.endsWith('\n\n')).toBe(false);
  });
});

describe('configModules', () => {
  it('deduplicates without expanding dependencies', () => {
    expect(configModules(['auth', 'auth', 'admin', 'blog'])).toEqual([
      'auth',
      'admin',
      'blog',
    ]);
    // `admin` requires `auth`, but the template expands that at build time.
    expect(configModules(['admin'])).toEqual(['admin']);
  });

  it('preserves the order the user chose', () => {
    expect(configModules(['blog', 'ai', 'auth'])).toEqual([
      'blog',
      'ai',
      'auth',
    ]);
  });
});
