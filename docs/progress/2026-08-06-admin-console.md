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
