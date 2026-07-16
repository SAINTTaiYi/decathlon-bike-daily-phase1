# 执行检查点

保存时间：2026-07-17 03:37 +08:00
当前阶段：Phase C / Step 10b、12、13、14、15 completed；Step 16 paused by user（转入 Skill 库整理；不得继续 Secret/EdgeOne 配置）

## Accepted repository baseline

- 私有仓库：`SAINTTaiYi/decathlon-bike-daily-phase1`。
- Accepted `main` SHA：`e2a64ad4bbec313a23bcec254e12300377763bc8`。
- `develop` V5.3.0 release SHA：`89a60dd9d5db8432e22f865c86d89e915365dc3b`，已普通 fast-forward push 并验证远端一致。
- Step 12：`a77083447d6724bf1bf1e1e1722014fc70801ab6`。
- Step 13：`bc062820e85430149d6cf5d6c593fbfd24302818`。
- Step 14 implementation：`8f462f2df58743210dea7f0a4ba4dd9c0657741d`；checkpoint：`948fa5dc256a9f3cc3d0b1c68a2da294c7962681`。
- `staging` GitHub Environment ID `18164650072`，custom deployment branch policy 仅允许 `develop`。

## Accepted architecture

```text
Browser
  └─ EdgeOne Makers Free
       ├─ Vite/React static site
       └─ Node.js Cloud Functions · same-origin /api
            ├─ Supabase Free PostgreSQL
            └─ Supabase Free private Storage

GitHub Free
  ├─ private source / CI / Gitleaks
  └─ migrate first, then fast-forward EdgeOne deployment branch
```

约束：免费额度、无需外币信用卡、禁止付费套餐/按量计费/自动升级；Staging 与 Production 完全隔离；Production 继续禁止。

## Step 12 — EdgeOne Serverless runtime completed

- Fetch → Fastify inject adapter；不监听端口。
- 同源 `/api/*`、`/health/*` Cloud Function wrappers。
- EdgeOne context env/clientIp 进入 API 边界。
- Supavisor transaction pooler；默认 max 1、idle 5 秒、connect 15 秒、prepare false。
- `edgeone.json` 固定 Node 22.11.0、pnpm 9.15.9、API/Web build 和 `apps/web/dist`。

## Step 13 — Supabase private Storage completed

- server-only `SUPABASE_SECRET_KEY` 不进入浏览器。
- 对象级 signed upload、5 分钟 signed download。
- Complete 重新下载并计算真实 SHA-256。
- 10 MB、JPEG/PNG/WebP、每记录 6 张、审计、幂等和软删除。
- Guarded private bucket migration 已加入。

## Step 14 — Free deployment governance completed

- 删除旧 Railway/Cloudflare Pages/R2/bootstrap/Docker/infra-state 自动化。
- 仅保留 CI、manual Staging release、manual Production release。
- EdgeOne 专用分支：`edgeone-staging` / `edgeone-production`。
- 顺序：immutable source gate → tests/typecheck/build → checksum migration → ordinary fast-forward push → EdgeOne Git deploy → exact SHA/version/environment/database/Web verify。
- 禁止 force push；non-fast-forward fail closed；EdgeOne build 不迁移数据库。
- Staging 可 `database_only_bootstrap=true` 先建 schema/private bucket。
- Production 需要 accepted Staging、相同源码、审批、加密外部导出、恢复演练、Free/no-billing 确认。
- Governance 61/61。

## Step 15 — V5.3.0 build/test/push completed

- 版本：V5.2.10 → V5.3.0；release notes 4 项；service-worker cache `bike-ops-v5.3.0-static`。
- Version manifest：268 files，fingerprint 已登记。
- 官方 Node.js v22.22.2 linux-arm64 archive SHA-256 校验通过。
- pnpm 9.15.9；offline frozen install passed。
- Tests：Domain 4/4、Database 2/2、Web/Ops 47/47、API 16/16；总计 69/69。
- Typecheck：全部 TypeScript workspaces passed。
- Build：全部 buildable workspaces passed；EdgeOne wrappers import passed。
- Clean commit build metadata：version `5.3.0`、SHA `89a60dd9d5db8432e22f865c86d89e915365dc3b`。
- Gitleaks 8.30.1 linux-arm64 archive SHA-256 校验通过；working tree 0 findings；完整历史 16 commits 0 findings。
- 普通 push `develop` 成功；远端 SHA 与本地一致；无 force push。
- Receipt：`plan/receipts/step-15-free-stack-build-test-push.json`。
- 未创建或修改任何云资源。

## Step 16 — Free Staging bootstrap in progress

用户已明确确认：

- Organization：`SAINTTaiYi's Org` / `sctiyeyjvaezeofhysfq`。
- Supabase project cost：**0 元/月**，按 Free 边界创建；不启用付费/按量/自动升级。
- Region：Singapore / `ap-southeast-1`。
- Production 未批准。

