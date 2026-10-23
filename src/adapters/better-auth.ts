import { createRequire } from 'node:module';
import { hashPassword } from 'better-auth/crypto';

// `validator` ships CommonJS, and its deep-import typings are a namespace
// object, so resolve the callable with `createRequire` instead of a default
// import. This is the same function `better-auth-harmony` uses.
const require = createRequire(import.meta.url);
const normalizeEmail = require('validator/lib/normalizeEmail.js') as (
  email: string
) => string | false;

/** Same normalization `better-auth-harmony` applies to `normalized_email`. */
export function normalizeUserEmail(email: string): string | undefined {
  const normalized = normalizeEmail(email);
  // `normalizeEmail` does not validate: an empty input becomes `@`.
  if (!normalized || normalized.startsWith('@')) return undefined;
  return normalized;
}

export function hashUserPassword(password: string): Promise<string> {
  return hashPassword(password);
}

const PASSWORD_ALPHABET =
  'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';

/** 24 characters, no visually ambiguous glyphs. */
export function generateOneTimePassword(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return Array.from(
    bytes,
    (byte) => PASSWORD_ALPHABET[byte % PASSWORD_ALPHABET.length]
  ).join('');
}

export function sqlString(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

export interface AdminSqlInput {
  userId: string;
  accountId: string;
  email: string;
  normalizedEmail: string;
  passwordHash: string;
  name?: string;
  /** Millisecond timestamp; the D1 DDL only defaults `created_at`. */
  now?: number;
}

export function buildAdminInsertSql(input: AdminSqlInput): string {
  const name = input.name ?? 'Admin';
  // `account.updated_at` is NOT NULL without a DDL default, so both
  // timestamps must be written explicitly.
  const now = Math.trunc(input.now ?? Date.now());

  return [
    'INSERT INTO user (id, name, email, email_verified, role, normalized_email, must_change_password)',
    `VALUES (${sqlString(input.userId)}, ${sqlString(name)}, ${sqlString(input.email)}, 1, 'admin', ${sqlString(input.normalizedEmail)}, 1);`,
    '',
    'INSERT INTO account (id, account_id, provider_id, user_id, password, created_at, updated_at)',
    `VALUES (${sqlString(input.accountId)}, ${sqlString(input.userId)}, 'credential', ${sqlString(input.userId)}, ${sqlString(input.passwordHash)}, ${now}, ${now});`,
    '',
  ].join('\n');
}

export function buildAdminPasswordResetSql(input: {
  userId: string;
  passwordHash: string;
}): string {
  return [
    `UPDATE account SET password = ${sqlString(input.passwordHash)} WHERE user_id = ${sqlString(input.userId)} AND provider_id = 'credential';`,
    `UPDATE user SET must_change_password = 1 WHERE id = ${sqlString(input.userId)};`,
    '',
  ].join('\n');
}
