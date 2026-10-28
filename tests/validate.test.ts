import { describe, expect, it } from 'vitest';
import {
  PACKAGE_MANAGERS,
  PAYMENT_PROVIDERS,
} from '../src/types.js';
import {
  isPaymentProvider,
  validateMailbox,
  validateProjectName,
  validateSiteName,
} from '../src/validate.js';

describe('validateProjectName', () => {
  it('accepts lowercase names with dots, dashes, and underscores', () => {
    for (const name of ['acme', 'acme-saas', 'acme_app', 'acme.app2', 'a1']) {
      expect(validateProjectName(name)).toBeNull();
    }
  });

  it('rejects empty, too long, and unsafe names', () => {
    expect(validateProjectName('')).toMatch(/required/);
    expect(validateProjectName('   ')).toMatch(/required/);
    expect(validateProjectName('a'.repeat(65))).toMatch(/64 characters/);
    expect(validateProjectName('Acme')).toMatch(/lowercase/);
    expect(validateProjectName('-acme')).toMatch(/lowercase/);
    expect(validateProjectName('../acme')).toMatch(/lowercase/);
    expect(validateProjectName('acme/app')).toMatch(/lowercase/);
    expect(validateProjectName('node_modules')).toMatch(/reserved/);
  });

  it('trims surrounding whitespace before validating', () => {
    expect(validateProjectName('  acme  ')).toBeNull();
  });
});

describe('validateSiteName', () => {
  it('accepts readable names and rejects empty values', () => {
    expect(validateSiteName('Acme SaaS')).toBeNull();
    expect(validateSiteName('')).toMatch(/required/);
    expect(validateSiteName('x'.repeat(101))).toMatch(/100 characters/);
  });
});

describe('validateMailbox', () => {
  it('accepts a bare address and the display-name form', () => {
    expect(validateMailbox('support@example.com')).toBeNull();
    expect(validateMailbox('MinuteShip <support@example.com>')).toBeNull();
    expect(validateMailbox('  Acme  <hi@acme.dev>  ')).toBeNull();
  });

  it('rejects a display name with no usable address', () => {
    expect(validateMailbox('')).toMatch(/required/);
    expect(validateMailbox('MinuteShip')).toMatch(/Enter an address/);
    expect(validateMailbox('MinuteShip <nope>')).toMatch(/Enter an address/);
  });
});

describe('isPaymentProvider', () => {
  it('accepts supported providers and the disabled option', () => {
    for (const provider of PAYMENT_PROVIDERS) {
      expect(isPaymentProvider(provider)).toBe(true);
    }
  });

  it('rejects unknown providers', () => {
    expect(isPaymentProvider('paypal')).toBe(false);
  });
});

describe('package managers', () => {
  it('offers the supported managers', () => {
    expect(PACKAGE_MANAGERS).toEqual(['pnpm', 'npm', 'yarn', 'bun']);
  });
});
