# CLI

The MinuteShip CLI scaffolds a project, provisions Cloudflare resources,
deploys the Worker, seeds runtime settings, and creates the first admin account.
The CLI itself is open source (MIT). The MinuteShip template it downloads is
private, so you need a `GITHUB_TOKEN` with read access to the template
repository.

## Requirements

- Node.js **22.12+**
- A package manager (`pnpm`, `npm`, `yarn`, or `bun`)
- `git`
- [`wrangler`](https://developers.cloudflare.com/workers/wrangler/) logged in,
  or `CLOUDFLARE_API_TOKEN` / `CLOUDFLARE_ACCOUNT_ID` in the environment
- `gh` (only when creating or syncing a GitHub repository)

Run the CLI from a checkout of this repository:

```bash
pnpm install

# development
pnpm dev --help

# built executable
pnpm build
node dist/index.js --help
```

Both `create-minuteship` and `minuteship` are exposed as binaries once the
package is built.

## Commands

### `create [projectName]`

```bash
node dist/index.js create acme
```

Steps: preflight → fetch template → write `minuteship.config.ts` (site type,
modules, theme, brand, module settings) → provision Cloudflare D1/R2/KV →
provision payment/mail resources → rewrite `wrangler.jsonc` → write `.env.local`
/ `.env.production` → install → apply local migrations → initialize git → deploy
(unless `--no-deploy`) → seed payment price ids → upload Worker secrets → create
the admin account → optionally create and push a private GitHub repository.

`minuteship.config.ts` is the only file that describes *what the project is*.
The template derives routes, navigation, shell UI, theme CSS and
`websiteConfig` from it at build time, so nothing in `src/` is patched and
there is no second copy of your answers to keep in sync.

Every option is either prompted interactively or supplied as a flag. Booleans
also accept a `--no-` form. `--yes` accepts every default and never prompts.

Useful flags:

| Flag | Effect |
|------|--------|
| `--yes` | Accept defaults, skip all prompts |
| `--dry-run` | Print the plan; change nothing |
| `--resume` | Continue an interrupted run, reusing values from `.env.production` |
| `--force-new-state` | Back up `.minuteship/state.json` and start bookkeeping over |
| `--advanced` | Also ask advanced options (debug flags, custom resource names) |
| `--reset-admin-password` | Rotate an existing admin password and force a change |
| `--json` | Print one JSON document (requires `--yes`) |
| `--verbose` | Print commands and extra detail |
| `--dir <path>` | Target directory, for `deploy` and `delete` |

### `deploy`

```bash
node dist/index.js deploy --dir ./acme
```

Applies remote migrations, seeds `payment_price` rows for the selected payment
provider, uploads Worker secrets, builds, runs `wrangler deploy`, and verifies
`VITE_BASE_URL`. `--skip-migrate` and `--skip-build` are available for
re-deploys; `--github --repo owner/name` also commits, pushes, and syncs GitHub
Actions secrets.

### `delete`

```bash
node dist/index.js delete --dir ./acme --dry-run
```

Deletes only resources recorded in `.minuteship/state.json`, in reverse order
(GitHub repository → Worker → routes/domain → D1 → R2 → KV). It asks for the
project name before deleting anything; `--delete-github` opts in to removing the
remote repository too.

## Options

The table below is generated from the option registry, which also drives the
flags, prompts, validation, and `.env` output. Do not edit it by hand.

<!-- BEGIN:cli-options -->

| Group | Flag | Env variable | Description |
|-------|------|--------------|-------------|
| Project | _(positional)_ | — | Project name (Lowercase, used as the directory and Worker name) |
| Project | `--site-name` | — | Site name (shown in metadata) |
| Project | `--package-manager` | — | Package manager |
| Project | `--base-url` | `VITE_BASE_URL` | Public base URL of the site (Used for auth callbacks and SEO) |
| Project | `--install` / `--no-install` | — | Install dependencies after scaffolding? |
| Project | `--migrate-local` / `--no-migrate-local` | — | Apply database migrations locally? |
| Project | `--create-admin` / `--no-create-admin` | — | Create an admin account with a one-time password? |
| Project | `--github` / `--no-github` | — | Create a private GitHub repository and push? |
| Project | `--admin-email` | — | Admin email address |
| Project | `--github-repo` | — | GitHub repository (owner/name) |
| Project | `--github-visibility` | — | GitHub repository visibility |
| Features | `--preset` | — | Site type (Fixed for the life of the project) |
| Features | `--modules` | — | Modules to include (Comma-separated, e.g. auth,payment,blog — see `minuteship modules`) |
| Features | `--theme` | — | Brand theme |
| Features | `--credential-login` / `--no-credential-login` | — | Enable email + password login? |
| Features | `--google-login` / `--no-google-login` | — | Enable Google login? |
| Features | `--delete-account` / `--no-delete-account` | — | Allow users to delete their account? |
| Cloudflare | `--provision` / `--no-provision` | — | Create missing Cloudflare resources automatically? |
| Cloudflare | `--deploy` / `--no-deploy` | — | Build and deploy to Cloudflare after scaffolding? |
| Cloudflare | `--domain` | — | Custom domain (optional) (Bare hostname, e.g. app.example.com) |
| Cloudflare | `--cloudflare-account-id` | `CLOUDFLARE_ACCOUNT_ID` | Cloudflare account id (Read from CLOUDFLARE_ACCOUNT_ID when omitted; `wrangler login` also works) |
| Cloudflare | `--cloudflare-api-token` | `CLOUDFLARE_API_TOKEN` | Cloudflare API token (Read from CLOUDFLARE_API_TOKEN when omitted; only needed for REST provisioning) |
| Cloudflare | `--worker-name` | — | Worker name |
| Cloudflare | `--database-name` | — | D1 database name |
| Cloudflare | `--bucket-name` | — | R2 bucket name |
| Cloudflare | `--kv-name` | — | KV namespace title |
| Auth | `--better-auth-secret` | `BETTER_AUTH_SECRET` | Better Auth secret (Generated automatically when omitted) |
| Auth | `--trusted-origins` | `BETTER_AUTH_TRUSTED_ORIGINS` | Additional trusted origins (comma-separated) |
| Auth | `--google-client-id` | `GOOGLE_CLIENT_ID` | Google OAuth client id |
| Auth | `--google-client-secret` | `GOOGLE_CLIENT_SECRET` | Google OAuth client secret |
| Auth | `--google-extension-client-id` | `GOOGLE_EXTENSION_CLIENT_ID` | Browser-extension Google client id |
| Payment | `--payment` | `VITE_PAYMENT_PROVIDER` | Payment provider |
| Payment | `--provision-payment` / `--no-provision-payment` | — | Create products, prices, and webhooks through the provider API? |
| Payment | `--stripe-secret-key` | `STRIPE_SECRET_KEY` | Stripe secret key |
| Payment | `--stripe-webhook-secret` | `STRIPE_WEBHOOK_SECRET` | Stripe webhook signing secret (Printed once by the Stripe dashboard or the provisioning step) |
| Payment | `--stripe-price-pro-monthly` | `VITE_STRIPE_PRICE_PRO_MONTHLY` | Stripe price id: Pro monthly |
| Payment | `--stripe-price-pro-yearly` | `VITE_STRIPE_PRICE_PRO_YEARLY` | Stripe price id: Pro yearly |
| Payment | `--stripe-price-lifetime` | `VITE_STRIPE_PRICE_LIFETIME` | Stripe price id: Lifetime |
| Payment | `--creem-api-key` | `CREEM_API_KEY` | Creem API key |
| Payment | `--creem-webhook-secret` | `CREEM_WEBHOOK_SECRET` | Creem webhook secret |
| Payment | `--creem-debug` / `--no-creem-debug` | `CREEM_DEBUG` | Use the Creem test environment? |
| Payment | `--creem-product-pro-monthly` | `VITE_CREEM_PRODUCT_PRO_MONTHLY` | Creem product id: Pro monthly |
| Payment | `--creem-product-pro-yearly` | `VITE_CREEM_PRODUCT_PRO_YEARLY` | Creem product id: Pro yearly |
| Payment | `--creem-product-lifetime` | `VITE_CREEM_PRODUCT_LIFETIME` | Creem product id: Lifetime |
| Payment | `--waffo-merchant-id` | `WAFFO_MERCHANT_ID` | Waffo merchant id |
| Payment | `--waffo-private-key` | `WAFFO_PRIVATE_KEY` | Waffo private key |
| Payment | `--waffo-debug` / `--no-waffo-debug` | `WAFFO_DEBUG` | Use the Waffo test environment? |
| Payment | `--waffo-product-pro-monthly` | `VITE_WAFFO_PRODUCT_PRO_MONTHLY` | Waffo product id: Pro monthly |
| Payment | `--waffo-product-pro-yearly` | `VITE_WAFFO_PRODUCT_PRO_YEARLY` | Waffo product id: Pro yearly |
| Payment | `--waffo-product-lifetime` | `VITE_WAFFO_PRODUCT_LIFETIME` | Waffo product id: Lifetime |
| Mail | `--mail-provider` | — | Transactional mail provider |
| Mail | `--mail-from` | — | From address for transactional mail |
| Mail | `--mail-support` | — | Support address shown to users |
| Mail | `--resend-api-key` | `RESEND_API_KEY` | Resend API key |
| Newsletter | `--newsletter-provider` | — | Newsletter provider |
| Newsletter | `--auto-subscribe` / `--no-auto-subscribe` | — | Subscribe users automatically after sign-up? |
| Newsletter | `--beehiiv-api-key` | `BEEHIIV_API_KEY` | Beehiiv API key |
| Newsletter | `--beehiiv-publication-id` | `BEEHIIV_PUBLICATION_ID` | Beehiiv publication id |
| Newsletter | `--mailcheap-api-key` | `MAILCHEAP_API_KEY` | MailCheap API key |
| Newsletter | `--mailcheap-newsletter-id` | `MAILCHEAP_NEWSLETTER_ID` | MailCheap newsletter id |
| Notification | `--notification-provider` | — | Notification provider |
| Notification | `--discord-webhook-url` | `DISCORD_WEBHOOK_URL` | Discord webhook URL |
| Notification | `--feishu-webhook-url` | `FEISHU_WEBHOOK_URL` | Feishu webhook URL |
| Analytics | `--google-analytics` / `--no-google-analytics` | — | Enable Google Analytics? |
| Analytics | `--google-analytics-id` | `VITE_GOOGLE_ANALYTICS_ID` | Google Analytics measurement id (Looks like G-XXXXXXXXXX) |
| Analytics | `--clarity` / `--no-clarity` | — | Enable Microsoft Clarity? |
| Analytics | `--clarity-project-id` | `VITE_CLARITY_PROJECT_ID` | Clarity project id |
| Analytics | `--plausible` / `--no-plausible` | — | Enable Plausible? |
| Analytics | `--plausible-script` | `VITE_PLAUSIBLE_SCRIPT` | Plausible script URL |
| Analytics | `--umami` / `--no-umami` | — | Enable Umami? |
| Analytics | `--umami-website-id` | `VITE_UMAMI_WEBSITE_ID` | Umami website id |
| Analytics | `--umami-script` | `VITE_UMAMI_SCRIPT` | Umami script URL |
| Chat | `--crisp` / `--no-crisp` | — | Enable the Crisp chat widget? |
| Chat | `--crisp-website-id` | `VITE_CRISP_WEBSITE_ID` | Crisp website id |
| AI | `--fal-key` | `FAL_KEY` | fal.ai API key (AI image playground) |

<!-- END:cli-options -->

## State and resume

`.minuteship/state.json` (mode `0600`) records the project name, Cloudflare
resource ids, the admin email/user id, and the status of each step. **It never
contains passwords, API keys, or secret values.** `--resume` reads this file
and `.env.production` so re-running does not silently fall back to defaults
(which could otherwise switch the payment provider).

Every step is idempotent and records success immediately, so an interrupted run
can be resumed safely. A corrupt state file is renamed rather than deleted when
`--force-new-state` is used.

## Automated vs manual

| Integration | Automated | Manual fallback |
|-------------|-----------|-----------------|
| Cloudflare D1/R2/KV/routes | Yes, via API or Wrangler | Create in the dashboard |
| Stripe products, prices, webhook | Yes | Paste `whsec_` when a webhook already exists |
| Creem products | Yes when the API allows it | Create products, paste ids |
| Waffo store/products/webhook | Yes in test mode | Create in the Waffo dashboard |
| Resend domain + DNS | Yes when the zone is in Cloudflare | Paste DNS records |
| Google / GitHub / Apple OAuth apps | No API for this | Create the app, set the callback URL |
| Google Analytics / Clarity / Crisp | No API for this | Paste the id in the admin console |

Manual items are printed at the end of `create` with exact callback URLs. All
of them can be configured later in the admin console without a redeploy.

## Admin bootstrap

When `create-admin` is enabled, the CLI generates a random one-time password,
writes the admin user directly to D1 (hashed with Better Auth's scrypt format),
and prints the password **once**. The account has `must_change_password = 1`;
the first sign-in is redirected to `/auth/change-password`. Use
`--reset-admin-password` to rotate it later without deleting the account or its
payment rows.

## Secrets

- API keys and webhook secrets go to **Worker secrets** (`wrangler secret
  bulk`), never to D1 and never to the client bundle.
- `VITE_*` values are build-time and are written to `.env.production` and, if
  you opt in, to GitHub Actions secrets.
- Logs print variable names only and redact values.

## Exit codes

| Code | Meaning |
|------|---------|
| `0` | Success |
| `1` | Runtime failure |
| `2` | Usage error |
| `3` | Preflight failure (Node, wrangler, git, or `gh` missing) |

## Next steps

- **[Deployment](./deployment.md)** — Deploy without the CLI
- **[Runtime settings](./runtime-settings.md)** — Configure integrations after deployment
- **[Admin console](./admin-console.md)** — What the first admin can change
- **[Payment failover](./payment-failover.md)** — Switch providers in seconds
