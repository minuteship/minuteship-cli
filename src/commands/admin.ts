import { chmod, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  buildAdminInsertSql,
  buildAdminPasswordResetSql,
  generateOneTimePassword,
  hashUserPassword,
  normalizeUserEmail,
  sqlString,
} from '../adapters/better-auth.js';
import { wranglerRun } from '../adapters/wrangler.js';
import type { Logger } from '../log.js';
import type { PackageManager } from '../types.js';

export interface AdminBootstrapInput {
  targetDir: string;
  packageManager: PackageManager;
  databaseName: string;
  email: string;
  /** Rotate the password for an existing admin instead of skipping. */
  resetPassword?: boolean;
  logger: Logger;
}

export interface AdminBootstrapResult {
  created: boolean;
  reset: boolean;
  userId: string;
  /** Only returned when a new password was generated. Printed once. */
  password?: string;
  warning?: string;
}

function parseD1Rows(stdout: string): Record<string, unknown>[] {
  try {
    const parsed = JSON.parse(stdout) as unknown;
    const first = Array.isArray(parsed) ? parsed[0] : parsed;
    if (
      first &&
      typeof first === 'object' &&
      Array.isArray((first as { results?: unknown }).results)
    ) {
      return (first as { results: Record<string, unknown>[] }).results;
    }
    return [];
  } catch {
    return [];
  }
}

async function findUser(
  input: AdminBootstrapInput
): Promise<{ id: string } | undefined> {
  const result = await wranglerRun(
    { targetDir: input.targetDir, packageManager: input.packageManager },
    [
      'd1',
      'execute',
      input.databaseName,
      '--remote',
      '--command',
      `SELECT id FROM user WHERE email = ${sqlString(input.email)} LIMIT 1`,
      '--json',
    ],
    { allowFailure: true }
  );

  if (result.exitCode !== 0) {
    throw new Error(
      `Could not query the admin user: ${result.stderr.trim().split('\n')[0] ?? 'unknown error'}`
    );
  }

  const row = parseD1Rows(result.stdout)[0];
  return typeof row?.id === 'string' ? { id: row.id } : undefined;
}

async function executeSqlFile(
  input: AdminBootstrapInput,
  sql: string
): Promise<void> {
  const dir = await mkdtemp(path.join(tmpdir(), 'minuteship-admin-'));
  const file = path.join(dir, 'admin.sql');

  try {
    await writeFile(file, sql, { encoding: 'utf8', mode: 0o600 });
    await chmod(file, 0o600);

    const result = await wranglerRun(
      { targetDir: input.targetDir, packageManager: input.packageManager },
      [
        'd1',
        'execute',
        input.databaseName,
        '--remote',
        '--file',
        file,
        '--json',
      ],
      { allowFailure: true }
    );

    if (result.exitCode !== 0) {
      throw new Error(
        `Could not create the admin account: ${
          result.stderr.trim().split('\n')[0] ?? 'unknown error'
        }`
      );
    }
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

/**
 * Insert an admin directly into D1 with a one-time password.
 *
 * The password is hashed with Better Auth's own scrypt parameters so the
 * normal credential sign-in flow accepts it. It is returned once and never
 * written to state.
 */
export async function createAdminAccount(
  input: AdminBootstrapInput
): Promise<AdminBootstrapResult> {
  const normalizedEmail = normalizeUserEmail(input.email);
  if (!normalizedEmail) {
    throw new Error(`Could not normalize the admin email: ${input.email}`);
  }

  const existing = await findUser(input);
  const password = generateOneTimePassword();
  const passwordHash = await hashUserPassword(password);

  if (existing) {
    if (!input.resetPassword) {
      return {
        created: false,
        reset: false,
        userId: existing.id,
        warning:
          'An account with this email already exists. Its password was not changed; use --reset-admin-password to rotate it.',
      };
    }

    input.logger.info('Resetting the existing admin password…');
    await executeSqlFile(
      input,
      buildAdminPasswordResetSql({ userId: existing.id, passwordHash })
    );

    return {
      created: false,
      reset: true,
      userId: existing.id,
      password,
    };
  }

  const userId = crypto.randomUUID();
  const accountId = crypto.randomUUID();

  await executeSqlFile(
    input,
    buildAdminInsertSql({
      userId,
      accountId,
      email: input.email,
      normalizedEmail,
      passwordHash,
    })
  );

  return { created: true, reset: false, userId, password };
}
