# 执行检查点

保存时间：2026-07-17 04:31 +08:00

## 当前状态加注（2026-08-08 01:4x +08:00）· V5.9.0 已上 Production

- Production `workshop.skin` 正式版本 = **V5.9.0**，SHA `7169fefd1a3cd6d91501827cddae7aa2cafe915f`，
  Worker Version ID `700e7704-a543-4301-895b-ab964d124e70`，部署 run `31203413421`（2026-08-07T17:40:47Z）。
  三轮绕缓存核验一致 `5.9.0 / 7169fefd… / env=staging`。回滚目标（如需）是上一个 Worker 版本
  `ffccee80-ad9b-446c-99f2-68a9b4093e79`（V5.8.3），走 Cloudflare 原生版本回滚，runtime-only。
- 生产库 `bike-ops-staging` 迁移已推进到 **0011**（0008/0009/0010/0011 四个，日志内各 `✅`）。
  目录树 = 南区 → 广西江湖区 → 南宁(1299, 1670) / 桂林(994) / 柳州(1249)。
  1299 与 1670 `updated_at` 仍是 `2026-07-27T23:18:07.513Z`，**逐字节零写入**。
  业务行数与部署前基线完全一致：work_items 55 / daily_closings 23 / audit_events 327 / users 12 / store_members 12。
- **纠正两条旧加注**：`version-manifest.json` 并非"仍记 5.8.5"——V5.8.4 回滚已把它带回 5.8.3，
  现已被本次发布覆盖为 5.9.0 / 432 files；原"5.8.5 对账"未决项不存在。
- **新发现（未决）**：全部真实业务数据挂在 `STAGING01`（55 工单 / 23 日结 / 327 审计 / 12 用户），
  不在 1299 五象店——账本旧述"1299 是唯一承载真实数据的门店"有误。`STAGING01` 的 `city_id` 为 NULL，
  因此不出现在后台目录树与自助注册列表（5.8.3 起的既有行为，登录路径不经过城市，不影响使用）。
- 完整证据见 `plan/RECOVERY-LEDGER-DIRECTORY-CITIES.md` 第二部分与 `docs/progress/2026-08-07-directory-guangxi-cities.md`。

## 当前状态加注（2026-08-06 +08:00）

- Production `workshop.skin` 正式版本 = **V5.8.3**（2026-08-05 22:44 从 V5.8.5 回滚，runtime-only，证据见 `plan/V583-ROLLBACK-FROM-V585-EVIDENCE.md`；V5.8.4/V5.8.5 均已回滚且不再重部署）。
- Git 分支 `feature/cloudflare-workers-d1` HEAD = `f73ca45`（docs-only 回滚证据）；`version-manifest.json` 仍记 5.8.5（有意未改，待用户决定对账方式）。
- **平台管理后台（CHU13 Admin Console）**：功能分支 `feat/admin-console` 已实现并通过本地门禁（web 契约 183/183、worker 34/34、worker typecheck、vite build）；含 3 个只读平台端点与 5 个分区。详见 `docs/progress/2026-08-06-admin-console.md`。CodeGraph 前置/后置需在 Termux 执行；Preview 部署与生产发布均需用户同意。
- 桌面适配未决问题依旧：参考 1536×1024 与用户真实窗口不符，需用户提供真实 innerWidth/innerHeight 或截图后重新定标。

## 当前状态加注（2026-08-06 23:xx +08:00）

- 管理后台 v2（移动端 / 门店审核制 / 总览驾驶舱 / 用户写操作）已在分支 feat/admin-console-v2（PR #166，commit 4a10cb0）实现并通过本地门禁（web 183/183、worker 42/42、tsc、build）；方案见 plan/ADMIN-CONSOLE-IMPLEMENTATION-PLAN.md；迁移 0008（stores pending）随 Preview 部署自动应用。待 CI + Preview 部署 + 用户验收；CodeGraph 前后置待 Termux 或豁免。

