# CLI

MinuteShip CLI 用于脚手架项目、创建 Cloudflare 资源、部署 Worker、写入运行期设置并创建首个管理员账号。CLI 本身以 MIT 协议开源；它下载的 MinuteShip 模板是私有仓库，需要提供对模板仓库有读权限的 `GITHUB_TOKEN`。

## 环境要求

- Node.js **22.12+**
- 包管理器（`pnpm`、`npm`、`yarn` 或 `bun`）
- `git`
- 已登录的 [`wrangler`](https://developers.cloudflare.com/workers/wrangler/)，或在环境中提供 `CLOUDFLARE_API_TOKEN` / `CLOUDFLARE_ACCOUNT_ID`
- `gh`（仅在创建或同步 GitHub 仓库时需要）

在本仓库的检出目录中运行：

```bash
pnpm install

# 开发模式
pnpm dev --help

# 构建后的可执行文件
pnpm build
node dist/index.js --help
```

构建后会同时提供 `create-minuteship` 与 `minuteship` 两个可执行入口。

## 命令

### `create [projectName]`

```bash
node dist/index.js create acme
```

流程：preflight → 下载模板 → 按功能开关复制文件 → 创建 Cloudflare D1/R2/KV → 创建支付/邮件资源 →
改写 `wrangler.jsonc` 与 `website.ts` → 写入 `.env.local` / `.env.production` → 安装依赖 → 本地迁移 →
初始化 git → 部署（除非 `--no-deploy`）→ 写入支付价格 ID → 上传 Worker secrets → 创建管理员账号 →
可选创建并推送私有 GitHub 仓库。

所有选项都可以交互询问或通过命令行参数指定；布尔选项同时支持 `--no-` 形式。`--yes` 接受所有默认值，绝不提问。

常用参数：

| 参数 | 作用 |
|------|------|
| `--yes` | 接受默认值，跳过所有提示 |
| `--dry-run` | 只打印计划，不做任何修改 |
| `--resume` | 继续中断的运行，复用 `.env.production` 中的值 |
| `--force-new-state` | 备份 `.minuteship/state.json` 后重新记录步骤 |
| `--advanced` | 同时询问高级选项（调试开关、自定义资源名） |
| `--reset-admin-password` | 重置已有管理员密码并强制下次登录改密 |
| `--json` | 输出单个 JSON 文档（需要 `--yes`） |
| `--verbose` | 打印命令与额外细节 |
| `--dir <path>` | 目标目录，用于 `deploy` 与 `delete` |

### `deploy`

```bash
node dist/index.js deploy --dir ./acme
```

执行远程迁移、为当前支付 provider 写入 `payment_price` 价格 ID、上传 Worker secrets、构建、
运行 `wrangler deploy` 并验证 `VITE_BASE_URL`。重复部署可用 `--skip-migrate` 与 `--skip-build`；
`--github --repo owner/name` 还会提交、推送并同步 GitHub Actions secrets。

### `delete`

```bash
node dist/index.js delete --dir ./acme --dry-run
```

只删除 `.minuteship/state.json` 中记录的资源，按逆序执行（GitHub 仓库 → Worker → 路由/域名 → D1 → R2 → KV）。
删除前必须输入项目名确认；`--delete-github` 才会同时删除远程仓库。

## 选项

下表由选项注册表生成，该注册表同时驱动参数、提示、校验与 `.env` 输出。请勿手工修改。

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
| Features | `--docs` / `--no-docs` | — | Enable the product docs site (/docs)? |
| Features | `--credits` / `--no-credits` | — | Enable the credits ledger? |
| Features | `--blog` / `--no-blog` | — | Enable the blog? |
| Features | `--storage` / `--no-storage` | — | Enable file storage (R2)? |
| Features | `--cache` / `--no-cache` | — | Enable server-side caching (KV)? |
| Features | `--newsletter` / `--no-newsletter` | — | Enable the newsletter signup? |
| Features | `--notification` / `--no-notification` | — | Enable staff notifications? |
| Features | `--credential-login` / `--no-credential-login` | — | Enable email + password login? |
| Features | `--email-otp-login` / `--no-email-otp-login` | — | Enable email one-time-code login? |
| Features | `--google-login` / `--no-google-login` | — | Enable Google login? |
| Features | `--github-login` / `--no-github-login` | — | Enable GitHub login? |
| Features | `--apple-login` / `--no-apple-login` | — | Enable Apple login? |
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
| Auth | `--github-client-id` | `GITHUB_CLIENT_ID` | GitHub OAuth client id |
| Auth | `--github-client-secret` | `GITHUB_CLIENT_SECRET` | GitHub OAuth client secret |
| Auth | `--apple-client-id` | `APPLE_CLIENT_ID` | Apple service id |
| Auth | `--apple-client-secret` | `APPLE_CLIENT_SECRET` | Apple client secret (signed JWT) |
| Payment | `--payment` | `VITE_PAYMENT_PROVIDER` | Payment provider |
| Payment | `--provision-payment` / `--no-provision-payment` | — | Create products, prices, and webhooks through the provider API? |
| Payment | `--stripe-secret-key` | `STRIPE_SECRET_KEY` | Stripe secret key |
| Payment | `--stripe-webhook-secret` | `STRIPE_WEBHOOK_SECRET` | Stripe webhook signing secret (Printed once by the Stripe dashboard or the provisioning step) |
| Payment | `--stripe-price-pro-monthly` | `VITE_STRIPE_PRICE_PRO_MONTHLY` | Stripe price id: Pro monthly |
| Payment | `--stripe-price-pro-yearly` | `VITE_STRIPE_PRICE_PRO_YEARLY` | Stripe price id: Pro yearly |
| Payment | `--stripe-price-lifetime` | `VITE_STRIPE_PRICE_LIFETIME` | Stripe price id: Lifetime |
| Payment | `--stripe-price-credits-starter` | `VITE_STRIPE_PRICE_CREDITS_STARTER` | Stripe price id: Credits starter |
| Payment | `--stripe-price-credits-pro` | `VITE_STRIPE_PRICE_CREDITS_PRO` | Stripe price id: Credits pro |
| Payment | `--stripe-price-credits-scale` | `VITE_STRIPE_PRICE_CREDITS_SCALE` | Stripe price id: Credits scale |
| Payment | `--creem-api-key` | `CREEM_API_KEY` | Creem API key |
| Payment | `--creem-webhook-secret` | `CREEM_WEBHOOK_SECRET` | Creem webhook secret |
| Payment | `--creem-debug` / `--no-creem-debug` | `CREEM_DEBUG` | Use the Creem test environment? |
| Payment | `--creem-product-pro-monthly` | `VITE_CREEM_PRODUCT_PRO_MONTHLY` | Creem product id: Pro monthly |
| Payment | `--creem-product-pro-yearly` | `VITE_CREEM_PRODUCT_PRO_YEARLY` | Creem product id: Pro yearly |
| Payment | `--creem-product-lifetime` | `VITE_CREEM_PRODUCT_LIFETIME` | Creem product id: Lifetime |
| Payment | `--creem-product-credits-starter` | `VITE_CREEM_PRODUCT_CREDITS_STARTER` | Creem product id: Credits starter |
| Payment | `--creem-product-credits-pro` | `VITE_CREEM_PRODUCT_CREDITS_PRO` | Creem product id: Credits pro |
| Payment | `--creem-product-credits-scale` | `VITE_CREEM_PRODUCT_CREDITS_SCALE` | Creem product id: Credits scale |
| Payment | `--waffo-merchant-id` | `WAFFO_MERCHANT_ID` | Waffo merchant id |
| Payment | `--waffo-private-key` | `WAFFO_PRIVATE_KEY` | Waffo private key |
| Payment | `--waffo-debug` / `--no-waffo-debug` | `WAFFO_DEBUG` | Use the Waffo test environment? |
| Payment | `--waffo-product-pro-monthly` | `VITE_WAFFO_PRODUCT_PRO_MONTHLY` | Waffo product id: Pro monthly |
| Payment | `--waffo-product-pro-yearly` | `VITE_WAFFO_PRODUCT_PRO_YEARLY` | Waffo product id: Pro yearly |
| Payment | `--waffo-product-lifetime` | `VITE_WAFFO_PRODUCT_LIFETIME` | Waffo product id: Lifetime |
| Payment | `--waffo-product-credits-starter` | `VITE_WAFFO_PRODUCT_CREDITS_STARTER` | Waffo product id: Credits starter |
| Payment | `--waffo-product-credits-pro` | `VITE_WAFFO_PRODUCT_CREDITS_PRO` | Waffo product id: Credits pro |
| Payment | `--waffo-product-credits-scale` | `VITE_WAFFO_PRODUCT_CREDITS_SCALE` | Waffo product id: Credits scale |
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
| Analytics | `--openpanel` / `--no-openpanel` | — | Enable OpenPanel? |
| Analytics | `--openpanel-client-id` | `VITE_OPENPANEL_CLIENT_ID` | OpenPanel client id |
| Analytics | `--openpanel-script` | `VITE_OPENPANEL_SCRIPT` | OpenPanel script URL (optional, defaults to openpanel.dev) |
| Chat | `--crisp` / `--no-crisp` | — | Enable the Crisp chat widget? |
| Chat | `--crisp-website-id` | `VITE_CRISP_WEBSITE_ID` | Crisp website id |
| AI | `--fal-key` | `FAL_KEY` | fal.ai API key (AI image playground) |

<!-- END:cli-options -->

## 状态与续跑

`.minuteship/state.json`（权限 `0600`）记录项目名、Cloudflare 资源 ID、管理员邮箱/用户 ID，以及每个步骤的状态。
**它绝不保存密码、API key 或任何 secret 值。** `--resume` 会读取该文件与 `.env.production`，避免重新运行时
静默回退到默认值（否则可能把支付 provider 改掉）。

每个步骤都是幂等的，并在成功后立即写入状态，因此中断后可以安全续跑。使用 `--force-new-state` 时，损坏的
状态文件会被重命名而不是删除。

## 自动与手动

| 集成 | 自动完成 | 手动兜底 |
|------|----------|----------|
| Cloudflare D1/R2/KV/路由 | 是（API 或 Wrangler） | 在控制台创建 |
| Stripe 产品、价格、webhook | 是 | webhook 已存在时粘贴 `whsec_` |
| Creem 产品 | API 支持时自动创建 | 创建产品后粘贴 ID |
| Waffo 商店/产品/webhook | 是（默认测试模式） | 在 Waffo 控制台创建 |
| Resend 域名 + DNS | 域名在 Cloudflare 时自动写入 | 粘贴 DNS 记录 |
| Google / GitHub / Apple OAuth | 无自助 API | 创建应用并设置回调地址 |
| Google Analytics / Clarity / Crisp | 无自助 API | 在管理后台粘贴 ID |

需要手动的项目会在 `create` 结束时连同精确回调查询地址一起打印；之后都可以在管理后台配置，无需重新部署。

## 管理员初始化

启用 `create-admin` 时，CLI 会生成随机一次性密码，直接写入 D1（使用 Better Auth 的 scrypt 格式哈希），并**只显示一次**密码。
账号带有 `must_change_password = 1`，首次登录会跳转到 `/auth/change-password`。之后可用 `--reset-admin-password`
轮换密码，而不会删除账号及其支付记录。

## Secrets

- API key 与 webhook secret 写入 **Worker secrets**（`wrangler secret bulk`），绝不写入 D1，也不进入客户端包。
- `VITE_*` 是构建期变量，写入 `.env.production`，并在选择同步时写入 GitHub Actions secrets。
- 日志只打印变量名，并对值做脱敏。

## 退出码

| 退出码 | 含义 |
|--------|------|
| `0` | 成功 |
| `1` | 运行时失败 |
| `2` | 用法错误 |
| `3` | Preflight 失败（Node、wrangler、git 或 `gh` 缺失） |

## 下一步

- **[部署](./deployment.zh.md)** — 不使用 CLI 的部署方式
- **[运行期设置](./runtime-settings.zh.md)** — 部署后配置第三方集成
- **[管理后台](./admin-console.zh.md)** — 首个管理员可以修改什么
- **[支付故障切换](./payment-failover.zh.md)** — 秒级切换 provider
