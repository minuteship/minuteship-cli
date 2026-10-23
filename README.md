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
| `CREATE_MINUTESHIP_REF` | Git ref to download. Defaults to `main`. |
| `CREATE_MINUTESHIP_TEMPLATE_DIR` | Use a local directory instead of downloading (offline development and tests). |
| `GITHUB_TOKEN` | Token for the private template repository. Never printed. |

## What it does

1. Downloads the template into a temporary directory.
2. Copies it to the target directory, skipping `.git`, `node_modules`,
   `.wrangler`, `dist`, `.output`, `.tanstack`, `.content-collections`, the
   generated Paraglide output, build/test reports, and every `.env*` file
   except `.env.example`.
3. Rewrites:
   - `package.json` name (and drops the inherited `packageManager` field);
   - `.cta.json` project name;
   - `wrangler.jsonc` worker name, D1 database, R2 bucket, KV namespace, and
     removes the MinuteShip demo custom domain;
   - `src/config/website.ts` social links and the docs/credits/payment flags;
   - `project.inlang/messages/{en,zh}.json` site name, title, and description.
4. Writes `.env.local` with a freshly generated `BETTER_AUTH_SECRET`.
5. Optionally creates Cloudflare resources with `wrangler` and writes their
   ids back into `wrangler.jsonc` (comments preserved).
6. Runs the package manager's `install`.
7. On failure, removes the target directory so no half-scaffolded project is
   left behind.

The template's `LICENSE` file is copied unchanged and is never rewritten.

## Tests

```bash
pnpm test
```

Tests use local fixtures and never touch the network.

## License

[MIT](LICENSE)
