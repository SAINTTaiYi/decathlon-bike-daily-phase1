# Automated Deployment

## Status

V5.2.9 已实现本地可验证的基础设施与发布自动化，目标平台为：

- Web：Cloudflare Pages Direct Upload
- API：Railway
- Database：Supabase PostgreSQL 16
- Media：Cloudflare R2 private bucket
- CI/CD：GitHub Actions
- Environments：Staging + Production，资源与 Secret 完全隔离

当前私有仓库已建立 `main` 与 `develop`，并已创建仅允许 `develop` 部署的 `staging` GitHub Environment。尚未连接真实云账号、创建云资源或配置真实 Secret，也未执行 Staging apply/release 或 Production。本文描述代码中已经存在的自动化和执行前提，不代表云端已验证成功。

## Safety model

- 所有命令必须明确指定 `staging` 或 `production`；非法环境直接拒绝。
- `plan` 不读取凭证、不访问网络、不修改资源。
- `preflight` 只报告缺失变量名和 Node 版本，不输出 Secret。
- State JSON 损坏时直接停止，不把损坏文件当成空环境。
- State 使用原子写入，并在 Supabase、Cloudflare、Railway、Schema 等阶段保存非敏感检查点。
- Secret 通过环境变量或 GitHub Environment Secret 注入，不写入仓库或 state。
- 数据库连接串不作为命令行参数传递；migration 通过 `DIRECT_DATABASE_URL` 环境变量读取。
- Staging 与 Production 使用独立 Supabase、R2、Railway Environment、Pages Project 和 Secret。
- Production apply 需要 `--approve-production`。
- Production release 需要 `--approve-production --confirm-backup`。
- GitHub Production Workflow 还要求：main 分支、完整 release SHA、已验收的 Staging SHA、源码一致、GitHub Environment 审批。
- npm、GitHub、Cloudflare、Railway、Supabase API/PostgreSQL 网络不可达时立即停止，并提示开启 VPN；不会盲目重试明确的网络不可达错误。

## Resource names

| Resource | Staging | Production |
|---|---|---|
| Cloudflare Pages | `bike-ops-staging` | `bike-ops-production` |
| Cloudflare R2 | `bike-ops-staging-media` | `bike-ops-production-media` |
| Railway Project | `decathlon-bike-ops-staging` | `decathlon-bike-ops-production` |
| Railway Environment | `staging` | `production` |
| Railway Service | `api` | `api` |
| Supabase Project | `bike-ops-staging` | `bike-ops-production` |

每个环境保存到：

```text
infra/state/staging.json
infra/state/production.json
```

允许写入 state 的内容：资源 ID/ref、项目名、Bucket 名、非敏感域名、阶段、更新时间、部署 SHA。禁止写入 Token、密码、数据库 URL、Session/CSRF Secret、加密密钥或 R2 Secret。

## Prerequisites

- Node.js 22–24
- pnpm 9.15.9
- GitHub 私有仓库，存在 `develop` 和 `main`
- GitHub Environments：`staging`、`production`
- Production Environment 配置 required reviewers
- Cloudflare、Railway、Supabase 账号已完成 MFA、账单/套餐和必要权限开通
- R2 已为两个 Bucket 分别创建受限 S3 Access Key/Secret

境外服务不可达时先开启 VPN，再执行任何需要 npm、GitHub 或云 API 的步骤。

## GitHub Environment configuration

### Bootstrap secrets — both environments

在 `staging` 和 `production` GitHub Environment 中分别配置同名但不同值的 Secret：

```text
CLOUDFLARE_ACCOUNT_ID
CLOUDFLARE_API_TOKEN
RAILWAY_API_TOKEN
RAILWAY_WORKSPACE_ID
SUPABASE_ACCESS_TOKEN
SUPABASE_ORG_ID
SUPABASE_DB_PASSWORD
SESSION_SECRET
CSRF_SECRET
PASSWORD_PEPPER
CONTACT_ENCRYPTION_KEY
INITIAL_ADMIN_SETUP_TOKEN
R2_ACCESS_KEY_ID
R2_SECRET_ACCESS_KEY
```

可选 Environment Variable：

```text
CUSTOM_WEB_ORIGINS
```

`bootstrap-infrastructure.yml` 只把当前选中的 GitHub Environment Secret 映射到对应后缀，例如：

```text
staging    → SUPABASE_DB_PASSWORD_STAGING
production → SUPABASE_DB_PASSWORD_PRODUCTION
```

不会同时在一次 Job 中注入两个环境的业务 Secret。

### Release secrets — both environments

后续发布至少需要：

```text
CLOUDFLARE_ACCOUNT_ID
CLOUDFLARE_API_TOKEN
RAILWAY_TOKEN
SUPABASE_DB_PASSWORD
```

`RAILWAY_TOKEN` 应为环境级受限 Token。Bootstrap 使用的高权限账号 Token 在资源创建完成后应撤销或降权。

## Cloud provider permissions

### Cloudflare token

限制在目标 Account/Zone，至少包含：

