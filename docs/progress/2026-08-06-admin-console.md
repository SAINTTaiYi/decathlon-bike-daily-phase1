# Workshop 平台管理后台（CHU13 Admin Console）

> 时间：2026-08-06 · 分支：`feat/admin-console`（基于 `feature/cloudflare-workers-d1`）
> 状态：已实现并通过本地门禁；等待 Preview 人工验收与用户发布决定
> 范围：仅新增管理后台表面与 3 个只读平台端点；未触碰 Production、Production D1、业务 API 契约与既有工作台

## 交付内容

### 入口与权限

- 平台管理员（CHU13）登录后在菜单新增「平台管理后台」入口；hash `#admin` 进入，`#admin/<section>` 深链分区。
- 渲染条件：`authenticated && hash 以 #admin 开头 && auth.user.isPlatformAdmin`。非平台管理员即使输入 hash 也回退到门店工作台。
- 管理台内「返回工作台」清除 hash 并回到门店业务界面；两套表面互不干扰。

### 五个分区（全部对接真实 D1 API）

1. **总览 OVERVIEW** — 生效门店/用户、区域/城市、待审批数（黄色强调）、今日工单（按 kind 汇总）、待办队列快捷入口、最近 8 条平台事件。
2. **审批 APPROVALS** — 角色提权 / 调店申请两个页签；每项展示申请人、门店、角色变化、理由、修订号、截止时间；批准（黄色主操作）/ 拒绝；决策复用既有 `decideRoleChangeRequest` / `decideTransferRequest`（带 `expectedRevision` 乐观锁）。
3. **目录 DIRECTORY** — 区域→城市→门店树（含停用项）；新增（区域/城市/门店）、内联重命名、启停；复用既有 `createDirectoryEntry` / `updateDirectoryEntry`；平台管理员不能停用自己所在目录路径（后端既有防护）。
4. **用户 USERS** — 全平台账号 + 生效成员关系（角色/门店），按姓名或登录名搜索；只读；绝不返回密码类字段。
5. **审计 AUDIT** — 全平台事件（只读），按业务日期与模块筛选，游标分页「加载更多」；复用既有历史筛选规则（日期格式、模块集合、limit 1–100、`createdAt|id` 游标）。

### 后端新增（只读、平台管理员专属）

`apps/worker/src/routes/admin.ts`，三个 GET 端点，均挂 `loadSession + requirePasswordChanged + requirePlatformAdmin`：

- `GET /api/v1/admin/overview` — 目录/账号/待审/当日工单统计 + 最近平台事件
- `GET /api/v1/admin/users?q=` — 用户 + 有效成员关系（上限 200）
- `GET /api/v1/admin/audit-events?date=&module=&cursor=&limit=` — 全平台审计（无门店过滤）

无任何 POST/PUT/PATCH/DELETE；不写库、不改迁移、不动既有 API 契约。

## 视觉与设计治理

- 唯一事实源仍为根目录 `DESIGN.md`；管理台为其受治理表面，并已在本改动中更新 DESIGN.md（新增「Platform Admin Console」章节）。
- 复用既有 token（`--ops-page / --ops-card / --ops-black / --ops-yellow / --ops-text-muted`），沿用桌面工作台几何（固定 90px 头部 + 262px 左侧栏，内容区独立滚动；<1024px 收为 84px 图标栏）。
- 信号黄仅用于：激活导航、待办徽标、批准主操作、强调 KPI；绿色/红色仅语义状态。
- 8px 圆角、44px 最小触摸目标、`:focus-visible` 黄色、`prefers-reduced-motion` 与 `forced-colors` 兜底；无渐变、无玻璃拟态、无装饰性彩色系统。
- 结构参考：官方 shadcn dashboard-01 block（信息架构：分组侧栏 → 页头 → KPI 卡 → 表格/队列）与 TanStack Table 的排序/筛选/分页心智；仅借鉴信息架构与节奏，全部以本项目品牌与代码约定重构，未照搬任何组件代码。

## 门禁与验证

- Web 契约测试：`tests/admin-console.test.mjs` 9 项（新增），全量 `node --test tests/*.test.mjs` **183/183 通过**（基线 174）。
- Worker：`apps/worker/test/admin-console.test.ts` 4 项（新增），全量 **34/34 通过**（基线 30）；`tsc --noEmit` 通过。
- 前端构建：`vite build` 成功；产物 `apps/web/dist/assets/index-BsgiMcMp.css`（301.26 kB）含全部 admin 类（admin-rail-item / admin-stat-value / admin-approval-row 等），JS `index-B3sM3Bit.js`（449.61 kB）。
- `git diff --check` 通过。
- 版本账本未改动（非正式发布）；`version-manifest.json` 保持现状，交由发布流程处理。

