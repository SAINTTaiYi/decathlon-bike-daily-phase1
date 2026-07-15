# Staging 账号、权限与 Secret 配置清单

适用环境：`staging`

目标：为 `SAINTTaiYi/decathlon-bike-daily-phase1` 准备 Cloudflare、Railway、Supabase 和 GitHub Environment，随后由 `develop` 分支执行首次 Staging Bootstrap。

> 本文件只能记录 Secret 名称、权限与操作状态。禁止把任何 Token、密码、密钥、数据库连接串或 Setup Token 写入本文件、普通聊天、仓库、日志或 `infra/state`。

## 0. 开始前

- 当前网络若无法稳定访问 GitHub、Cloudflare、Railway、Supabase 或 npm，请先开启 VPN；确认不可达后不要盲目重试。
- 为 GitHub、Cloudflare、Railway、Supabase 启用 MFA；优先使用密码管理器保存恢复码和高价值 Secret。
- 确认三家云平台的账单、套餐、项目配额和预算提醒。Staging 也可能产生费用。
- 不创建 Production 资源，不复用任何 Staging Secret 到 Production。
- 当前 GitHub `staging` Environment 已存在并只允许 `develop` 部署。

## 1. Cloudflare

官方文档：

- Account ID：<https://developers.cloudflare.com/fundamentals/account/find-account-and-zone-ids/>
- 创建 API Token：<https://developers.cloudflare.com/fundamentals/api/get-started/create-token/>
- API Token 权限：<https://developers.cloudflare.com/fundamentals/api/reference/permissions/>
- R2 S3 API 凭证：<https://developers.cloudflare.com/r2/api/tokens/>

### 1.1 创建并加固账号

- [ ] 注册/登录 Cloudflare。
- [ ] 启用 MFA，保存恢复码。
- [ ] 创建或选择专用于本项目的 Cloudflare Account。
- [ ] 开通 R2；Cloudflare 要求先启用/购买 R2，之后才能生成 R2 API Token。
- [ ] 检查账单与预算提醒。

### 1.2 复制 Account ID

在 Account Home 或 Workers & Pages 的 Account details 中复制 Account ID。

写入 GitHub Environment Secret：

```text
CLOUDFLARE_ACCOUNT_ID
```

### 1.3 创建 Cloudflare 管理 API Token

用途：Bootstrap 创建/协调 Pages Project、R2 Bucket 和 R2 CORS。

建议创建自定义 Token，只作用于目标 Account：

```text
Account / Cloudflare Pages / Edit
Account / Workers R2 Storage / Edit
```

如控制台要求读取 Account 元数据，再增加最小的 Account Read/Account Settings Read 权限。默认 `pages.dev` + Railway 生成域名不需要 DNS 权限；只有以后配置自定义域名时，才另行创建带 Zone Read/DNS Edit 的受限 Token。

写入 GitHub Environment Secret：

```text
CLOUDFLARE_API_TOKEN
```

### 1.4 预创建 Staging R2 Bucket

为了让浏览器上传凭证可以从一开始就限制到单个 Bucket，先手动创建：

```text
Bucket name: bike-ops-staging-media
Location hint: APAC
Storage class: Standard
Public access: disabled
```

不要创建同名 Production Bucket。

### 1.5 创建 Bucket-scoped R2 S3 Token

在 R2 Overview → Manage API Tokens 创建 R2 Token：

```text
Permission: Object Read & Write
Bucket scope: bike-ops-staging-media only
```

创建后只会显示一次 Access Key ID 与 Secret Access Key，立即保存到密码管理器。

分别写入：

```text
R2_ACCESS_KEY_ID
R2_SECRET_ACCESS_KEY
```

注意：这两个 S3 凭证与 `CLOUDFLARE_API_TOKEN` 不是同一种 Token，不能互换。

## 2. Railway

官方文档：

- Tokens / Public API：<https://docs.railway.com/integrations/api>
- CLI Token 环境变量：<https://docs.railway.com/cli>
- Workspaces：<https://docs.railway.com/projects/workspaces>

### 2.1 创建并加固账号

- [ ] 注册/登录 Railway，优先使用已启用 MFA 的 GitHub 身份。
- [ ] 创建专用 Workspace，例如 `Decathlon Bike Ops`。
- [ ] 确认套餐、账单、项目创建权限、用量上限和预算提醒。
- [ ] 暂时不要手动创建 Project；Bootstrap 会创建 `decathlon-bike-ops-staging`。

### 2.2 获取 Workspace ID

优先从 Workspace 设置页或 Workspace URL 复制 ID。

如果界面不显示，可创建一个临时 Account Token，通过 Railway GraphQL API 查询 `me { workspaces { id name } }`；不要把 Token 直接写进命令历史，用隐藏输入或安全 API 客户端。获取 ID 后立即撤销该临时 Account Token。

写入：

```text
RAILWAY_WORKSPACE_ID
```

### 2.3 创建 Workspace Token

在 Railway Account Settings → Tokens 中选择目标 Workspace，创建 Workspace Token。它应能在该 Workspace 内创建 Project、Environment、Service、变量与域名。

写入：

```text
RAILWAY_API_TOKEN
```

该 Token 仅由手动 Bootstrap Workflow 映射；普通 Staging release 不映射它。

### 2.4 Bootstrap 后创建 Project Token

此项现在无法完成，因为 Project 还不存在。首次 Bootstrap 创建 `decathlon-bike-ops-staging` 和 `staging` Environment 后：

1. 进入该 Railway Project → Settings → Tokens。
2. 创建仅作用于 `staging` Environment 的 Project Token。
3. 写入 GitHub Environment Secret：

```text
RAILWAY_TOKEN
```

