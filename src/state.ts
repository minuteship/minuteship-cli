import { chmod, mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';

export const STATE_VERSION = 1;

export type StepStatus = 'done' | 'skipped' | 'manual' | 'failed';

export interface StepRecord {
  status: StepStatus;
  at: string;
  message?: string;
}

/**
 * Everything the CLI needs to resume or delete a project.
 *
 * Resource ids and names only. Passwords, API keys, and webhook secrets are
 * never written here; secrets live in Worker secrets or the local env files.
 */
export interface ProjectState {
  version: number;
  projectName: string;
  siteName: string;
  targetDir: string;
  createdAt: string;
  updatedAt: string;
  steps: Record<string, StepRecord>;
  cloudflare?: {
    accountId?: string;
    workerName?: string;
    databaseId?: string;
    databaseName?: string;
    bucketName?: string;
    kvName?: string;
    kvNamespaceId?: string;
    domain?: string;
  };
  github?: {
    repo?: string;
    visibility?: string;
  };
  admin?: {
    email?: string;
    userId?: string;
  };
  payment?: {
    provider?: string;
    provisioned?: boolean;
  };
  warnings?: string[];
}

export function stateDir(targetDir: string): string {
  return path.join(targetDir, '.minuteship');
}

export function statePath(targetDir: string): string {
  return path.join(stateDir(targetDir), 'state.json');
}

function now(): string {
  return new Date().toISOString();
}

/**
 * Read the state file. A corrupt file is renamed aside instead of deleted, so
 * the operator can inspect it before `--force-new-state` overwrites anything.
 */
export async function readState(
  targetDir: string
): Promise<ProjectState | null> {
  const file = statePath(targetDir);
  let raw: string;
  try {
    raw = await readFile(file, 'utf8');
  } catch {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as ProjectState;
    if (typeof parsed !== 'object' || parsed === null || !parsed.steps) {
      throw new Error('unexpected shape');
    }
    return parsed;
  } catch {
    const backup = file.replace(
      /state\.json$/,
      `state.corrupt-${Date.now()}.json`
    );
    await rename(file, backup).catch(() => {});
    return null;
  }
}

/**
 * Move an existing state file aside without deleting it. Used by
 * `--force-new-state` so an operator can inspect the previous run.
 */
export async function backupState(targetDir: string): Promise<string | null> {
  const file = statePath(targetDir);
  try {
    await readFile(file, 'utf8');
  } catch {
    return null;
  }

  const backup = file.replace(
    /state\.json$/,
    `state.backup-${Date.now()}.json`
  );
  await rename(file, backup);
  return backup;
}

/** Atomic write with owner-only permissions. */
export async function writeState(
  targetDir: string,
  state: ProjectState
): Promise<void> {
  const dir = stateDir(targetDir);
  await mkdir(dir, { recursive: true, mode: 0o700 });

  const file = statePath(targetDir);
  const temp = `${file}.tmp`;
  const payload = `${JSON.stringify(state, null, 2)}\n`;

  await writeFile(temp, payload, { encoding: 'utf8', mode: 0o600 });
  await chmod(temp, 0o600);
  await rename(temp, file);
}

export function createState(input: {
  projectName: string;
  siteName: string;
  targetDir: string;
}): ProjectState {
  const timestamp = now();
  return {
    version: STATE_VERSION,
    projectName: input.projectName,
    siteName: input.siteName,
    targetDir: input.targetDir,
    createdAt: timestamp,
    updatedAt: timestamp,
    steps: {},
  };
}

export async function updateState(
  targetDir: string,
  patch:
    | Partial<ProjectState>
    | ((current: ProjectState) => Partial<ProjectState>)
): Promise<ProjectState> {
  const current = await readState(targetDir);
  if (!current) {
    throw new Error(
      `No .minuteship/state.json in ${targetDir}. Run \`create\` first, or pass --resume from the project directory.`
    );
  }

  const changes = typeof patch === 'function' ? patch(current) : patch;
  const next: ProjectState = {
    ...current,
    ...changes,
    steps: { ...current.steps, ...(changes.steps ?? {}) },
    cloudflare: { ...current.cloudflare, ...(changes.cloudflare ?? {}) },
    github: { ...current.github, ...(changes.github ?? {}) },
    admin: { ...current.admin, ...(changes.admin ?? {}) },
    payment: { ...current.payment, ...(changes.payment ?? {}) },
    updatedAt: now(),
  };

  await writeState(targetDir, next);
  return next;
}

export async function recordStep(
  targetDir: string,
  id: string,
  status: StepStatus,
  message?: string
): Promise<void> {
  await updateState(targetDir, (current) => ({
    steps: {
      ...current.steps,
      [id]: { status, at: now(), ...(message ? { message } : {}) },
    },
  }));
}

export function stepStatus(
  state: ProjectState | null,
  id: string
): StepStatus | undefined {
  return state?.steps[id]?.status;
}