## Preview 部署（2026-08-06，用户已同意）

- PR #164（`feat/admin-console`，commit `8a49180`）经 `verify` + `secrets` CI 通过后普通 merge 进 `feature/cloudflare-workers-d1`：merge SHA `0a2f3859d30203fcd09c8d2cb383afdbfdcf1fd4`。
- Canonical `deploy-cloudflare-preview.yml`（workflow_dispatch，release_sha = `0a2f3859…`，三个 Free/无计费/Preview-only 确认均 true）：run `31033048347` 成功，全部 16 步通过（含 Preview D1 迁移与应用、部署、线上 API/版本身份/Web shell 校验）。
- Preview 地址：`https://bike-ops-preview.geeklightonefish.workers.dev`（环境 `preview`，平台 cloudflare-workers-d1）。
- 独立核验：3 轮一致 `/health/live`=200、`/health/ready`=200、`/api/v1/meta/version` = appVersion 5.8.5 + gitSha `0a2f3859…`；安全头（HSTS / frame-ancestors 'none' / DENY / nosniff / referrer / permissions）通过；`HEAD /`=200。
- 管理台守卫核验：未登录访问 `/api/v1/admin/{overview,users,audit-events}` 均返回 401 UNAUTHENTICATED。
- 产物核验：线上 JS bundle `index-B3sM3Bit.js` 与本地构建哈希一致，含「平台管理后台」、`#admin`、`/api/v1/admin/overview`。
- **待办**：用户需以真实 CHU13 登录态在 Preview 完成人工验收（菜单 → 平台管理后台，或直接 `#admin`）。Preview 通过不代表 Production 发布；正式发布仍需用户明确同意。

## 已知例外与未决项

1. **CodeGraph 前置/后置验证未在本环境执行**（沙箱无 CodeGraph）。新增 JS/TSX/TS 文件会被 CodeGraph 索引；按项目治理要求，合并前需在 Termux 本机执行前置 sync 与后置 sync，或在用户明确同意下记录豁免。
2. **Preview 部署未执行**：需用户同意后由 canonical `deploy-cloudflare-preview.yml` 在 PR 上运行；验收必须在真实 CHU13 登录态完成。
3. 用户管理当前为**只读**；账号禁用/改角色等写操作不在本版范围（既有 `POST /api/v1/users` 仅用于门店初始化）。
4. 平台审计为只读，不提供跨店撤销（与既有「跨日/跨店不可撤销」审计语义一致）。

## Preview 基线对齐 V5.8.3（2026-08-06 用户决定）

用户要求 Preview 与 Production 同为 V5.8.3 代码基线，但保留管理后台。实现方式（可审计、无强推）：

- 分支 `fix/preview-v583-with-admin`（基于 `feature/cloudflare-workers-d1` = `a52ec9d`）执行两次普通 `git revert -m 1`：
  - Revert PR #161（V5.8.5 响应式工作台，merge `d2c47c7`）
  - Revert PR #159（V5.8.4 桌面全视口适配，merge `6be00ee`）
- 结果核验：`git diff 3ec28a3 HEAD` 仅剩管理后台（5 个分区组件 + admin.ts + admin-console.css + App.jsx/MenuDialog/index.css 集成）+ 文档；`package.json` = 5.8.3（root + web）；`version-manifest.json` = 5.8.3（406 文件，V5.8.3 原戳）；`desktop-workbench.css` 与 V5.8.3 字节一致。**版本账本因此与 Production 对齐为 5.8.3，V5.8.4/V5.8.5 在 Git 历史中以 revert 记录留存，不重新部署。**
- 门禁：web 契约 **180/180**（V5.8.5 专属测试随回退移除，管理后台 9 项保留）、worker **34/34**、worker tsc、`vite build`（JS 449.54 kB / CSS 293.72 kB）、`git diff --check` 均通过。
- Preview 将在该基线（5.8.3 + 管理后台）重新部署并核验；Production 不受影响（已是 5.8.3）。

## 恢复入口

先读本文件 → `DESIGN.md`（Platform Admin Console 章节）→ `apps/worker/src/routes/admin.ts` → `apps/web/src/components/admin/PlatformAdminConsole.jsx` → 当前分支 git 状态。以精确代码/CI/Preview 证据为准。

### V5.8.3 基线重新部署核验（2026-08-06）