## 当前状态加注（2026-08-06 18:xx +08:00）

- 本地已同步到 `origin/feature/cloudflare-workers-d1` HEAD `e79c4f90fd22982107b628e3d953c2f84ae0ad3e`（含 PR #172 全面整改、#174 门店统一进目录、#175 证据）；管理后台为 overview / approvals / directory / users / audit 五分区，`AdminStoresSection` 已退役。
- **总览「变化流 / 最近平台事件」可读性重构**在分支 `fix/admin-overview-readability-20260806` 实现，仅 3 文件（`AdminOverviewSection.jsx`、`admin-console.css`、`tests/admin-console.test.mjs`，+151/-40）。根因为 `.admin-card-wide` 退化成死类导致三卡挤一行 + 单行 `nowrap` 截断 + 缺行高/行分隔/日锚点，非字号问题。详见 `docs/progress/2026-08-06-admin-console.md`。
- 本地门禁全绿：web 198/198（含新增可读性契约）、worker 50/50、domain 7、database 10、API 21、typecheck、`check:workflows` 88、`git diff --check`、`vite build`，并以 `react-dom/server` SSR 真实渲染核对两块输出结构。
- Production `workshop.skin` 保持 **V5.8.3 / `3ec28a32…`**，本轮不部署、不触碰 Production D1、不变更公开版本号。Preview 仅供验收。
- 备忘：`pull` 后须先 `pnpm --filter @bike-ops/contracts build`，否则 worker 测试因旧 dist 缺 `adminCreateUserSchema` 假失败 1 项。CodeGraph 前后置本轮豁免（不在当前 workspace 沙箱）。

## 当前状态加注（2026-08-07 +08:00）

- 目录与用户两分区可读性重构完成，等 Preview 验收。根因按实际宽度算出：目录固定 5 列使大区列仅 226px、标题列被状态与按钮压到 1.4px，且展开态仍被关在窄列内导致门店行 min-content 溢出 3.4 倍；用户表「角色」「门店」分列拼接需人工按位置对应。
- 修复：目录折叠态 `auto-fill minmax(260px)` + 头部两行（新增 `.admin-directory-module-meta`），展开态 `grid-column: 1 / -1` 独占整行；用户表合并为「门店与角色」配对列并加最近登录日锚点；时间格式化抽出 `apps/web/src/components/admin/admin-format.js`。
- 顺带修 SSR 暴露的两个真实缺陷：目录 `module()` 根节点缺 `key`（PR #174 遗留，影响重排后 reconcile）；门店行嵌套两层 `.admin-directory-actions` 使 ≤1023px 直接子选择器漏掉两个按钮。
- 门禁：web 200/200、worker 50/50、domain 7、database 10、api 21、typecheck、workflow policy 88、build、diff check 全绿。总览已用 esbuild + react-dom/server 做逐字节回归（SHA-256 `de272f93…`，5454 B 一致），确认上一轮已验收渲染未被改动。
- Production 仍 V5.8.3 未动。详见 `docs/progress/2026-08-06-admin-console.md`。

## 当前正式发布加注（2026-08-04 +08:00）

- Workshop 当前正式线上版本为 **V5.8.0**；发布 PR #132 合并 SHA：`ba86fd33f8f7c5dbc90ce37998a7876d0a0e85b7`。
- 仅使用 canonical `deploy-cloudflare-staging.yml`（Cloudflare Workers + D1 free stack）发布到 `https://workshop.skin`；run `30911801908` 成功。名称中的 staging 是历史技术标签，`workshop.skin` 是当前正式线上入口；禁止回退使用已弃用 EdgeOne 工作流。
- 已独立核验 `/health/live`、`/health/ready`、`/api/v1/meta/version` 均返回 V5.8.0 与 `ba86fd33…`，并通过 HTTPS 安全头检查。
- 完整发布证据：`docs/progress/2026-08-04-v580-production-release.md`。后续工作从 `feature/cloudflare-workers-d1` 的新 Preview 周期开始；不得为这份文档重复部署或再次公开变更版本。
当前阶段：Phase C / Step 10b、12、13、14、15 completed；Step 16 paused for RikkaHub Agent migration（不得继续 Secret/EdgeOne/部署）

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

