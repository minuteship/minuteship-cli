import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { renderEnv } from '../src/options/env.js';
import { collectOptions } from '../src/options/prompts.js';
import { OPTIONS } from '../src/options/registry.js';
import { applyDerivedDefaults } from '../src/options/schema.js';
import type { CreateOptions } from '../src/options/types.js';

// Snapshot of the template's .env.example; refresh it when the template's env
// surface changes.
const envExample = readFileSync(
  new URL('./fixtures/template.env.example', import.meta.url),
  'utf8'
);

const exampleKeys = new Set(
  envExample
    .split('\n')
    .map((line) => /^([A-Z0-9_]+)=/.exec(line)?.[1])
    .filter((key): key is string => Boolean(key))
);

function baseValues(overrides: Record<string, unknown> = {}): CreateOptions {
  return applyDerivedDefaults(
    {
      projectName: 'acme',
      createAdmin: false,
      ...overrides,
    },
    {}
  );
}

describe('option registry', () => {
  it('covers every key in .env.example', () => {
    const covered = new Set(
      OPTIONS.filter((spec) => spec.envVar).map((spec) => spec.envVar)
    );

    // Generated after the D1 database exists, so it is intentionally absent.
    covered.add('CLOUDFLARE_DATABASE_ID');

    const missing = [...exampleKeys].filter((key) => !covered.has(key));
    expect(missing).toEqual([]);
  });

  it('uses unique flags', () => {
    const flags = OPTIONS.map((spec) => spec.flag).filter(
      (flag): flag is string => Boolean(flag)
    );
    expect(new Set(flags).size).toBe(flags.length);
  });
});

describe('renderEnv', () => {
  it('never puts build-time values into Worker secrets', () => {
    const options = baseValues({
      enableGoogleAnalytics: true,
      googleAnalyticsId: 'G-TEST1234',
      paymentProvider: 'stripe',
      stripeSecretKey: 'sk_test_123',
    });

    const rendered = renderEnv({ options, authSecret: 'secret-value' });

    expect(rendered.workerSecrets).not.toContain('VITE_');
    expect(rendered.production).toContain('VITE_GOOGLE_ANALYTICS_ID');
    expect(rendered.workerSecrets).toContain('STRIPE_SECRET_KEY');
    expect(rendered.local).toContain("VITE_BASE_URL='http://localhost:3000'");
  });

  it('derives the base URL from a custom domain', () => {
    const options = baseValues({ domain: 'app.example.com' });
    expect(options.baseUrl).toBe('https://app.example.com');
  });
});

describe('collectOptions', () => {
  it('requires an analytics id when analytics is enabled', async () => {
    await expect(
      collectOptions({
        initial: {
          projectName: 'acme',
          createAdmin: false,
          deploy: false,
          enableGoogleAnalytics: true,
        },
        yes: true,
        advanced: false,
        env: {},
      })
    ).rejects.toThrow(/Google Analytics measurement id/);
  });

  it('accepts a valid analytics id', async () => {
    const { values } = await collectOptions({
      initial: {
        projectName: 'acme',
        createAdmin: false,
        deploy: false,
        enableGoogleAnalytics: true,
        googleAnalyticsId: 'G-ABC12345',
      },
      yes: true,
      advanced: false,
      env: {},
    });

    expect(values.googleAnalyticsId).toBe('G-ABC12345');
  });

  it('lets manual credentials be filled in after deployment', async () => {
    const { values, warnings } = await collectOptions({
      initial: { projectName: 'acme', createAdmin: false, deploy: false },
      yes: true,
      advanced: false,
      env: {},
    });

    expect(values.resendApiKey).toBeUndefined();
    expect(warnings.join('\n')).toContain('Resend API key is not set');
  });

  it('accepts a provider whose ids are provisioned by an adapter', async () => {
    const { values } = await collectOptions({
      initial: {
        projectName: 'acme',
        createAdmin: false,
        deploy: false,
        paymentProvider: 'creem',
        creemApiKey: 'creem_test_key',
      },
      yes: true,
      advanced: false,
      env: {},
    });

    expect(values.creemDebug).toBe(true);
    expect(values.creemProductProMonthly).toBeUndefined();
  });

  it('requires a public base URL before deploying', async () => {
    await expect(
      collectOptions({
        initial: { projectName: 'acme', createAdmin: false, deploy: true },
        yes: true,
        advanced: false,
        env: {},
      })
    ).rejects.toThrow(/public base URL is required/i);

    const { values } = await collectOptions({
      initial: {
        projectName: 'acme',
        createAdmin: false,
        deploy: true,
        domain: 'app.example.com',
      },
      yes: true,
      advanced: false,
      env: {},
    });

    expect(values.baseUrl).toBe('https://app.example.com');
  });
});
