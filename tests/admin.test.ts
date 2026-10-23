import { verifyPassword } from 'better-auth/crypto';
import { describe, expect, it } from 'vitest';
import {
  buildAdminInsertSql,
  buildAdminPasswordResetSql,
  generateOneTimePassword,
  hashUserPassword,
  normalizeUserEmail,
  sqlString,
} from '../src/adapters/better-auth.js';

describe('admin password hashing', () => {
  it('produces a hash the normal sign-in flow can verify', async () => {
    const password = generateOneTimePassword();
    const hash = await hashUserPassword(password);

    await expect(verifyPassword({ hash, password })).resolves.toBe(true);
    await expect(verifyPassword({ hash, password: `${password}x` })).resolves.toBe(
      false
    );
  });

  it('generates a 24-character password without ambiguous glyphs', () => {
    for (let index = 0; index < 20; index += 1) {
      const password = generateOneTimePassword();
      expect(password).toHaveLength(24);
      expect(password).toMatch(/^[A-HJ-NP-Za-km-z2-9]+$/);
    }
  });
});

describe('email normalization', () => {
  it('matches better-auth-harmony for Gmail', () => {
    expect(normalizeUserEmail('First.Last+tag@Gmail.com')).toBe(
      'firstlast@gmail.com'
    );
  });

  it('lowercases ordinary addresses and rejects empty input', () => {
    expect(normalizeUserEmail('User@Example.COM')).toBe('user@example.com');
    expect(normalizeUserEmail('')).toBeUndefined();
  });
});

describe('admin SQL', () => {
  it('escapes single quotes', () => {
    expect(sqlString("o'brien@example.com")).toBe("'o''brien@example.com'");
  });

  it('inserts a verified admin that must change its password', () => {
    const sql = buildAdminInsertSql({
      userId: 'user-1',
      accountId: 'account-1',
      email: 'admin@example.com',
      normalizedEmail: 'admin@example.com',
      passwordHash: 'salt:key',
      now: 1_730_000_000_000,
    });

    expect(sql).toContain('INSERT INTO user');
    expect(sql).toContain("'admin'");
    expect(sql).toContain('must_change_password)');
    expect(sql).toContain("INSERT INTO account");
    expect(sql).toContain("'credential'");
    expect(sql).toContain('salt:key');
    // `account.updated_at` is NOT NULL with no DDL default; omitting the
    // timestamps breaks the insert against a freshly migrated D1.
    expect(sql).toContain('created_at, updated_at)');
    expect(sql).toContain('1730000000000, 1730000000000)');
  });

  it('resets the password and re-arms the change flag', () => {
    const sql = buildAdminPasswordResetSql({
      userId: 'user-1',
      passwordHash: 'salt:key',
    });

    expect(sql).toContain("UPDATE account SET password = 'salt:key'");
    expect(sql).toContain('must_change_password = 1');
  });
});