- `/skills` 已从 504 个精简为 120 个活跃 Skill；此前归档的 384 个 Skill 已按用户明确要求永久删除；随后安装官方 `browser-harness`，当前活跃总数为 121。
- 删除前 384/384 归档目录内容哈希验证通过；原 120/120 活跃 Skill 元数据验证通过；新增 `browser-harness` Skill 已单独校验。
- 活跃能力目录：`/workspace/SKILLS-CATALOG.md`。
- 删除回执：`/workspace/skill-archive/2026-07-17-compact/DELETION-RECEIPT.json`；旧批量安装源码/ZIP/报告仍单独保留在 `/workspace/skill-archive/2026-07-17-install-artifacts`。
- 前端项目默认五件套均保留：`design-taste-frontend`、`impeccable`、`shadcn-ui`、`ui-ux-pro-max`、`design-md`。
- Step 16 仍保持暂停；Skill 整理完成不等于恢复 Secret/EdgeOne 配置。

## Browser guidance tooling investigation

- Official `browser-use/browser-harness` v0.1.5 installed at `/usr/local/bin/browser-harness`; Skill registered at `/skills/browser-harness`; telemetry disabled.
- Android app sandbox prevents the CLI from attaching directly to the phone's existing Chrome. Two temporary Browser Use Cloud browsers were stopped; no daemon remains; local Cloud OAuth credential was logged out and removed.
- `ExTV/rikkahub-agent` was inspected at commit `b4dae335293c4a4a3f31fb17d0a3535c78b4accb`, latest release `v2.4.1-agent.2`. It is a separate Android APK (`applicationId=excp.rikkahub`) and can coexist with upstream RikkaHub.
- Verified capabilities: an AI-driven in-app WebView with 18 browser tools (`browser_open`, read/screenshot/DOM/link tools, click/type/scroll/submit/select/key/eval tools, and `browser_done`), plus optional global AccessibilityService screen tools. Read browser tools default on; write browser tools default off.
- Recommended project path is the in-app browser with minimal Browser write tools enabled; do not grant global Accessibility, SMS, contacts, files, location, notification, or screen-control permissions for this task. Login/password/MFA must remain manual.
- No RikkaHub Agent APK has been downloaded or installed yet. Step 16 remains paused.

## Pause / resume boundary

- 用户于 2026-07-17 04:31 +08:00 明确要求保存全部项目进展，随后自行从当前 RikkaHub 迁移至 RikkaHub Agent。
- 迁移交接事实源：`plan/RIKKAHUB-AGENT-MIGRATION-HANDOFF.md`；远端检查点 tag：`rikkahub-agent-migration-20260717-0431`。
- 当前恢复点：Supabase Session Pooler 模板已复制过，但完整 URI 尚未确认保存；GitHub `staging` 的 `MIGRATION_DATABASE_URL` 尚未确认配置。
- 在用户迁移完成并明确恢复前：不创建 EdgeOne project、不配置任何 Secret、不触发 Staging deployment、不创建 Production 资源。

## Safety

- 当前已有一个 Supabase Free Staging project；无 EdgeOne/Railway/Cloudflare Pages/R2 真实资源。
- 未配置真实 Secret、未部署 Staging、未创建 Production 资源。
- 不在聊天、仓库、日志或 artifact 中保存凭据。
- 无 force push、无历史改写。