- PR #165 经 verify+secrets 通过后合并：merge SHA `bb41285b456f7e6a7e3f6a3ab1c5a4a02f2b6962`。
- Preview 工作流 run `31034132691` 成功；3 轮核验：live/ready 200、`/api/v1/meta/version` = **5.8.3** + gitSha `bb41285…` + `environment: preview`。
- admin 端点未登录均 401；线上 JS bundle `index-Dshle5pS.js` 与本地构建一致，含「平台管理后台」与 `#admin`。
- Production 复核不变：5.8.3 + `3ec28a3…`。V5.8.4/V5.8.5 代码不再出现在任何部署环境。

## v2 实施记录（2026-08-06，产品经理问答定稿）

需求经 6 轮问答确认（`plan/ADMIN-CONSOLE-IMPLEMENTATION-PLAN.md`），一次迭代完成：

- **移动端**：<768px 底部标签栏 6 项（admin-dock）+ 表格卡片化 + 审批快捷操作；768–1023px 图标栏；桌面不变。
- **门店分区**：列表（搜索）+ 详情（组织路径/成员/业务概览：今日工单/闭店状态/成员数）；目录树门店行「查看」跳转。
- **总览驾驶舱**：上排今日变化（新增门店/用户、角色/调店批准、今日工单），下排 7/30 天切换（新增门店/用户、各门店权限变更发起/批准/拒绝 Top8、变化流 10 条）；全部可点击跳转。
- **审批重构**：角色提权 / 调店申请 / 门店审核 三页签 × 待审批/已过期/已处理 三组；批量批准 + 全部批准；审批理由（拒绝必填）。
- **门店审核制**：迁移 0008 增 `pending_review` 列（父表 CHECK 无法安全重建：SQLite RENAME 会改写子表引用、D1 实测失败，故用轻量列 + 展示层派生 `pending` 状态；drill 验证 0 FK 违规）；新门店创建即待审核，审批队列批准后生效；目录开关对待审核门店禁用（409）。
- **用户写操作**：创建账号（含 manager/admin 直授，登录名规范化、密码 ≥10）、禁用/恢复（禁用即时撤销会话 + 确认弹窗）、重置密码（一次性临时密码 + 强制改密）；平台管理员受保护不可禁用。
- **审计**：门店 / 操作人 / 动作类型 / 日期 / 模块筛选。
- **跨界面提醒**：门店工作台头部与菜单显示待审批角标（`/api/v1/admin/pending-count` 60s 轮询，仅平台管理员）。
- 后端新增/扩展：overview（今日+周期+变化流）、stores/:id、approvals、pending-count、users storeId 过滤、audit 三筛选、用户三写端点、门店审核端点；governance 门店创建强制 pending + pending 开关防护。

门禁：web 契约 **183/183**（管理后台 12 项）、worker **42/42**（新增 8 项）、worker tsc、vite build（JS 473.38 kB / CSS 307.40 kB）、`git diff --check`。CodeGraph 前后置仍待 Termux 或豁免；Preview 部署与验收待用户同意后进行。
### v2 Preview 部署核验（2026-08-06）

- PR #166（v2 主体，merge `7159b8f`）首次 Preview 部署失败：D1 迁移 0008 报 `FOREIGN KEY constraint failed`（父表重建限制）。修复为 pending_review 列方案（PR #167，merge `c3770d17`）。
- Preview 工作流 run `31038918633` 成功（含迁移 0008 在 Preview D1 应用）；3 轮核验：live/ready 200、`/api/v1/meta/version` = **5.8.3** + gitSha `c3770d17…` + `environment: preview`。
- admin 端点未登录均 401（overview/users/stores/:id/approvals/pending-count）；线上 JS bundle `index-CIrF9bu5.js` 与本地构建一致，含 admin-dock / 批量批准 / 门店审核 / 创建账号 / 重置密码 / pending-count 等 v2 标记。
- Production 复核不变：5.8.3 + `3ec28a3…`。待用户在真实 CHU13 登录态验收。

### 验收种子数据（2026-08-06）

