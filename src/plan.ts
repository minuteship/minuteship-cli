import type { CreateOptions } from './options/types.js';

export type PlanStatus = 'auto' | 'manual' | 'skip';

export interface PlanItem {
  status: PlanStatus;
  title: string;
  detail?: string;
}

function has(value: unknown): boolean {
  return typeof value === 'string' && value.trim() !== '';
}

/**
 * Human-readable summary of everything `create` will do. `--dry-run` prints
 * this instead of touching the network or the filesystem.
 */
export function buildPlan(options: CreateOptions): PlanItem[] {
  const items: PlanItem[] = [];
  const baseUrl = String(options.baseUrl ?? 'http://localhost:3000');
  const provider = String(options.paymentProvider ?? '');
  const paymentEnabled = provider !== '';

  items.push({
    status: 'auto',
    title: 'Download the MinuteShip template and copy it into the target directory',
    detail: String(options.targetDir ?? ''),
  });

  if (options.install !== false) {
    items.push({
      status: 'auto',
      title: `Install dependencies with ${options.packageManager}`,
    });
  }

  if (options.provision !== false) {
    items.push({
      status: 'auto',
      title: 'Create missing Cloudflare resources',
      detail: `D1 ${String(options.databaseName)}, R2 ${String(options.bucketName)}, KV ${String(options.kvName)}`,
    });
  } else {
    items.push({
      status: 'manual',
      title: 'Create Cloudflare D1, R2, and KV resources',
      detail:
        'Run `wrangler d1 create`, `wrangler r2 bucket create`, and `wrangler kv namespace create`, then fill wrangler.jsonc.',
    });
  }

  items.push({
    status: 'auto',
    title: 'Rewrite wrangler.jsonc and src/config/website.ts',
    detail: `Worker ${String(options.workerName)}, docs=${Boolean(options.enableDocs)}, credits=${Boolean(options.enableCredits)}`,
  });

  items.push({
    status: 'auto',
    title: 'Write .env.local, .env.production, and .minuteship/state.json',
  });

  if (options.migrateLocal !== false) {
    items.push({
      status: 'auto',
      title: 'Apply database migrations locally',
    });
  }

  if (options.deploy !== false) {
    items.push(
      { status: 'auto', title: 'Apply database migrations to the remote D1' },
      { status: 'auto', title: 'Upload runtime Worker secrets' },
      { status: 'auto', title: `Build and deploy to ${baseUrl}` }
    );
  } else {
    items.push({
      status: 'manual',
      title: 'Deploy later',
      detail: 'Run `create-minuteship deploy` from the project directory.',
    });
  }

  if (options.createAdmin !== false) {
    items.push({
      status: 'auto',
      title: 'Create an admin account with a one-time password',
      detail: `Admin email: ${String(options.adminEmail ?? '(missing)')}`,
    });
  }

  if (paymentEnabled) {
    if (
      options.provisionPayment !== false &&
      (provider === 'stripe' || provider === 'creem')
    ) {
      items.push({
        status: 'auto',
        title: `Create ${provider} products, prices, and webhook endpoint`,
        detail: `${baseUrl}/api/webhooks/${provider}`,
      });
    } else {
      items.push({
        status: 'manual',
        title: `Create ${provider} products, prices, and webhook endpoint`,
        detail: `Create them in the ${provider} dashboard and set the VITE_${provider.toUpperCase()}_* ids; create prints the exact webhook URL.`,
      });
    }
  } else {
    items.push({
      status: 'skip',
      title: 'Payment provider',
      detail: 'Disabled. Enable it later in the admin console.',
    });
  }

  for (const [enabled, label, callback] of [
    [options.enableGoogleLogin, 'Google', 'google'],
    [options.enableGithubLogin, 'GitHub', 'github'],
    [options.enableAppleLogin, 'Apple', 'apple'],
  ] as const) {
    if (enabled !== true) continue;
    const clientKey = `${callback}ClientId`;
    if (has(options[clientKey])) continue;
    items.push({
      status: 'manual',
      title: `Create ${label} OAuth credentials`,
      detail: `Callback URL: ${baseUrl}/api/auth/callback/${callback}`,
    });
  }

  if (options.enableGoogleAnalytics === true) {
    items.push({
      status: 'auto',
      title: 'Enable Google Analytics',
      detail: String(options.googleAnalyticsId ?? ''),
    });
  }
  if (options.enableClarity === true) {
    items.push({
      status: 'manual',
      title: 'Enable Microsoft Clarity',
      detail: 'Project id comes from clarity.microsoft.com; no provisioning API.',
    });
  }
  if (options.enableCrisp === true) {
    items.push({
      status: 'manual',
      title: 'Enable Crisp chat',
      detail: 'Website id comes from app.crisp.chat; no provisioning API.',
    });
  }

  if (options.githubEnabled === true) {
    items.push({
      status: 'auto',
      title: 'Create the GitHub repository, push, and sync Actions secrets',
      detail: `${String(options.githubRepo)} (${String(options.githubVisibility ?? 'private')})`,
    });
  } else {
    items.push({
      status: 'skip',
      title: 'GitHub repository',
      detail: 'Skipped. Run `create-minuteship deploy --github` later.',
    });
  }

  if (options.enableDocs !== true) {
    items.push({ status: 'skip', title: 'Product docs site' });
  }
  if (options.enableCredits !== true) {
    items.push({ status: 'skip', title: 'Credits ledger' });
  }

  return items;
}

export function formatPlan(items: readonly PlanItem[]): string {
  const labels: Record<PlanStatus, string> = {
    auto: '[auto]  ',
    manual: '[manual]',
    skip: '[skip]  ',
  };

  return items
    .map((item) =>
      item.detail
        ? `${labels[item.status]} ${item.title}\n           ${item.detail}`
        : `${labels[item.status]} ${item.title}`
    )
    .join('\n');
}