已创建：

- Supabase project `bike-ops-staging` / ref `xrxmayzwxabmzanwhkmo`。
- URL：`https://xrxmayzwxabmzanwhkmo.supabase.co`。
- Status：`ACTIVE_HEALTHY`；Organization plan 仍为 Free。
- 实际数据库：PostgreSQL `17.6.1.141`；CI PostgreSQL 16 与真实 Staging PostgreSQL 17.6 均已通过。
- 已应用 3 份仓库 checksum migration；15 张 `bike_ops` 业务表；数据库约 10.98 MB。
- Private bucket `bike-ops-media`：public=false、10 MB、JPEG/PNG/WebP。
- Migration history：RLS=true，anon/authenticated 无读取权限，3 个 SHA 与仓库一致。
- 14 个外键覆盖索引已建立；Security Advisor 无 ERROR；仅 deny-all 无 policy INFO；Performance 仅空库 unused-index INFO。
- 顾问修复版本 V5.3.1 commit `eda86f8031aaa749009d0f7560bc719927353115`；GitHub CI run `29391234924` success；70/70 tests。
- Supabase 验证检查点 `766d20db6a952e51a594d504ae240cca86ab5db2` 的 CI run `29391482691` success。
- `edgeone-staging` 已用普通 push 创建并指向 `766d20db6a952e51a594d504ae240cca86ab5db2`；force push=false。

人工配置进度（2026-07-16）：

- 用户已进入 `bike-ops-staging` 项目概览，确认状态正常。
- 用户已在 Supabase Database Settings 重置数据库密码，并确认只保存在密码管理器中；密码值未进入聊天、仓库、日志或 receipt。
- 用户已复制 Session Pooler 连接串模板；曾误进入 Doppler `bike-ops/stg`，但未保存并已明确撤销，Doppler 中未持久化连接串。后续不使用 Doppler，直接配置 GitHub Environment Secret。

下一顺序：

```text
collect Supavisor session + transaction pooler URLs without exposing values
→ collect Supabase server-only secret key without exposing value
→ configure GitHub staging MIGRATION_DATABASE_URL
→ generate isolated application runtime secrets
→ create/configure EdgeOne Makers Free Staging project
→ full deployment verification
```

EdgeOne 平台操作若当前网络不可达，停止并提醒开启 VPN；不盲目重试。

## Current free-tier boundary

- Supabase org `sctiyeyjvaezeofhysfq`；projects 0；project cost monthly amount 0。
- Supabase budget：500 MB DB、1 GB Storage、10 GB aggregate bandwidth（5 GB cached + 5 GB uncached）。
- Free inactive project may pause；Production 前必须实现加密外部导出并完成恢复演练。
- EdgeOne Free：40 projects、500 builds/month、Cloud Functions 1M/month、Edge Functions 3M/month、5 GB site storage。
- 70% quota 开始清理/归档；85% 冻结非必要附件上传；不自动升级。

## Skill library cleanup completed

- `/skills` 已从 504 个精简为 120 个活跃 Skill；384 个移动到可恢复归档，删除数为 0。
- 384/384 归档目录内容哈希验证通过；120/120 活跃 Skill 元数据验证通过；单项恢复往返测试通过。
- 活跃能力目录：`/workspace/SKILLS-CATALOG.md`。
- Skill 归档：`/workspace/skill-archive/2026-07-17-compact`；旧批量安装源码/ZIP/报告归档：`/workspace/skill-archive/2026-07-17-install-artifacts`。
- 前端项目默认五件套均保留：`design-taste-frontend`、`impeccable`、`shadcn-ui`、`ui-ux-pro-max`、`design-md`。
- Step 16 仍保持暂停；Skill 整理完成不等于恢复 Secret/EdgeOne 配置。

## Pause / resume boundary

- 用户于 2026-07-17 03:14 +08:00 再次明确暂停 Step 16，先整理全局 Skill 库。
- 当前恢复点：Supabase Session pooler 模板已复制过，但完整 URI 尚未确认保存；GitHub `staging` 的 `MIGRATION_DATABASE_URL` 尚未配置。
- Doppler 误操作已撤销，未保存任何连接串；后续禁止使用 Doppler。
- 恢复时从 Supabase Connect 生成完整 Session pooler URI，并直接配置 GitHub Environment Secret；之后才收集 transaction pooler/server-only key 和 EdgeOne runtime secrets。
- 暂停期间：不创建 EdgeOne project、不配置任何 Secret、不触发 Staging deployment、不创建 Production 资源。

## Safety

- 当前已有一个 Supabase Free Staging project；无 EdgeOne/Railway/Cloudflare Pages/R2 真实资源。
- 未配置真实 Secret、未部署 Staging、未创建 Production 资源。
- 不在聊天、仓库、日志或 artifact 中保存凭据。
- 无 force push、无历史改写。