- Account / Cloudflare Pages / Edit
- Account / Workers R2 Storage / Edit
- Account Read
- 如使用自定义域名：Zone / DNS / Edit 与 Zone Read

当前代码通过管理 Token 创建/配置 Pages 和 R2 Bucket，但不会把管理 Token 伪装成 S3 Secret。R2 浏览器直传所需的 S3 Access Key/Secret 必须为环境专属、Bucket 范围受限的真实凭证。

### Railway

Bootstrap Token 需要在目标 Workspace 创建 Project、Environment、Service、变量和域名的权限。Release Token 只需关联目标 Project/Environment/Service 并部署。

### Supabase

Bootstrap PAT 需要在目标 Organization 创建项目和读取项目健康/区域信息的权限。数据库密码必须分别保存在两个 GitHub Environment 中。

## Database URLs

自动化为每个 Supabase Project 生成两种连接 URL：

```text
DATABASE_URL
  transaction pooler
  aws-0-<region>.pooler.supabase.com:6543
  Railway API runtime

DIRECT_DATABASE_URL
  direct host
  db.<project-ref>.supabase.co:5432
  migration only
```

Migration runner：

- 读取 `supabase/migrations/*.sql`，按文件名排序。
- 使用 PostgreSQL advisory lock 防止并发迁移。
- 在 `public.bike_ops_schema_migrations` 记录文件名、SHA-256 和执行时间。
- 已执行 migration 的内容发生变化时拒绝继续。
- 每个 migration 在事务中执行。

## CLI

```bash
pnpm ops plan <staging|production>
pnpm ops preflight <staging|production>
pnpm ops preflight <staging|production> --release
pnpm ops apply <staging|production> [--approve-production]
pnpm ops release <staging|production> [--approve-production] [--confirm-backup]
pnpm ops verify <staging|production>
```

### `plan`

输出将使用的固定资源名、生成 URL 类型和 Production 批准要求；不访问网络或 state。

### `preflight`

Apply 模式检查：Cloudflare、Railway、Supabase bootstrap 凭证，以及选中环境的数据库密码、应用 Secret、Setup Token 和 R2 S3 凭证。

Release 模式检查：Cloudflare 发布凭证、Railway release token 和选中环境的 Supabase 数据库密码。

Node.js 必须为 22–24；不满足时返回失败。

### `apply`

执行顺序：

```text
preflight
→ create/reconcile Supabase
→ save state checkpoint
→ create/reconcile Pages + R2 + R2 CORS
→ save state checkpoint
→ create/reconcile Railway Project/Environment/Service/domain/variables
→ save state checkpoint
→ checksum migration via DIRECT_DATABASE_URL
→ save schema-ready checkpoint
→ Railway API deploy
→ API readiness + version verify
→ Web build + security headers
→ Cloudflare Pages deploy
→ save final non-sensitive state
```

`production` 必须增加 `--approve-production`，并且只应在 Staging 已验收后执行。

### `release`

要求对应 `infra/state/<environment>.json` 已提交且完整。顺序固定为：

```text
preflight
→ migration
→ Railway API deploy
→ API readiness/version verify
→ Cloudflare Pages deploy
→ save release SHA/time
```

Production 额外要求：

```bash
pnpm ops release production --approve-production --confirm-backup
```

### `verify`

- 请求 API `/health/ready`
- 请求 API `/api/v1/meta/version`
- 请求 Pages Web URL
- 任一失败则退出非零

## GitHub Actions

### `ci.yml`

触发：Pull Request、push 到 `develop` 或 `main`。

执行：

1. Node 22 与 pnpm 9.15.9。
2. Workflow 静态策略验证。
3. PostgreSQL 16 空库 migration 验证。
4. Domain/Database/Web/API 测试。
5. TypeScript typecheck。
6. 所有 Workspace build。
7. 前端原生 select/旧示例身份检查。
8. 固定 Gitleaks 8.30.1、校验官方 SHA-256 后扫描完整 Git 历史，并保留 SARIF artifact。

### `bootstrap-infrastructure.yml`

仅手动触发：

- Staging 必须从 `develop` dispatch。
- Production 必须从 `main` dispatch。
- Production 还要勾选 `approve_production` 和 `confirm_staging_acceptance`，并输入完整 `staging_accepted_sha`；main 源码必须与被验收的 develop 源码一致（环境 state 除外）。
- Job 使用选中的 GitHub Environment，因此 Secret 自动隔离。
- 中断时 state 作为 14 天 artifact 保存；存在 state 时无论 apply 成功与否都创建非敏感 state Pull Request，避免绕过分支保护。

### `deploy-staging.yml`

- push 到 `develop` 或从 `develop` 手动触发。
- readiness job 先检查已提交的 `infra/state/staging.json`；尚未 Bootstrap 时安全跳过 deploy job，不读取 Environment Secret、不访问云平台。
- state 就绪后，deploy job 再强制校验 `develop`，并按测试/typecheck/build → release preflight → release → verify 执行。

### `deploy-production.yml`

仅从 `main` 手动触发，需要输入：

