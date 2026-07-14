# Decathlon Bike Ops V5.2.7 · Deployment Summary

## Executive status

V5.2.7 已从纯本机 Vite + React 应用升级为数据库驱动全栈 Monorepo：

```text
Cloudflare Pages
  → Railway Fastify API
      → Supabase PostgreSQL 16
      → Cloudflare R2 private media
```

代码已具备真实账号、Session/CSRF、RBAC、服务端业务规则、revision 并发控制、事务化审计/撤回、旧 v5 显式导入、R2 私有附件、幂等部署 CLI 和 GitHub Actions。

**但目前只完成本地代码和静态验证：尚未连接云账号、创建资源、写入 Secret、执行 Staging 或 Production。**

## Platform decision

| Layer | Platform | Reason |
|---|---|---|
| Web | Cloudflare Pages Direct Upload | 静态发布快、可由统一 Workflow 控制切换顺序 |
| API | Railway | 运行 Node.js 22 Fastify 容器、环境级变量与固定服务域名 |
| Database | Supabase PostgreSQL 16 | 独立项目、直接/Pooler 双连接、平台备份能力 |
| Media | Cloudflare R2 | 私有对象、浏览器直传、S3-compatible 签名 |
| CI/CD | GitHub Actions | Environment Secret、审批、分支与 SHA 门禁 |

如果门店长期在中国大陆使用，必须在真实 Staging 验收网络时延和稳定性。若跨境链路不满足业务要求，应另行评估境内部署；不要在未测试前宣称当前海外平台满足大陆生产 SLA。

## Environment isolation

Staging 与 Production 分别拥有：

- GitHub Environment Secret
- Cloudflare Pages Project
- R2 Bucket 与 Bucket-scoped S3 credential
- Railway Project/Environment/Service
- Supabase Project 与数据库密码
- `infra/state/<environment>.json`

Production 不复用 Staging 数据库、Bucket、连接串、Session Secret、CSRF Secret、Password Pepper、Contact Encryption Key 或 Setup Token。

## Release flow

### Infrastructure bootstrap

```text
plan
→ preflight
→ Supabase
→ Pages/R2
→ Railway resources + variables
→ migration
→ API deploy + verify
→ Pages deploy
→ state checkpoint
```

### Subsequent release

```text
migration
→ Railway API
→ readiness + version
→ Cloudflare Pages
→ final API/Web verification
```

### Production gates

- Workflow 仅手动触发。
- 必须从 `main`。
- 必须输入完整 `release_sha`。
- 必须输入已验收的 `staging_accepted_sha`。
- 除非环境 state 文件，Production 源码必须与已验收 Staging 源码一致。
- GitHub Production Environment 必须由 reviewer 批准。
- `approve_production=true`。
- `confirm_backup=true`。
- CLI 再次要求 `--approve-production --confirm-backup`。

## Security boundary

- 密码：Argon2id + server pepper。
- Session：HttpOnly/Secure/SameSite Cookie，数据库只存哈希。
- CSRF：Session 绑定哈希；写请求必须验证。
- Authorization：API 根据 user/store/role 判断。
- Contacts：AES-256-GCM 加密，HMAC 指纹，不写普通日志。
- Pickup code：只在当次请求中校验，不落库、不进审计。
- Attachments：R2 private、5 分钟签名 URL、MIME/size/SHA-256 校验。
- Secrets：只从 GitHub Environment/执行环境注入；state 与日志不得包含 Secret。
- Database migration：direct URL 环境变量、checksum、advisory lock、事务执行。
- Network failure：境外平台不可达时停止并提示 VPN，不盲目重试。

## Local verification completed before cloud execution

- Domain、Database、Web/Ops、API 单元测试。
- TypeScript typecheck。
- Workspace build 与版本指纹守卫。
- PostgreSQL 16 migration validation（CI 配置）。
- Workflow YAML 解析与 34 项静态发布策略。
- Production 无凭证 fail-closed。
- Secret/连接串静态检查。

最终数值以 `plan/receipts/step-06-deployment.json` 与 `step-07-governance.json` 为准。

## Required GitHub setup

1. 创建私有仓库并建立 `develop`、`main`。
2. 创建 `staging`、`production` GitHub Environments。
3. 为 Production 配置 required reviewers。
4. 分别配置环境专属 Cloudflare、Railway、Supabase、应用和 R2 Secret。
5. 先从 `develop` 运行 Bootstrap Staging。
6. 验收 Staging 后记录 accepted SHA。
7. 经用户单独批准后，从 `main` Bootstrap Production。
8. Production release 前确认 Supabase backup/recovery point。

完整 Secret 清单、CLI 参数、Workflow 行为和验收项见 [`AUTOMATED-DEPLOYMENT.md`](./AUTOMATED-DEPLOYMENT.md)。

## Staging acceptance

Production 前必须在真实 Staging 验证：

- Setup、登录、强制改密、Session 与角色权限。
- 销售/闭店、维修、待取、二手车、其它交接。
- 双设备 revision conflict 与幂等重复提交。
- 审计查询和安全撤回。
- R2 上传、查看、删除与签名过期。
- 旧 v5 数据预览、导入、拒绝项与重复导入。
- 离线只读、首次同步失败、45 秒同步和 Session 过期。
- Android/iPhone、键盘、屏幕阅读器、200% 缩放、Reduced Motion。
- 备份、API 回滚、Web 回滚与故障响应。

## Go / No-Go

### Go

- 所有 Staging 核心流程通过。
- Staging accepted SHA 已固定。
- Production 资源与 Secret 独立。
- 备份或恢复点可证明存在。
- required reviewer 与负责人已批准。
- 网络质量满足门店实际使用。

### No-Go

- 任何 Production Secret 与 Staging 共用。
- 数据库备份未确认。
- Production 源码不同于已验收 Staging。
- R2 凭证不是 Bucket 范围受限。
- 真实联系方式出现在日志、构建产物或 Secret 扫描结果。
- 当前网络无法稳定访问平台且未开启 VPN。
- 仍未完成真实手机和双用户并发验收。

## Rollback boundary

当前自动化没有一键 rollback/destroy/rotate-secrets 命令，不能宣称已自动化：

- Web：重新部署上一固定 Git SHA。
- API：Railway 回滚上一固定 deployment。
- DB：Expand/Migrate/Contract；普通代码回滚不执行破坏性 down migration。
- Disaster recovery：需负责人审批后使用 Supabase backup/PITR 能力。
- R2：软删除优先，不随代码回滚批量删除对象。

## Immediate next step

本地收口完成后，进入 `08-build-test-push`：

1. 最终测试、typecheck、build、Workflow/Secret 检查。
2. 确认无真实 Secret 与未跟踪生成物。
3. 创建私有 GitHub 仓库和首个 commit。
4. 推送前若 GitHub 不可达，停止并提示开启 VPN。
5. 用户安全配置 Staging GitHub Environment Secret 后，再执行 Staging Bootstrap。
