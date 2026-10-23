import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const DEFAULT_REPO =
  process.env.CREATE_MINUTESHIP_REPO ?? 'minuteship/minuteship';
const DEFAULT_REF = process.env.CREATE_MINUTESHIP_REF ?? 'main';

export interface TemplateSource {
  dir: string;
  cleanup: () => Promise<void>;
}

/**
 * Download the template (a private repository). The token is read from the environment and
 * passed to giget only; it is never printed or written to state.
 */
export async function fetchTemplate(): Promise<TemplateSource> {
  const localTemplate = process.env.CREATE_MINUTESHIP_TEMPLATE_DIR;
  if (localTemplate) {
    return { dir: path.resolve(localTemplate), cleanup: async () => {} };
  }

  const token = process.env.GITHUB_TOKEN;
  const tempRoot = await mkdtemp(path.join(tmpdir(), 'create-minuteship-'));
  const { downloadTemplate } = await import('giget');

  const result = await downloadTemplate(`${DEFAULT_REPO}#${DEFAULT_REF}`, {
    dir: path.join(tempRoot, 'template'),
    auth: token,
    forceClean: true,
  });

  return {
    dir: result.dir,
    cleanup: async () => {
      await rm(tempRoot, { recursive: true, force: true });
    },
  };
}