- 用户要求生成假数据便于验收。新增 `scripts/ops/seed-preview-admin.mjs`（确定性、幂等、FK 完整、日期相对运行日），经 deploy-cloudflare-preview.yml 可选输入 `seed_preview_data=true` 注入 Preview D1（仅 Preview；Production 不受影响）。
- 数据：2 区域 / 4 城市 / 8 门店（5 生效 + 1 停用 + 2 待审核）、15 用户 + 成员、16 工单（跨类型/日期）、角色申请 3 待审 / 1 过期 / 2 已处理、调店申请 2 待审 / 1 过期 / 1 已处理、今日闭店 2 家、13 条平台审计事件；今日/7 天/30 天统计均有值（隔离 drill：0 FK 违规）。
- 顺带修复真实 bug：admin 总览与门店详情的「今日工单」用了不存在的 `work_items.business_date` 列（登录后必 500）→ 改为 `created_at` 业务日窗口（PR #168，merge `6bb55d1`）。
- 部署+seed：run `31040707148` 成功（merge `6bb55d1` + workflow 修复 `c566bec`，boolean 输入直判）；wrangler rows_written 348、22 表；健康检查通过；Preview = 5.8.3 + `c566bec…`。admin 端点未登录均 401。

### 验收反馈修复（2026-08-06）

用户反馈：页面无法滑动、总览/门店/门店目录无数据。**根因**：`GET /api/v1/admin/overview` 的 7d/30d 权限变更统计 SQL 声明 5 个占位符但只绑定 4 个值 → D1 参数数量不匹配 → overview 500；外壳用 `Promise.all([overview, governance])` 加载，任一失败则两数据源全丢 → 总览/门店/目录全空（审批/审计走独立端点不受影响），空内容也加剧无法滚动观感。

修复（PR #169，merge `cafb943`）：
1. `roleStats7d/30d` 补第 5 个绑定值
2. 新增回归契约测试：扫描 admin.ts 全部静态 `prepare().bind()`，断言占位符数 === 绑定数（防同类 500）
3. `.admin-console` 加 `overflow: hidden`，滚动收敛至 `.admin-region`

Preview 重新部署 run `31041554495` 成功（工作流自检 attempt 2 命中）；线上 meta = 5.8.3 + `cafb943…` + preview。数据无需重新 seed。

### 移动端滚动修复（2026-08-06）

用户复测：移动端仍滑不动。**根因**：<768px 媒体查询把 `.admin-body` 设为 `display:block`，`.admin-region` 高度跟随内容、`overflow-y:auto` 永不生效；`.admin-console`（fixed 全屏 + overflow:hidden）直接裁剪超出内容——无可滚动容器。

修复（PR #170，merge `485a749`）：移动端 `.admin-body` → `flex column + min-height:0`；`.admin-region` → `flex:1 1 auto + min-height:0 + overflow-y:auto`（含 `-webkit-overflow-scrolling:touch`）；新增契约测试断言移动端滚动结构。线上压缩 CSS 复核通过（flex column / region overflow / 无 display:block）。Preview run `31042452176` 成功，meta = 5.8.3 + `485a749`。

### 审批卡片窄屏竖排修复（2026-08-06）

用户截图反馈：审批卡片申请理由竖着一长串。**根因**：<1024px 审批卡片为 2 列 grid（24px 勾选 + 1fr），4 个子元素中「详情」被自动放进 24px 第一列 → 中文逐字换行竖排。修复（PR #171，merge `17fb241`）：身份/详情/操作显式 `grid-column: 2` + `min-width: 0`；契约测试新增。Preview run 成功，meta = 5.8.3 + `17fb241`。

### 全面审阅整改（2026-08-06）

按后台全面审阅报告一次性整改 P1/P2/P3 与测试缺口，且保持 Preview D1 数据与验收种子原样：

- 后端：平台统计口径互斥、过期申请不进入待办角标、审批/用户/审计使用稳定实体级游标与 `limit+1`；账号和门店写操作接入共享严格契约、幂等、`updatedAt` 乐观锁，平台管理员禁用/普通重置受保护；禁用与重置仅在主更新成功后撤销会话；密码重置审计/幂等缓存不保存临时密码。
- 前端：修复“全部批准”异步旧 state、目录重命名误触与失败清空、移动端审计摘要隐藏、用户/审计真实卡片、请求竞态与旧响应覆盖；统一 AppDialog 焦点恢复/唯一 ARIA ID/不可误关的一次性密码流程；写操作明确忙态、错误与确认。
- 数据加载：总览与治理目录改为独立容错，单一端点失败不再让所有管理分区同时空白；门店详情切换先清旧数据并中止旧请求。
- 测试治理：恢复既有入口/权限/端点/迁移/移动端全部主题，在此基础上叠加批量目标、去重分页、请求闸门、乐观锁、敏感凭据、卡片化和可访问性回归；不以删测试换绿灯。
- CodeGraph：恢复时改动已存在，前置仅能如实记为“晚到恢复门禁”；后续修改前后持续 sync，CSS/Markdown 为明确非索引例外，由契约测试、构建与线上资产核验补偿。

### 全面整改 Preview 交付（2026-08-06）