## 2026-08-05 — Reference desktop pixel reconstruction R2
- Rejected Preview baseline: `152e0eaf` (desktop layout failed to activate on the actual high-DPR desktop-mode viewport).
- R2 implementation root: `worktrees/workshop-reference-pixel-r2`, branch `fix/reference-pixel-r2-v581`.
- Locked target: five supplied 1536×1024 boards; real data/business interactions and phone UI preserved; Preview-only.
- Structural correction: native 1536×1024 canvas scaling, 768 CSS px desktop/tablet activation, six-item left navigation retained, release card restored.
- Exact next step: run tests/typecheck/workflow/build and CodeGraph post-gate; then commit, PR, CI and canonical Cloudflare Preview-only deployment.

### 2026-08-05 — Reference pixel R2 Preview deployed
- PR #140 merged as `dfbd72b3c9cfe49a7231c86c5d7f2db9693c7c6d`; CI verify+secrets passed.
- Cloudflare Preview-only run `30934010991` succeeded; online live/ready/meta and security checks passed repeatedly.
- Published CSS/JS are byte-identical to the locally verified build. Production and Production D1 remain untouched; public V5.8.1 unchanged.
- browser-harness is installed but has no local Chrome daemon or logged-in cloud Workshop session; no prohibited browser/accessibility fallback was used.
- State: waiting for human visual acceptance of the five 1536×1024 boards.

## 当前状态加注（2026-08-07 08:5x +08:00 · 提交延迟优化 + 安全加固已上 Preview）

- **集成分支 `feature/cloudflare-workers-d1` = `e3f15e08b45085476120c5316b82e38cc1eee2cd`**。三个 PR 按序普通合并（非 squash），每步均以 `git fetch` 观察远端 ref 位移独立确认：
  - PR #177 → `3fd89f85db0847f4e17ae841094008f3235cce19`（后台目录/用户可读性，`fee1b0e..3fd89f8`）
  - PR #178 → `6380aeb5b3119435dd43cf694cde44438d78d617`（提交延迟优化 + Smart Placement，`3fd89f8..6380aeb`）
  - PR #179 → `e3f15e08b45085476120c5316b82e38cc1eee2cd`（登录退避 + 租户收敛，`6380aeb..e3f15e0`）
- **Preview 已部署并三轮绕缓存核验**：run `31163535215`（`workflow_dispatch`，08:52:47Z 起，`completed success`）。`/api/v1/meta/version` 三轮一致返回 `gitSha=e3f15e08b450`、`environment=preview`。部署日志确认 `wrangler d1 migrations apply bike-ops-preview --remote` 应用了 `0010_admin_console_query_indexes.sql`（1 migration），`Current Version ID: 7aff442f-92ae-4b9e-bcda-3353b74f678c`，上传 277.57 KiB / gzip 61.85 KiB。`seed_preview_data=false`，既有验收数据未被覆盖。
- **Production `workshop.skin` 全程未部署、未触碰**：三轮核验一致 `5.8.3 / 3ec28a321b1f / environment=staging`，与部署前基线逐字一致。
- **Cloudflare 边缘限流（唯一直接作用于 Production 的改动，经用户明确要求）**：zone `workshop.skin` 新建 `http_ratelimit` entrypoint，规则匹配 `http.request.uri.path eq "/api/v1/auth/login" and http.request.method eq "POST"`，计数 `ip.src + cf.colo.id`，10 次 / 10 秒，Block 10 秒。建规则前确认该 phase 与 `http_request_firewall_custom` 均无既有 entrypoint，属从零新建。Free 套餐实测限制严于官方文档：每 zone 仅 1 条规则、动作仅 `block`（Log 需 Pro+）、`period` 仅接受 10、`characteristics` 必须含 `cf.colo.id`（计数在 colo 本地，分布式攻击实际上限高于标称）。

### 两个判据陷阱（本轮踩到，务必记住）

