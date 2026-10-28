# create-minuteship

Scaffold and deploy a [MinuteShip](https://minuteship.linkzhang.workers.dev)
SaaS project to Cloudflare in minutes.

The CLI is open source under the MIT license. The MinuteShip template it
downloads lives in a private GitHub repository, so you need a `GITHUB_TOKEN`
with read access to it. Full command and option reference:
[docs/cli.md](docs/cli.md) ([中文](docs/cli.zh.md)).

## Requirements

- Node.js 22.12+
- `GITHUB_TOKEN` with read access to the private template repository
- Optionally, a logged-in `wrangler` CLI when you want the script to create
  D1 / R2 / KV resources for you

## Usage

```bash
# from a checkout of this repository
pnpm install
pnpm build
GITHUB_TOKEN=... node dist/index.js my-saas

# or without building
GITHUB_TOKEN=... pnpm dev my-saas
```

Options:

| Flag | Description |
| --- | --- |
| `-y, --yes` | Accept defaults for every prompt |
| `-h, --help` | Show usage |

Environment:

| Variable | Description |
| --- | --- |
| `CREATE_MINUTESHIP_REPO` | Template repository (`owner/name`). Defaults to `minuteship/minuteship`. |
| `CREATE_MINUTESHIP_REF` | Git ref to download. Defaults to the template tag this CLI release was built against (`TEMPLATE_VERSION` in `src/template.ts`). |
| `CREATE_MINUTESHIP_TEMPLATE_DIR` | Use a local directory instead of downloading (offline development and tests). |
| `GITHUB_TOKEN` | Token for the private template repository. Never printed. |

## What it does

1. Downloads the template into a temporary directory.
2. Copies it to the target directory, skipping `.git`, `node_modules`,
   `.wrangler`, `dist`, `.output`, `.tanstack`, `.content-collections`, the
   generated Paraglide output, build/test reports, and every `.env*` file
   except `.env.example`.
3. Writes `minuteship.config.ts` — the site type, module list, theme, brand and
   module settings. The template derives routes, navigation, shell UI, theme
   CSS and `websiteConfig` from it at build time.
4. Rewrites identity and infrastructure only:
   - `package.json` name (and drops the inherited `packageManager` field);
   - `.cta.json` project name;
   - `wrangler.jsonc` worker name, D1 database, R2 bucket, KV namespace, and
     removes the MinuteShip demo custom domain.
5. Writes `.env.local` with a freshly generated `BETTER_AUTH_SECRET`.
6. Optionally creates Cloudflare resources with `wrangler` and writes their
   ids back into `wrangler.jsonc` (comments preserved).
7. Runs the package manager's `install`.
8. On failure, removes the target directory so no half-scaffolded project is
   left behind.

The template's `LICENSE` file is copied unchanged and is never rewritten.

## Tests

```bash
pnpm test
```

Tests use local fixtures and never touch the network.

## License

[MIT](LICENSE)