- 实现 PR #172 的 `verify` / `secrets` 成功后普通合并，实际 Preview 身份 `db3ec5c80ae040ce753cebcd7659dc9daf391d26`。
- Canonical `deploy-cloudflare-preview.yml` run `31049667663` 成功；seed 步骤明确 skipped，保留既有 Preview D1 全部数据与验收种子，未清空、重播种、恢复或变更 migration 文件。
- 三轮 live/ready/meta 绕缓存核验均为 V5.8.3 + 精确 SHA；未登录后台端点均为 JSON 401；HTTP 308、关键安全头和线上 bundle 标记通过。线上 JS SHA-256：`85c796542958babd7aa44c7967e142329c4b3bd9dd3a8d379b5cfa7052c80615`。
- Production 独立复核仍为 V5.8.3 + `3ec28a321…`，未部署、未触碰 Production D1。
- 详细证据：`plan/ADMIN-CONSOLE-COMPREHENSIVE-REMEDIATION-EVIDENCE.md`。等待用户真实 CHU13 登录态验收；不得隐式 Production。

### 总览「变化流 / 最近平台事件」可读性重构（2026-08-06）

用户反馈：总览的变化流与最近平台事件读不清。**根因三条**（均为布局与信息结构问题，不是字号问题）：

1. `.admin-card-wide` 在 #172 重构中失去全部 CSS 规则，退化为死类；三张卡被 `.admin-overview-grid: 1fr 1fr 1.6fr` 挤在同一行，变化流标题列实际仅约 140px，审计摘要列约 280px。
2. 两处列表行都是单行 `white-space: nowrap` + `text-overflow: ellipsis`，中文摘要在上述宽度下几乎必被截断。
3. 行高、行分隔与时间锚点缺失：13px 无 `line-height`，行与行之间无分隔线，时间只有 `08-06 09:10` 形态，无「今天 / 昨天」相对锚点。

修复（改动仅 3 文件，+151/-40）：

- 栅格改为两行：统计卡与变化流并排 `minmax(0,1fr) minmax(0,1.15fr)`，并恢复 `.admin-card-wide { grid-column: 1 / -1 }`，让事件条独占整行，摘要可用宽度由约 280px 提升至约 1140px。
- 行结构由「单行截断」改为两行阅读结构：摘要 14px / `line-height: 1.5` / `overflow-wrap: anywhere` 可换行；元信息降为 12px 第二行，承载标签、时间、门店与操作人。
- 新增 `formatStamp()`：近三天返回今天 / 昨天 / 前天，更早回落 `MM/DD`，并把完整年月日时分挂在 `title` 上供悬浮读取；时间统一 `font-variant-numeric: tabular-nums`。
- `.admin-module-tag[data-tone='success' | 'accent']` 语义色：角色批准为成功绿，调店批准为信号黄低饱和，新增类保持中性。
- 行间 1px `--ops-line` 分隔、`min-height: 44px` 触摸目标；变化流保留 hover 与 `:focus-visible` 焦点环。
- 审计行补上后端已返回但界面未使用的 `storeName` 与 `actorNameSnapshot`；操作人用 `border-left` 分隔而非 `::before` 伪元素文本，避免读屏念出装饰字符。
- 顺带修复死链：变化流中新增门店原先 `onJump('stores')`，该分区已在 #174 合并进目录，改为 `'directory'`。

自动化门禁：

- `pnpm test:web`：**198 / 198 通过**，含新增可读性契约测试（钉住宽卡跨列、两行结构、语义 tone、无 `nowrap` 截断，防止后续重构再退化）。
- Worker **50 / 50**、domain **7**、database **10**、API **21** 全部通过。
- `pnpm typecheck`（含 worker）通过；`pnpm check:workflows` 88 条策略通过；`git diff --check` 干净；`vite build` 成功。
- 额外用 `react-dom/server` 对这两块做真实 SSR 渲染，逐行核对输出 HTML 结构与相对日锚点，而非仅依赖正则断言。

环境备忘：`pull` 之后 `packages/contracts/dist` 为旧产物、缺 `adminCreateUserSchema` 等导出，会让 worker 测试假失败 1 项；须先 `pnpm --filter @bike-ops/contracts build` 再跑 worker 测试。SSR 冒烟入口须放在 `apps/web/`（`react-dom` 在 `apps/web/node_modules`，不在仓库根）。

CodeGraph 前后置本轮记为豁免：CodeGraph 装在 Termux 本机，不在本轮使用的 workspace 沙箱内；CSS 与 Markdown 本身即非索引例外，由契约测试、SSR 渲染核对、构建与线上资产核验补偿。