1. **`/api/v1/meta/version` 的 `schemaVersion` 是硬编码字符串**（`apps/worker/src/routes/health.ts:30` = `'0002_work_item_ticket_numbers'`），与实际应用的迁移**完全无关**，永远不变。不可用它判断迁移是否落库——只能看部署日志里 wrangler 的迁移输出。
2. **`cf-placement` 响应头在部署后不存在**，因此**无法据此确认 Smart Placement 运行时已生效**。部署日志里那条 `ok 174 - Worker 启用 Smart Placement` 只是契约测试确认配置文件含 `placement.mode=smart`，不等于流量已被重定位。Cloudflare 需要流量学习期后才开始迁移执行位置。
3. 部署后自检出现短暂版本混合窗口：同一时刻 `/health/live` 返回新 SHA 而 `/health/ready` 返回旧 SHA `fee1b0e7c9ba`。之后三轮 `/api/v1/meta/version` 均为新 SHA，已收敛。

### 实测延迟数据（决定后续优化方向）

- 用 `/health/ready` 减 `/health/live` 量单次 D1 往返成本（后者不碰 D1 也不加载密钥）：**Production ≈ 23.0 ms**，部署前 Preview ≈ 58.6 ms。两者均由 SIN（新加坡）节点服务。
- 写入路径优化后剩约 6 次串行往返 ≈ 140 ms，而用户体感 **2–4 秒**。**D1 往返最多占体感十分之一，代码层削减往返已接近收益上限。**
- 剩余九成在国内到 SIN/HKG 的国际出口（RTT 200–800 ms + 丢包重传 + TLS 多轮握手）。
- 唯一能根本改善体感的方向是**乐观更新**：`RecordLedger.onSubmit` → `App.saveRecord` → `workflow.addRecord` → `run()` → `await createWorkItem()` 全链路 await，提交按钮在整个跨国往返期间 disabled 显示「正在保存…」。改为本地立即落行 + 后台发请求 + 响应回来对账，可使感知延迟趋近零。基建已有 `applyServerResult` / `patchRecordLocal`；难点是工单号由服务端 `work_item_counters` 生成需本地占位再校正、revision 乐观锁、失败回滚，以及重试必须复用同一幂等键（`apps/web/src/api/client.js` 的 `api()` 默认每次新生成 UUID，除非显式传 `options.idempotencyKey`）。**未实施，待用户决定。**

### 本轮发现的真实覆盖缺口（未修，独立任务）

- **`apps/worker/security/security-audit.test.ts` 从未进入 CI**。worker 的 test 脚本是 `node --import tsx --test test/*.test.ts`，只匹配 `test/` 目录；该文件在 `security/` 下，42,800 字节、24 个用例。这解释了为何其中 3 项失败（CSRF 多标签期望 410 实得 403、注册邮箱脱敏、并发平台管理员初始化）从未拦住任何 PR。已用 stash 对照基线确认这 3 项是预先存在、非本轮引入；其中最关键的第 11 项「攻击者不能用五次错误密码锁死唯一平台管理员」在退避改动后仍通过。修法需先修断言再扩 glob，否则接进门禁会立刻变红。

### 未决事项（需用户决定）

- Preview 验收结果；是否上 Production（未获明确同意不得部署或变更正式版本号）。
- 是否实施乐观更新改造。
- `version-manifest.json` 记 5.8.5 与 Production 实际 5.8.3 的对账方式（仍未改）。
- `security-audit.test.ts` 接入 CI 的时机。

## 当前状态加注（2026-08-07 12:1x +08:00 · 后台目录手机复刻已上 Preview 并由用户验收）

**恢复入口**：`docs/progress/2026-08-07-directory-phone-replica.md`（完整证据）。