```text
version
release_sha
staging_accepted_sha
approve_production = true
confirm_backup = true
```

Workflow 验证：

- release SHA 是 main 当前完整 40 位 SHA。
- Staging accepted SHA 存在于 develop 历史。
- 除 `infra/state/*.json` 外，Production 源码与被验收 Staging 源码无差异。
- Production GitHub Environment approval 已通过。
- CLI 使用 `--approve-production --confirm-backup`。

## R2 media flow

1. Web 请求 `/api/v1/attachments/prepare`。
2. API 验证 Session、门店、CSRF、Idempotency-Key、记录权限、MIME、大小和数量。
3. API 创建 pending attachment，并返回 5 分钟 PUT URL。
4. Browser 直接上传 R2，同时发送 MIME 与 SHA-256 metadata。
5. Web 调用 `/api/v1/attachments/complete`。
6. API HEAD 校验大小与 SHA-256，标记 ready 并写审计。
7. 查看时 API 返回 5 分钟 GET URL。
8. 删除先软删除数据库记录，再清理 R2；对象清理失败记录错误但不会恢复数据库可见性。

限制：JPEG/PNG/WebP、单文件 10 MB、每条记录最多 6 张。

## Custom domains and CORS

默认 Web URL：

```text
https://bike-ops-staging.pages.dev
https://bike-ops-production.pages.dev
```

Railway API 使用生成的 `*.up.railway.app` 域名。若增加自定义 Web 域名，将 origin 以逗号分隔写入对应 GitHub Environment Variable：

```text
CUSTOM_WEB_ORIGINS=https://staging-ops.example.com
CUSTOM_WEB_ORIGINS=https://ops.example.com
```

这些 origin 会同时进入 R2 CORS 和 API `CORS_ALLOWED_ORIGINS`。API 不允许 `*`。

当前自动化尚未实现自定义 DNS 创建/验证；需要在 Cloudflare/Railway 控制台或后续受控自动化中完成，然后更新 Environment Variable 并重新 apply。

## First administrator

Bootstrap 将 `INITIAL_ADMIN_SETUP_TOKEN` 的 SHA-256 写入 Railway `ADMIN_SETUP_TOKEN_HASH`。明文 Token 不进入数据库、state 或日志。

首次部署后，由授权人员打开：

```text
https://<web-origin>/#setup=<INITIAL_ADMIN_SETUP_TOKEN>
```

创建首位管理员后：

1. Setup API 因数据库已存在用户而拒绝再次创建。
2. 立即把 GitHub Environment 中的 `INITIAL_ADMIN_SETUP_TOKEN` 轮换为一个不可恢复的新随机值。
3. 重新 apply，使 Railway 中旧 Token 的哈希失效。
4. 当前 bootstrap preflight 仍要求该变量；不要在重新 apply 前直接删除它。若要彻底清空 `ADMIN_SETUP_TOKEN_HASH`，需在 Railway 控制台受控执行，并记录变更，或后续为 ops CLI 增加显式 disable-setup 命令。

## Rollback boundary

当前 CLI 只实现 `plan/preflight/apply/release/verify`，没有自动 rollback、destroy 或 secret rotation 命令。

已设计的人工回滚原则：

- Web：重新部署上一 Git SHA 的 `apps/web/dist`。
- API：Railway 回滚到上一固定部署。
- Database：采用 Expand/Migrate/Contract；普通代码回滚不执行破坏性 down migration。
- R2：业务删除采用软删除，不随应用回滚批量删除对象。
- 数据库灾难恢复必须经过负责人审批，不能与普通代码回滚混用。

在实现并测试自动 rollback 前，不得宣称“一键回滚”。

## Staging acceptance checklist

在允许任何 Production 操作前，至少验证：

- Setup Link 只能创建首位管理员一次。
- 登录、失败锁定、Session 恢复/过期、登出、强制改密。
- operator/manager/admin 权限边界。
- 销售仍是唯一闭店门槛；manager/admin 闭店与重开。
- 维修、待取、二手车、其它交接完整生命周期。
- 多用户 revision conflict、Idempotency-Key 和审计/撤回。
- R2 上传、HEAD 校验、查看、删除和签名过期。
- 旧 v5 迁移预览、合法/拒绝记录、重复提交。
- 离线只读、首次同步失败、焦点刷新、45 秒轮询。
- Android/iPhone、键盘、屏幕阅读器、200% 缩放、Reduced Motion。
- Supabase 备份/恢复点、Railway/Pages 回滚和故障处理流程。

## Current execution boundary

截至 V5.2.9 Staging 准备阶段：

- 私有 GitHub 仓库已有 `main` 与 `develop`；`staging` Environment 仅允许 `develop` 部署。
- 无真实 Cloudflare/Railway/Supabase/R2 资源。
- 无真实 Environment Secret。
- 未执行 Staging apply/release；Production apply/release 明确禁止。
- 任何云执行都需要用户先安全配置 GitHub Environment Secret，并在当前网络可访问境外平台；不可达时请开启 VPN 后继续。