### 目录与用户可读性重构（2026-08-07）

用户反馈：目录与用户两个界面阅读性差。**根因（按实际宽度算过，不是主观判断）**：

- **目录**：`.admin-directory-major-grid` 固定 `repeat(5, minmax(0,1fr))`，1180px 面板下每列仅 **226px**；大区头部是 `minmax(0,1fr) auto auto` 三列，状态标签加两个按钮吃掉 **199px**，标题列只剩 **1.4px** → 22px 中文大区名逐字竖排。更严重的是展开态仍被关在这条窄列里：门店行嵌在大区→小区→城市三层 padding 内，可用宽 **148px**，而它自身 min-content 需求 **504px** → **溢出 3.4 倍**。这是"目录不可读"的真正来源。
- **用户**：「角色」「门店」各自成列并用顿号拼接，多门店用户必须人工按位置对应两列；`.admin-table td` 无 `line-height`；最近登录只有 `2026/08/06` 无日锚点。

修复：

- 目录折叠态改 `repeat(auto-fill, minmax(260px, 1fr))`（1180px 下约 4 列，每列 ~277px）；头部改 flex 换行，标题独占首行，状态与操作收进新增 `.admin-directory-module-meta` 降到第二行。
- 展开态 `.admin-directory-major-grid > .admin-directory-module[data-expanded='true'] { grid-column: 1 / -1 }` 独占整行，门店行可用宽从 148px 变为约 **1078px**，四列（识别 / 状态 / 成员数 / 操作）全部落位；门店行提到 14px 并加 hover，成员姓名提到 14px。
- 用户表把两列合并为「门店与角色」配对列，每条成员一行 `CHU13 上海中山公园店 · 经理`，表格从 7 列降到 6 列；`.admin-table td` 补 `line-height: 1.5`；最近登录改日锚点（今天 / 昨天 / 前天 / MM-DD，跨年回落完整年月日），完整日期进 `title`，未登录显示"从未登录"而非长横线。
- 时间格式化抽出 `apps/web/src/components/admin/admin-format.js` 供总览与用户共用，并补跨年处理。

**SSR 暴露的两个真实缺陷（顺带修复）**：

1. `module()` 返回的根 `div` 缺 `key`（PR #174 遗留）。React 报 unique key 警告；目录重命名或刷新后子节点重排会导致展开态与重命名输入框错位。已补 `key={item.id}`，HTML 输出不变（key 只影响 reconcile，已用渲染哈希 `9bd0d8db73d74115` 前后一致证实）。
2. 门店行 `.admin-directory-actions` 实际嵌套两层（外层含「查看」，内层含「重命名/停用」），≤1023px 的 `>` 直接子选择器只命中「查看」，另两个按钮不参与等分。已改为后代选择器 `.admin-directory-store-row .admin-directory-actions>*`。

验证：web 200/200、worker 50/50、domain 7、database 10、api 21、typecheck（含 worker）、workflow policy 88、`git diff --check` 干净、vite build 成功。

**总览逐字节回归**：因为把 `formatStamp` 搬到共享模块，用 esbuild + `react-dom/server` 在固定时间下分别渲染「已验收版本」与「共享模块版本」，两份 HTML SHA-256 同为 `de272f935e4a37a7480723d099f3c67f3209baaeaeb341dcd0eac8662912c1eb`，**5454 B 逐字节一致**，确认上一轮已验收的总览渲染未被改动。

目录与用户两块也做了真实 SSR 渲染核对（目录用预设展开态副本渲染出四级层级与门店行；用户导出展示组件后用 fixture 渲染配对列与日锚点各分支）。注意沙箱时区为 UTC，日锚点须在 `TZ=Asia/Shanghai` 下核验，否则会看到"昨天"被算成"今天"的环境假象。

CodeGraph 前后置本轮仍记豁免（CodeGraph 在 Termux 本机，不在本轮 workspace 沙箱）。

### 全栈优化补齐（2026-08-07）

在 GitHub Actions 故障期间进行的本地优化。**硬约束：不得改变非后台页面排版**，下文每项都附了守住这条线的验证方式。

先做了一轮全栈审计，结论是项目基础比预期扎实：CSP 与安全响应头齐全（HSTS、nosniff、frame-options、Referrer/Permissions-Policy，HTML 与 API 分别用不同 CSP）、`AppErrorBoundary` 已挂载、写操作已有乐观锁 + 幂等键 + 请求闸门、1 MiB 请求体上限已生效。因此没有做无意义的"全面改造"，只补了四处真实缺口。

