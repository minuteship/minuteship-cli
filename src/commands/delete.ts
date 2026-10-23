import prompts from 'prompts';
import { wranglerRun } from '../adapters/wrangler.js';
import { run } from '../exec.js';
import { summarizeCommandError } from '../cloudflare.js';
import { readState } from '../state.js';
import type { Logger } from '../log.js';
import type { PackageManager } from '../types.js';

export interface DeleteCommandInput {
  targetDir: string;
  yes: boolean;
  dryRun: boolean;
  logger: Logger;
  packageManager: PackageManager;
  /** Also delete the GitHub repository recorded in state. */
  deleteGithub?: boolean;
}

export interface DeleteResource {
  kind: 'github' | 'worker' | 'd1' | 'r2' | 'kv' | 'dns';
  name: string;
  command?: string;
}

async function confirm(projectName: string): Promise<boolean> {
  const answer = await prompts(
    {
      type: 'text',
      name: 'confirmation',
      message: `Type "${projectName}" to delete these resources`,
      validate: (value) =>
        value === projectName ? true : `Type exactly "${projectName}".`,
    },
    { onCancel: () => false }
  );

  return answer.confirmation === projectName;
}

function collectResources(input: DeleteCommandInput) {
  return readState(input.targetDir).then((state) => {
    if (!state) {
      throw new Error(
        `No .minuteship/state.json in ${input.targetDir}. Nothing to delete.`
      );
    }

    const resources: DeleteResource[] = [];
    const skipped: string[] = [];

    // Only names recorded in state are deleted. Guessing from the project
    // name could remove a resource that belongs to a different project.
    const worker = state.cloudflare?.workerName;
    const database = state.cloudflare?.databaseName;
    const bucket = state.cloudflare?.bucketName;
    const kvName = state.cloudflare?.kvName;
    const kvId = state.cloudflare?.kvNamespaceId;

    if (input.deleteGithub && state.github?.repo) {
      resources.push({
        kind: 'github',
        name: state.github.repo,
        command: `gh repo delete ${state.github.repo} --yes`,
      });
    }
    if (worker) {
      resources.push({
        kind: 'worker',
        name: worker,
        command: `wrangler delete ${worker}`,
      });
    } else {
      skipped.push('Worker name is not recorded in state.');
    }
    if (state.cloudflare?.domain) {
      resources.push({
        kind: 'dns',
        name: state.cloudflare.domain,
        command:
          'Custom domain route is removed with the Worker; DNS records may remain.',
      });
    }
    if (database) {
      resources.push({
        kind: 'd1',
        name: database,
        command: `wrangler d1 delete ${database} -y`,
      });
    } else {
      skipped.push('D1 database name is not recorded in state.');
    }
    if (bucket) {
      resources.push({
        kind: 'r2',
        name: bucket,
        command: `wrangler r2 bucket delete ${bucket}`,
      });
    } else {
      skipped.push('R2 bucket name is not recorded in state.');
    }
    if (kvId && kvName) {
      resources.push({
        kind: 'kv',
        name: kvName,
        command: `wrangler kv namespace delete --namespace-id ${kvId}`,
      });
    } else {
      skipped.push('KV namespace id is not recorded in state.');
    }

    return { state, resources, skipped };
  });
}

export async function runDelete(
  input: DeleteCommandInput
): Promise<{ deleted: DeleteResource[]; warnings: string[] }> {
  const { state, resources, skipped } = await collectResources(input);
  const wranglerContext = {
    targetDir: input.targetDir,
    packageManager: input.packageManager,
  };

  if (input.dryRun) {
    input.logger.plain(
      [
        `Would delete resources for ${state.projectName}:`,
        ...resources.map((resource) => `  [${resource.kind}] ${resource.name}`),
        ...skipped.map((message) => `  [skipped] ${message}`),
      ].join('\n')
    );
    return { deleted: [], warnings: [] };
  }

  for (const message of skipped) input.logger.warn(message);

  if (!input.yes) {
    const confirmed = await confirm(state.projectName);
    if (!confirmed) {
      throw new Error('Deletion cancelled.');
    }
  }

  const deleted: DeleteResource[] = [];
  const warnings: string[] = [...skipped];

  const attempt = async (
    resource: DeleteResource,
    action: () => Promise<{ exitCode: number; stderr: string }>
  ) => {
    input.logger.info(`Deleting ${resource.kind} ${resource.name}…`);
    try {
      const result = await action();
      if (result.exitCode !== 0) {
        const summary = summarizeCommandError(result.stderr);
        if (/not found|does not exist|404/i.test(summary)) {
          input.logger.verbose(`Already gone: ${resource.name}`);
        } else {
          warnings.push(`${resource.kind} ${resource.name}: ${summary}`);
        }
        return;
      }
      deleted.push(resource);
    } catch (error) {
      warnings.push(
        `${resource.kind} ${resource.name}: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  };

  for (const resource of resources) {
    switch (resource.kind) {
      case 'github':
        await attempt(resource, () =>
          run('gh', ['repo', 'delete', resource.name, '--yes'], {
            allowFailure: true,
          })
        );
        break;
      case 'worker':
        await attempt(resource, () =>
          wranglerRun(wranglerContext, ['delete', resource.name], {
            allowFailure: true,
          })
        );
        break;
      case 'd1':
        await attempt(resource, () =>
          wranglerRun(wranglerContext, ['d1', 'delete', resource.name, '-y'], {
            allowFailure: true,
          })
        );
        break;
      case 'r2':
        await attempt(resource, () =>
          wranglerRun(wranglerContext, ['r2', 'bucket', 'delete', resource.name], {
            allowFailure: true,
          })
        );
        break;
      case 'kv':
        await attempt(resource, () =>
          wranglerRun(
            wranglerContext,
            ['kv', 'namespace', 'delete', '--namespace-id', state.cloudflare?.kvNamespaceId ?? ''],
            { allowFailure: true }
          )
        );
        break;
      case 'dns':
        warnings.push(
          `DNS records for ${resource.name} are not removed automatically. Delete them in the Cloudflare dashboard if the zone stays.`
        );
        break;
    }
  }

  return { deleted, warnings };
}
