import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const DEFAULT_REPO =
  process.env.CREATE_MINUTESHIP_REPO ?? 'minuteship/minuteship';
// Pin a released template tag so a template change on main cannot break a CLI
// that was built against an older layout. Bump it together with the template.
export const TEMPLATE_VERSION = 'v0.2.1';
const DEFAULT_REF = process.env.CREATE_MINUTESHIP_REF ?? TEMPLATE_VERSION;

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

  const result = await downloadTemplate(`github:${DEFAULT_REPO}#${DEFAULT_REF}`, {
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