**1. 目录写操作静默失败（用户可感知的缺陷）**

`AdminDirectorySection` 有 4 处 `catch {}`：新增目录、重命名、停用/启用、成员更新与移除。失败后 `busy` 被 `finally` 清掉、按钮恢复可点，但界面无任何提示——用户点了没反应，会以为是自己操作错了。对比同层的用户分区，它有完整的 `setError` + `form-error` 反馈。

改为 `catch (error) { setWriteError(...) }`，面板顶部渲染 `role="alert"` 错误条（读屏立即播报），进入写操作时先清空上次错误。错误文案优先用后端返回的 message，缺失时回落到按操作类型区分的中文兜底。

**2. D1 查询索引（先实测再落地，删掉了自己写的无效索引）**

新增 `migrations/d1/0010_admin_console_query_indexes.sql`，纯追加、`IF NOT EXISTS` 幂等、无任何 DROP/ALTER/DELETE/UPDATE/INSERT。

最初写了 7 条索引，用 `node:sqlite` 跑完整 10 个迁移后逐条 `EXPLAIN QUERY PLAN` 验证，**删掉 3 条实测无效的**：

- `role_change_requests(created_at DESC, id DESC)` 与 store_transfer 同构版本：本想消除审批 `decided` 分组的 TEMP B-TREE。实测无效——该查询 `status IN ('approved','rejected','cancelled')` 跨三值排序，SQLite 必然先探 status 索引再排序，加不加都走 TEMP B-TREE。对照试验三种索引组合，结果一致。该排序受 `LIMIT 21` 约束，代价可接受，故放弃。
- `store_members(user_id, store_id, role)`：与既有 `store_members_one_active_user_idx(user_id)` 唯一分区索引重复，planner 选的是后者。

保留的 4 条全部经 EXPLAIN 确认被选中：`role_change_requests_status_decided_idx`、`store_transfer_requests_status_decided_idx`（均为 COVERING INDEX，`decided_at` 此前完全无索引，总览每次加载全表扫两张申请表）、`role_change_requests_store_created_idx`、`users_created_id_idx`（COVERING 走序，消除了用户列表分页的排序）。已同步 `apps/worker/security/d1-test-adapter.ts` 的迁移清单。

**3. 后台按需分包**

后台约 2500 行组件 + 2026 行 CSS 此前全打进主 bundle，门店用户从不访问却要下载。改为 `lazy(() => import(...))` + `Suspense`，并把 `admin-console.css` 从全局 `index.css` 移到后台入口内引入，使组件与样式落在同一异步边界。

门店用户首屏：JS 480 → 429.1 kB，CSS 306 → 280.3 kB，共减 76.6 kB；gzip 传输 234.4 → 218.0 kB（减 16.4 kB / 7.0%）。后台按需加载 JS 47.15 + CSS 33.63 kB（gzip 18.9 kB）。

**分包前必须先排掉的隐患**：扫描 `admin-console.css` 的 280 条选择器，发现恰好 2 条不属于 admin 作用域——`.workshop-pending-badge`（宿主是 `WorkshopShellHeader`，门店工作台头部）与 `.dialog-action-badge`（宿主是 `MenuDialog`，菜单弹窗）。两者都是**非后台页面**，若随后台分包延迟加载，平台管理员在工作台和菜单里会看到无样式角标。已先将这 2 条规则搬进常驻 `components.css`，`admin-console.css` 随后达到 100% admin 作用域锚定才执行分包。`Suspense` 占位所用的 `.admin-console-loading` 同理放在常驻样式。

**守住红线的验证**：从 `HEAD` 取改动前的样式源，按 `index.css` 的 `@import` 顺序在内存中复原"基线全局 CSS"，与当前全局 CSS 做规则级比对（`@media`/`@supports` 块按块内选择器是否全为 admin 判定，避免误判）。结果：基线 1478 条规则中 270 条为纯 admin 作用域；**基线非 admin 规则在当前缺失 0 条**；移出全局的 270 条**全部**落在后台分包样式表中，无一丢失；全局仅新增 1 条 `.admin-console-loading`。另对构建产物断言：非后台角标与占位样式在主 CSS 中存在，后台专属类名在主 CSS 中为 0、在后台 CSS 中存在，后台组件标识不出现在主 JS。

**4. 契约测试**