集成分支 `feature/cloudflare-workers-d1` = **`bfc5196e2056f956f7dff238db46f5fc61503664`**
（= 已部署 Preview 的 SHA）。#182 → `60cd19f4c628…`（11:41:04Z）；#183 → `bfc5196e2056…`（12:03:04Z）。
Preview run `31176618036` success，三轮核验 `5.8.3 / bfc5196e2056… / env=preview`。
CI run `31174340691` / `31176377681` 均 success（18/7 步、verify 89s/84s、日志 125252/125216 字节
魔数 `PK`、五套件 7/10/220/21/58 全 `fail 0`）。主 CSS `index-Bhb7_Q2B.css` 恒为 280.33 kB 同哈希。

**Production `workshop.skin` 全程未部署未触碰**，三轮一致
`5.8.3 / 3ec28a321b1f1f02a28a0e4d94abb1be1432065b / env=staging`。

### ⛔ 上 Production 的两个硬阻塞（未获用户明确答复前不得部署）

1. **0009 迁移第 16–17 行硬编码改名**：`WHEN name = '南区' THEN '广西江湖区'`，
   命中生产库唯一大区。本地同构演练实测结果 `南区 → 广西江湖区 → 广西 → 4 家店`。
   四层目录需要该中间层，但名字写死在迁移里、非从数据推导，**属业务命名决定，不得代用户决定**。
   Preview 库已应用到 0010，直接改 0009 会令两边永久不一致；建议新增 0011 改名。
   补充事实：`0006` 迁移自身即 seed 了 `南区`/`广西`/那 4 家店，故 0009 的改名是当初有意为之。
2. **版本账本脱钩**：`version-manifest.json` 实为 **5.8.3**（先前记载「仍记 5.8.5」有误，
   `2e17802` 的 revert 已改回），故 `check:version` 不会拦。但生产工作流先跑 `version:preview`，
   `check:version` 走 standard 模式通过，结果部署后 Production 报 `appVersion 5.8.3` 而
   `gitSha` 跳到 `bfc5196`（领先 69 提交）。防这件事的 `--mode production` 分支未被工作流使用。

### 数据安全已实测（用户要求「生产库数据不得受影响、preview 种子不得带过去」）

- **种子隔离是结构性的**：Production `bike-ops-staging`（`91e78387-…`）与
  Preview `bike-ops-preview`（`e40af8eb-…`）为两个物理库；seed 步骤只在 Preview 工作流、
  命令硬编码指向 preview 库、且挂 `if: inputs.seed_preview_data`；生产工作流内无 seed 字样。
- **D1 export 失败**（`signed_url: null`），未取得生产转储；改用本地 SQLite 以**同一份迁移字节**
  重建同构库后应用 0008/0009/0010。实测：`tables DROPPED 0`、`columns DROPPED 0`、
  新增 7 条索引、行数仅 `subregions +1`、regions/cities/stores 的 id 与 name 全部 unchanged、
  `foreign_key_check` 0 违规、`integrity_check ok`、`pending_review` 全 0（无店翻成待审核）。
- **演练缺口如实记录**：`store_members`/`work_items`/`audit_events` 插入因 CHECK 约束失败而为空，
  「计数不变」对它们是平凡真。改用静态分析补足：**13 张表从未被三个迁移提及故不可能被修改**；
  12 条语句逐条分类 `DELETE` 0、`DROP` 0，唯二写数据者为 `INSERT INTO subregions` 与
  `UPDATE cities SET subregion_id`。
- **已排除最大风险**：被否决的 V5.8.4/V5.8.5 桌面工作台不会回归——两个 revert
  （`2e17802`、`01b3834`）均为集成头祖先，且三个桌面 CSS 与 Production 逐字节相同。

### 本轮教训：契约只验「写没写」，不验「是否胜出」

`.admin-directory-actions button` (0,1,1) 压过裸类 `.admin-directory-icon-action` (0,1,0)，
`padding: 0 12px` 得以保留 → `border-box` 下内容宽 2px → 撞 `svg { max-width: 100% }`
→ 17px 图标塌成 2×2。上一轮 `width: 44px` 时内容宽 18px ≥ 17px，靠余量侥幸成立。
45 条契约用子串匹配，`.admin-directory-icon-action {` 是复合选择器的子串，故换选择器后照样通过
——**这就是 CI 全绿仍把 bug 放到用户手机上的原因**。已把特异度锁进门禁并反向验证
（改回裸类 → `not ok 36`；恢复 → 45/45）。**后续在此文件写手机覆盖，必须先查块外是否有
同元素同属性的 (0,1,1) 及以上选择器。**

