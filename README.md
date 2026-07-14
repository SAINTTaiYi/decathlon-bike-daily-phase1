# Decathlon Bike Ops · Daily Closing Lookbook

V5.2.7 是数据库驱动的自行车部门闭店与跨日业务工作台。它保留移动端黑白硬边 product lookbook 视觉，同时以 Fastify API、Supabase PostgreSQL、真实账号、服务端业务规则、审计和私有 R2 附件支撑多设备协作。

> 本项目不接入迪卡侬官方业务 API。门店同事仍人工录入数据，但 PostgreSQL 是正式业务事实源；浏览器只保留运行时会话、最近成功加载的内存快照和可选的旧 v5 显式迁移来源。

## V5.2.7 current state

已在代码与本地验证中完成：

- pnpm Monorepo：Web、API、Domain、Contracts、Database。
- 用户名 + 密码、Argon2id、HttpOnly Session、CSRF、登录限流与首次强制改密。
- `operator / manager / admin` 角色；闭店和旧数据迁移要求 manager/admin。
- 服务端业务日期、revision 并发控制、Idempotency-Key 和事务化审计/撤回。
- 销售、闭店、维修、待取、二手车、其它交接的 `/api/v1/*` 接口。
- 维修联系方式 AES-256-GCM 加密与 HMAC 指纹。
- R2 私有图片：短期 PUT/GET 签名 URL、SHA-256/大小校验、软删除。
- Web 初始同步、写后刷新、窗口聚焦刷新、45 秒轮询、离线只读、Session 过期处理。
- manager/admin 显式预览并导入旧 v5 本机数据；取货码在浏览器端剥离。
- Cloudflare Pages + Railway + Supabase + R2 的幂等 ops CLI 和 GitHub Actions。
- Staging/Production 完全隔离；Production 要求 Staging 源码验收、main、固定 SHA/version、审批、显式批准和备份确认。

尚未执行：

- 未创建任何真实云资源，未连接云账号，未写入真实 Secret。
- 未进行真实 Supabase/R2/Railway/Cloudflare 端到端测试或手机 Staging 验收。
- 未执行 Production apply/release。

## Product rules

- 销售数据已保存是唯一闭店门槛。
- 只有 manager/admin 可以完成闭店或重新打开。
- 未变化的维修、待取、二手车和其它交接自然跨日。
- 门店产品维修原地完成；付费/质保/免费维修完成后转入待取。
- 非免费维修须已开付款单或质保单才可取车；免费维修可直接取车。
- 自提取货码只用于当次请求，不保存、不记录。
- 完成与取车记录当日标黑，下一服务端业务日从当前台账清理，审计历史保留。
- 闭店后写操作锁定；查看历史仍可用。

完整事实源见 [`PRODUCT.md`](./PRODUCT.md) 与 [`DESIGN.md`](./DESIGN.md)。

## Architecture

```text
Browser
  └─ Cloudflare Pages · Vite 5 + React 18
       └─ credentials: include + CSRF + Idempotency-Key
            └─ Railway · Node.js 22 + Fastify + TypeScript
                 ├─ Supabase PostgreSQL 16
                 └─ Cloudflare R2 private bucket
```

运行时版本接口：

```text
GET /health/live
GET /health/ready
GET /api/v1/meta/version
```

## Repository layout

```text
apps/
  web/                  Vite + React lookbook UI
  api/                  Fastify auth/business/media API
packages/
  domain/               shared business rules
  contracts/            Zod request/response contracts
  database/             PostgreSQL client and migration runner
supabase/
  migrations/           explicit SQL schema history
  seed.sql              no users, passwords, contacts, or business data
infra/
  docker/               Railway API Dockerfile
  state/                non-sensitive resource IDs only
scripts/ops/            plan/preflight/apply/release/verify automation
.github/workflows/      CI, bootstrap, staging, production
tests/                  Web, workflow, ops and version regression tests
plan/                   execution plan, checkpoints and receipts
```

## Requirements

- Node.js 22 (`.nvmrc`)
- pnpm 9.15.9
- PostgreSQL 16 or local Supabase CLI stack