4. 在 `RAILWAY_TOKEN` 就绪前，不要合并自动生成的 `infra/state/staging.json` PR，否则后续 `develop` release 会在 credential preflight 处失败。

## 3. Supabase

官方文档：

- Management API / Access Token：<https://supabase.com/docs/reference/api/introduction>
- 数据库连接模式：<https://supabase.com/docs/guides/database/connecting-to-postgres>
- Access Control：<https://supabase.com/docs/guides/platform/access-control>

### 3.1 创建账号与 Organization

- [ ] 注册/登录 Supabase，启用 MFA。
- [ ] 创建专用于本项目的 Organization。
- [ ] 确认套餐、项目配额、账单和备份/恢复能力。
- [ ] 暂时不要手动创建 Project；Bootstrap 会创建 `bike-ops-staging`。

### 3.2 创建 Management API Token

在 Account → Access Tokens 创建 Personal Access Token。PAT 继承账号权限，应只保存在密码管理器和 GitHub Environment；如果控制台支持满足项目创建/读取/健康检查的细粒度 Token，优先使用最小权限 Token。

写入：

```text
SUPABASE_ACCESS_TOKEN
```

### 3.3 获取 Organization slug

项目创建 API 要求的是 Organization **slug**，不是 UUID。通常可从 Organization URL 或设置页复制。

写入：

```text
SUPABASE_ORG_SLUG
```

### 3.4 生成数据库密码

在密码管理器生成至少 32 字符的高强度随机密码，并建立安全备份。Bootstrap 会用它创建项目和连接数据库。

写入：

```text
SUPABASE_DB_PASSWORD
```

迁移使用 Supavisor session pooler（IPv4，5432），API 运行时使用 transaction pooler（6543）；GitHub-hosted runner 不需要购买 Dedicated IPv4 Add-on。

## 4. 应用级 Secret

建议在密码管理器中创建一个 `Bike Ops / Staging` 条目，分别保存以下值，不得复用：

```text
SESSION_SECRET
CSRF_SECRET
PASSWORD_PEPPER
CONTACT_ENCRYPTION_KEY
INITIAL_ADMIN_SETUP_TOKEN
```

要求：

- `SESSION_SECRET`：至少 32 个高熵字符；轮换会使现有 Session 失效。
- `CSRF_SECRET`：至少 32 个高熵字符；不得与 Session Secret 相同。
- `PASSWORD_PEPPER`：至少 32 个高熵字符；丢失后现有密码无法正常验证，必须安全备份。
- `CONTACT_ENCRYPTION_KEY`：必须是恰好 32 bytes 的 base64url 字符串；丢失后已加密联系方式不可恢复，必须有受控备份。
- `INITIAL_ADMIN_SETUP_TOKEN`：至少 32 bytes 随机值；首次管理员创建后必须轮换为不可恢复的新值并重新 apply。

如果不便自行生成，可在后续明确授权助手生成这 5 个值、直接写入 GitHub Environment，并把一次性恢复包写入设备剪贴板；不要要求助手在普通聊天中显示它们。

## 5. 写入 GitHub `staging` Environment

入口：

```text
Repository → Settings → Environments → staging
```

GitHub 官方说明：<https://docs.github.com/en/actions/how-tos/deploy/configure-and-manage-deployments/manage-environments>

### 5.1 首次 Bootstrap 前必须存在的 14 个 Secret

```text
CLOUDFLARE_ACCOUNT_ID
CLOUDFLARE_API_TOKEN
RAILWAY_API_TOKEN
RAILWAY_WORKSPACE_ID
SUPABASE_ACCESS_TOKEN
SUPABASE_ORG_SLUG
SUPABASE_DB_PASSWORD
SESSION_SECRET
CSRF_SECRET
PASSWORD_PEPPER
CONTACT_ENCRYPTION_KEY
INITIAL_ADMIN_SETUP_TOKEN
R2_ACCESS_KEY_ID
R2_SECRET_ACCESS_KEY
```

### 5.2 Bootstrap 后、合并 state PR 前增加

```text
RAILWAY_TOKEN
```

### 5.3 可选 Environment Variable

默认使用 `https://bike-ops-staging.pages.dev` 时无需配置。只有增加自定义 Web Origin 时，才添加 Environment Variable（不是 Secret）：

```text
CUSTOM_WEB_ORIGINS=https://staging-ops.example.com
```

多个 Origin 用英文逗号分隔，不允许 `*`。

## 6. 配置完成后的安全核验

完成 14 个 Bootstrap Secret 后，只回复：

```text
Staging 14 个 Bootstrap Secret 已配置，关键密钥已备份。
```

不要发送值、截图或部分 Token。

后续由自动化执行：

1. 只列出 GitHub Environment Secret 名称和更新时间，不读取值。
2. 再次确认本次可能创建收费资源。
3. 从 `develop` 手动 dispatch `Bootstrap infrastructure`，选择 `staging`。
4. Workflow 按 tests/typecheck/build → plan → preflight → apply 执行；preflight 失败时不会创建资源。
5. 审查非敏感 state artifact/PR。
6. 创建并配置 Railway `RAILWAY_TOKEN`。
7. 合并 state PR，执行 Staging release 与完整验收。

## 7. 禁止事项

- 不在普通聊天中发送 Secret。
- 不把 Secret 写入 `.env.example`、Markdown、Issue、PR、commit、日志或 `infra/state`。
- 不使用 Cloudflare Global API Key。
- 不给 R2 浏览器上传凭证 Account-wide Admin 权限。
- 不在 Staging 与 Production 之间复用数据库密码、R2 key、Session/CSRF Secret、Password Pepper、Contact Encryption Key 或 Setup Token。
- 未完成 Staging 验收和用户另行批准前，不创建 Production Environment 或 Production 云资源。