### 用户实机定标（后续手机端改动基准）

物理 1280×2772。自写 DC-only JPEG 解码器（沙箱无任何 JPEG 库，13920 MCU 全解，
160×348 亮度网格，±8 物理像素）。三锚点收敛：树行心距 144/44=3.273、
`.admin-header` 232/72=3.222、退出按钮 ~144–160/48。→ **CSS 视口 ≈ 390px、DPR ≈ 3.28**，
与参考稿同宽，**无需窄屏断点**。

## 当前状态加注（2026-08-11 22:5x +08:00 · 自助密码修改已部署 Preview 待验收）

**恢复入口**：`docs/progress/2026-08-11-self-service-password-change.md`。

- PR [#193](https://github.com/SAINTTaiYi/decathlon-bike-daily-phase1/pull/193) 已普通合并，merge commit / Preview source SHA `2cf33d9a087a0c40b817d56cd2b96e6cf3760895`；GitHub `merged=true` 与 `git fetch` 观察远端集成分支 `e608e17..2cf33d9` 双通道一致。认证竞态修复代码头为 `f7080f4a754f6da7c5ec97163b73a4747938d4f8`。
- 普通用户从日报菜单、CHU13 从平台管理后台头部均可打开同一密码修改对话框；首次登录强制改密页也复用校验和可安全重试的幂等键策略。
- 改密 API 使用严格共享契约、CSRF、带 Pepper 的 HMAC 请求证明与幂等缓存。记录不含密码明文或普通密码摘要；成功时清除失败计数/锁定、保留当前会话、撤销其它会话并写无敏感账号审计。
- 两设备并发改密时，旧密码哈希条件更新只允许一个成功；失败设备不会误撤销其它会话，并在前端清除失效会话、向登录页展示“使用新密码重新登录”的提示。后续审计又发现并修复“旧密码已验证的登录晚于改密落会话”的竞态：登录会话、失败计数与审计现在同样绑定刚验证的密码哈希，改密先完成时旧登录返回 401 且不留新会话。
- 用户原有未跟踪 `apps/worker/test/registration-e2e.test.ts` 被保留，未修改、未删除，且不纳入本次拟提交范围。
- 实测 Node 22：按 Git 已跟踪文件的 CI 等价五套件 `[7,15,262,21,67]`，共 372/372 通过；本机 `pnpm test` 额外加载未提交的 18 条注册 E2E，故为 `[7,15,262,21,85]`、390/390，不作为 CI 计数。代码头 CI run `31502463869` 与最终 docs-only run `31503086504` 均全绿；前者日志 ZIP 135,235 字节、魔数 `PK`、新竞态用例按名出现、失败 0。
- Preview deploy run `31503624851` success，`seed_preview_data=false` / seed skipped；D1 明确 `No migrations to apply!`，上传 278.92 KiB / gzip 62.20 KiB，Worker Version `7d3b4340-bf82-4aa9-af4a-e28845f7114e`。三轮绕缓存 Preview 均为 `5.9.2 / 2cf33d9a087a… / env=preview`；Production 三轮仍为 `5.9.2 / e608e17b79d… / env=staging`。
- CodeGraph 当前沙箱无有效入口，`code/*.json` 快照指向历史 SHA，已按调用链 `MenuDialog/PlatformAdminConsole -> App -> useAuth -> api/auth -> authRoutes -> users/auth_sessions/audit_events` 完成前后人工审计；CSS 的非索引例外已由前端契约、forced-colors 和 Web build 覆盖。