If npm, GitHub or cloud endpoints are unreachable from the current network, stop and enable VPN before continuing. The ops/network guard intentionally does not blindly retry a confirmed network-unreachable error.

## Local setup

```bash
corepack enable
corepack prepare pnpm@9.15.9 --activate
pnpm install --frozen-lockfile
cp .env.example .env
```

Start PostgreSQL/Supabase, fill `.env`, then run migrations:

```bash
pnpm --filter @bike-ops/database migrate
```

Start API and Web in separate terminals:

```bash
pnpm dev:api
pnpm dev:web
```

- Web: `http://127.0.0.1:5173`
- API: `http://127.0.0.1:8787`
- Local Supabase PostgreSQL default: `127.0.0.1:54322`

The seed contains no account. For local first-run, set `ADMIN_SETUP_TOKEN_HASH` to the SHA-256 of a temporary token, then open:

```text
http://127.0.0.1:5173/#setup=<temporary-token>
```

After creating the first administrator, rotate the Environment Secret to a new unrecoverable value and re-apply. The current bootstrap preflight still requires this variable; the database user count independently prevents a second setup.

## Environment variables

See [`.env.example`](./.env.example). Important boundaries:

- `VITE_*` may reach the browser.
- Database URLs, password pepper, Session/CSRF secrets, contact encryption key and R2 credentials are API-only.
- `DATABASE_URL` is the runtime transaction-pooler URL.
- `DIRECT_DATABASE_URL` is the direct PostgreSQL URL used by migrations.
- Production CORS origins must be explicit; `*` is rejected.

## Verification

```bash
pnpm check:workflows
pnpm test
pnpm typecheck
pnpm build
```

The root test command runs Domain, Database, Web/Ops and API suites. The build command first enforces version consistency and the source/deployment fingerprint, then builds all packages.

Database schema smoke test can also be run against PostgreSQL 16 using the same steps in `.github/workflows/ci.yml`.

## Version governance

Current version: **V5.2.7**.

Version truth must match across:

- root `package.json`
- `apps/web/package.json`
- `apps/web/src/data/releaseNotes.js`
- `version-manifest.json`

For the next product change:

```bash
pnpm version:patch -- \
  --title "更新标题" \
  --summary "更新摘要" \
  --change "更新项一" \
  --change "更新项二"

# complete code and documentation changes first
pnpm version:stamp
pnpm build
```

The fingerprint includes source code, tests, migrations, deployment workflows, infrastructure configuration and product/design documentation; generated `dist`, dependencies, runtime state and execution receipts are excluded.

## Deployment commands

All commands are environment-explicit and fail closed:

```bash
pnpm ops plan staging
pnpm ops preflight staging
pnpm ops apply staging
pnpm ops verify staging

pnpm ops plan production
pnpm ops apply production --approve-production
pnpm ops release production --approve-production --confirm-backup
pnpm ops verify production
```

Never run Production before Staging acceptance. Cloud bootstrap requires environment-scoped GitHub Secrets; real tokens must not be committed or pasted into ordinary project files.

Detailed automation and current limitations are in [`AUTOMATED-DEPLOYMENT.md`](./AUTOMATED-DEPLOYMENT.md) and [`deploy-summary.md`](./deploy-summary.md).

## Security notes

- Do not commit `.env`, database passwords, PAT/API tokens, Session/CSRF secrets, contact encryption keys or R2 S3 keys.
- `infra/state/*.json` may contain only non-sensitive resource IDs, names, domains, phase and release SHA.
- Production data must never be copied into Staging.
- Do not treat a successful static build as cloud or disaster-recovery validation.
- R2 keys must be bucket-scoped and environment-specific.

## Staging acceptance still required

Before any Production action, validate on real Staging:

- first admin setup, login, forced password change and role boundaries
- CRUD, repair routing, pickup rules, closing/reopen and audit undo
- revision conflict with two users/devices
- R2 upload, display and deletion
- old v5 migration preview/import and idempotency
- offline read-only and Session expiry
- Android/iPhone, keyboard, screen reader, 200% zoom and reduced motion
- backup/recovery-point availability and rollback procedure