新增 3 项并修正 3 项旧断言（旧断言的**意图**仍有效，只是实现形态改变，故改为等价断言而非删除）：入口断言从静态 import 改为 lazy 动态 import；角标样式断言从后台样式表改为常驻 `components.css`；后台样式注册点断言从全局 `index.css` 改为后台入口。新增测试锁住：4 处 `catch {}` 不得回归、错误条带 `role="alert"`、后台样式表必须 100% admin 作用域锚定（含一条动态扫描断言，任何新增的非 admin 选择器都会失败）、迁移只含 EXPLAIN 确认生效的索引且不含已验证无效的那 3 条。

门禁：web **203/203**、worker 50/50、domain 7、database 10、api 21、typecheck（含 worker）、workflow policy 88、`git diff --check` 干净、构建通过。

**未交付**：GitHub Actions 自 2026-08-06 15:22 UTC 起 major_outage，PR CI 与 Preview 部署工作流均跑在 `ubuntu-latest`，无法获取 runner。本轮改动与 PR #177（目录/用户可读性）同样处于"已完成、待 Actions 恢复后交付 Preview"状态。Production 保持 V5.8.3 / `3ec28a32…` 未触碰。CodeGraph 前后置仍记豁免（不在当前 workspace 沙箱）。

### 审批分区可读性重构（2026-08-07）

五个分区中最后一个未做可读性处理的。**先算过宽度再动手**：审批行 1144px 内容宽下身份列约 365px，调店去向串「CHU07 南京新城科技园店 → CHU13 上海中山公园店」按中文 13px 估算约 300px——宽度本身够用，所以这里的问题不是挤压，而是别的四处：

1. **身份列单行截断**。`.admin-approval-identity span` 是 `white-space: nowrap` + `text-overflow: ellipsis`。宽度虽勉强够，但门店名一旦更长（或窄屏、大字号），调店去向就会被截成「CHU07 南京新城科技…」，看不出要调到哪。改为 `overflow-wrap: anywhere` 可换行，并把去向拆成 `move-from / arrow / move-to` 三段独立元素，目标店加重，窄屏自然换行而不是截断。
2. **元信息挤成一条「·」串**。原本是 `08-06 21:00 · 修订 2 · 截止 08-09 03:00 · 审批意见…` 全部拼在一个 `<small>` 里。改为 `ApprovalMeta` 组件输出「标签 + 值」分项（提交 / 修订 / 截止），审批意见单独成段并用左边框区隔。
3. **截止时间看不出紧迫度**——这是功能性缺陷，不只是排版。审批申请会过期（后端按 `expires_at` 判定并单列"已过期"分组），但界面只显示绝对时间「截止 08-09 03:00」，读者得自己算还剩多久，快到期的容易漏批。新增 `formatDeadline()` 输出剩余量与 tone：<1h 显示「剩 40 分钟」、<24h「剩 18 小时」、≤2 天「剩 2 天」、更远「剩 5 天」、已过则「已过期」；`urgent`/`expired` 用 `--ops-danger` 红色加粗，`soon` 用琥珀，完整时间仍在 `title`。
4. **时间格式与其余分区不一致**，且角色/调店申请的终态没有状态标签（只有门店审核有）。改为复用 `admin-format.js` 的 `formatStamp`（删掉本地 `formatTime`），并为 approved/rejected/cancelled 补 `admin-status-tag`。

另把审批行从 `align-items: center` 改为 `start`：长理由会把详情列拉高，居中会让身份列文字视觉下沉错位。

**SSR 验证**：导出 `ApprovalMeta` 后用 6 组固定时间 fixture 在 `TZ=Asia/Shanghai` 下真实渲染，逐一核对 tone 与文案——40 分钟/18 小时 → `urgent`，2 天 → `soon`，5 天 → `normal`，过期 → `expired`，门店审核无 `expiresAt` 时整个截止项不渲染；日锚点输出今天/昨天/前天/日期均正确。渲染无 React 警告。（首次尝试整行渲染得到 0 行，因为列表数据在 `useEffect` 里异步加载而 `renderToStaticMarkup` 只渲染首帧，故改为直接渲染展示单元。）

**非后台红线复查**：后台样式表仍为 100% admin 作用域锚定（0 条泄漏）。构建产物中主 CSS 仍是 280.33 kB、主 JS 429.05 kB，与上一轮**完全一致**；新增审批样式全部落在后台 chunk（33.63 → 35.12 kB），非后台页面零影响。

门禁：web **204/204**、worker 50/50、domain 7、database 10、api 21、typecheck、workflow policy 88、`git diff --check` 干净、构建通过。

至此五个分区（总览 / 目录 / 用户 / 审批 / 审计）可读性全部处理完毕；审计分区在 #172 已具备桌面表格与移动卡片双形态，本轮核对后无需再改。
