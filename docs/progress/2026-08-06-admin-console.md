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

## 已知例外与未决项

1. **CodeGraph 前置/后置验证未在本环境执行**（沙箱无 CodeGraph）。新增 JS/TSX/TS 文件会被 CodeGraph 索引；按项目治理要求，合并前需在 Termux 本机执行前置 sync 与后置 sync，或在用户明确同意下记录豁免。
2. **Preview 部署未执行**：需用户同意后由 canonical `deploy-cloudflare-preview.yml` 在 PR 上运行；验收必须在真实 CHU13 登录态完成。
3. 用户管理当前为**只读**；账号禁用/改角色等写操作不在本版范围（既有 `POST /api/v1/users` 仅用于门店初始化）。
4. 平台审计为只读，不提供跨店撤销（与既有「跨日/跨店不可撤销」审计语义一致）。

## 恢复入口

先读本文件 → `DESIGN.md`（Platform Admin Console 章节）→ `apps/worker/src/routes/admin.ts` → `apps/web/src/components/admin/PlatformAdminConsole.jsx` → 当前分支 git 状态。以精确代码/CI/Preview 证据为准。
