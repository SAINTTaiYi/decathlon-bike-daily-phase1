# CHU13 平台管理后台 · 实施计划（可落地方案 v2）

> 状态：需求已全部确认（6 轮产品问答），待用户批准后实施
> 日期：2026-08-06 · 基线：V5.8.3 + 管理后台 v1（已部署 Preview）
> 目标：一次迭代完成「移动端适配 + 门店管理 + 总览驾驶舱 + 用户写操作 + 门店审核制 + 批量审批」，一次 Preview 验收

## 1. 背景

管理后台 v1（`#admin`，5 分区，只读）已部署 Preview。v2 按产品经理视角补齐：移动端正式适配（项目移动优先）、门店生命周期管理（含**新门店审核制**）、平台总览驾驶舱（今日 + 周期双视角）、用户写操作、批量审批、跨界面待办提醒。桌面布局（262px 栏 / 90px 头）保持不变。

## 2. 已确认需求清单（6 轮问答汇总）

### 基础（v1 已确认，v2 沿用）
| # | 需求 | 决策 |
| --- | --- | --- |
| R1 | 移动端 | 两端正式适配；<768px 固定底部标签栏；数据表折叠为卡片列表 |
| R2 | 门店管理 | 查看 + 管理目标门店成员与组织架构 |
| R3 | 门店管理入口 | 目录树点击门店跳转详情 + 独立「门店」分区（列表/搜索/详情） |
| R4 | 门店详情 | 成员 + 组织架构路径 + 状态 + 业务概览（今日工单/闭店状态/成员数） |
| R5 | 成员角色调整 | 走审批流（管理员发起 → CHU13 批准），不做直改 |
| R6 | 总览 | 已注册门店数、新增门店数、用户数、待审批数、各门店权限变更次数 |
| R7 | 权限变更口径 | 区分发起 / 批准 / 拒绝三组数字 |
| R8 | 统计周期 | 固定 7 天 / 30 天切换 |
| R9 | 变化流 | 最近 10 条核心变化（新增门店/新用户/角色批准/调店批准），可点击跳转 |
| R10 | 总览交互 | 统计项与变化流均可点击跳转对应分区 |
| R11-R13 | 用户写操作 | 创建 + 禁用/恢复 + 重置密码（一次性临时密码、强制改密） |
| R14 | 审计 | 按门店筛选 |
| R15 | 审批理由 | 审批时可填理由（拒绝建议必填、批准可选） |
| R16 | 权限边界 | 仅 CHU13；`requirePlatformAdmin` 守卫 |
| R17 | 导出 | 本期不做 |
| R18 | 提醒 | 待审批角标 |
| R19 | 节奏 | 一轮做完，一次 Preview 验收 |
| R20 | 桌面 | 当前布局不动 |

### v2 新增确认（第 5、6 轮）
| # | 需求 | 决策 |
| --- | --- | --- |
| R21 | **门店审核制** | 新门店先建为「待审核」（pending），CHU13 批准后才生效（active）；需新增状态 + 审核队列 + **迁移 0008** |
| R22 | **批量审批** | 每周几十量级：批量批准 + 全部批准（角色提权 / 调店 / 门店审核三队列通用） |
| R23 | **过期分组** | 审批列表分「待审批 / 已过期 / 已处理」三组，可筛选 |
| R24 | **创建角色** | 允许直接创建 operator / manager / admin（信任 CHU13，不走审批流） |
| R25 | **一账号一门店** | 创建时选择单个门店；多门店成员关系本期只读展示 |
| R26 | **总览布局** | 上排「今日变化」，下排 7/30 天统计（切换） |
| R27 | **审计筛选** | 按门店 + 按操作人 + 按动作类型 |
| R28 | **禁用即时生效** | 禁用后已登录会话即刻失效（踢下线），需确认弹窗；恢复后重新登录 |
| R29 | **移动端三任务** | 快速审批 / 门店查看 / 总览数字，三者都做扎实 |
| R30 | **跨界面提醒** | 门店工作台（非管理后台）菜单/头部也显示待审批角标 |
| R31 | **审批历史** | 审批分区展示完整历史（已处理可查，与 R23 合并为三组视图） |

## 3. 信息架构（v2）

### 分区（6 个）

总览 · 门店 · 审批 · 目录 · 用户 · 审计

- **总览**：上排今日变化（今日新增门店/用户、今日角色批准/调店批准、今日工单、待办数）；下排 7/30 天统计（新增门店/用户、权限变更三组数字 Top 8 门店、变化流 10 条）；全部可点击跳转。
- **门店**（新分区）：列表（代码/名称搜索）→ 详情面板（组织路径 + 状态 + 业务概览 + 成员列表）。
- **审批**：三个页签「角色提权 / 调店申请 / 门店审核」；每个页签内三组「待审批 / 已过期 / 已处理」；支持勾选批量批准、全部批准；批准/拒绝可填理由。
- **目录**：区域→城市→门店树；门店新增后为「待审核」态（黄标）；门店行「查看」跳转门店详情。
- **用户**：列表 + 搜索 + 创建账号（含角色选择）+ 禁用/恢复（确认弹窗）+ 重置密码（一次性临时密码）。
- **审计**：筛选 = 日期 + 门店 + 模块 + 操作人 + 动作类型；游标分页；只读。

### 路由

- `#admin` 总览；`#admin/stores`（列表）、`#admin/stores/:storeId`（详情）；`#admin/approvals`（tab 参数可深链）；`#admin/directory`、`#admin/users`、`#admin/audit`。

## 4. 移动端规范（R1 / R29）

- **<768px**：固定底部标签栏 6 项（总览/门店/审批/目录/用户/审计，44px+ 目标，含待审批角标）；头部仅品牌 + 返回工作台。
- **卡片化**：用户卡、审计卡、门店卡（见 v1 方案 §4）；审批行 = 快速批准/拒绝大按钮（拇指友好），支持滑动列表连续处理。
- 移动端三任务优先级：审批动作触手可及、门店信息可扫读、总览数字可盯盘。
- 与桌面共享组件树，仅 CSS 断点切换。

## 5. 后端端点规格

全部位于 `apps/worker/src/routes/admin.ts`（写操作在服务层复用现有哈希/审计工具）。守卫：`loadSession + requirePasswordChanged`；写操作 + `requireCsrf`；全部 `requirePlatformAdmin`。

### 5.1 只读

| 端点 | 变更 | 要点 |
| --- | --- | --- |
| `GET /api/v1/admin/overview` | 扩展 | 保留 v1 字段；新增：`today`（今日新增门店/用户、今日角色批准/调店批准、今日工单 by kind）、`newStores7d/30d`、`newUsers7d/30d`、`roleChangesByStore`（7d/30d，initiated/approved/rejected 三组，Top 8）、`recentChanges`（10 条：新增门店/新用户/角色批准/调店批准，含门店/时间/类型/id 便于跳转）、`pending.stores`（待审核门店数） |
| `GET /api/v1/admin/users` | 扩展 | 新增 `?storeId=` 过滤；保留 `?q=` 与 200 上限 |
| `GET /api/v1/admin/audit-events` | 扩展 | 新增 `?storeId=`、`?actor=`（actor_name_snapshot 子串）、`?action=`（action 子串）；日期/模块/游标不变 |
| `GET /api/v1/admin/stores/:storeId` | 新增 | 门店信息（code/name/status/timezone/created_at）+ 组织路径 + 成员列表（角色/状态/最近登录）+ 业务概览（今日工单 by kind、今日闭店状态、成员数）；不存在/已删 → 404 |
| `GET /api/v1/admin/approvals` | 新增 | `?type=role\|transfer&group=pending\|expired\|decided&cursor=&limit=`；pending/expired 取 `status='pending'` 且按 `expires_at` 是否过期分组；decided 取 approved/rejected/cancelled 分页；返回与 governance overview 同构的字段（含门店/用户/理由/修订/时间） |
| `GET /api/v1/admin/pending-count` | 新增 | 轻量：`{ roleRequests, transferRequests, storesPending }`（供门店工作台角标轮询，默认 60s） |

### 5.2 写操作（受审计）

| 端点 | 语义 | 审计动作 |
| --- | --- | --- |
| `POST /api/v1/admin/users` | 创建：`{ username, displayName, storeId, role, password }`；登录名小写规范化、密码 ≥10；写入 users + store_members（role 可 operator/manager/admin）；重复登录名 → 409 | `admin-create-user` |
| `PATCH /api/v1/admin/users/:id` | 禁用/恢复：`{ status }`；**禁用时同时撤销该用户全部会话（立即踢下线）**；平台管理员自身不可禁用 | `admin-toggle-user` |
| `POST /api/v1/admin/users/:id/reset-password` | 12 位安全随机临时密码 → 哈希写入 + `must_change_password=1`；仅响应返回一次；日志不落密码 | `admin-reset-password` |
| `POST /api/v1/admin/stores/:id/decision` | 门店审核：`{ approve, reason? }`；approve → `pending→active`；reject → `pending→disabled`（含 reason 审计） | `admin-review-store` |

批量/全部批准：前端按所选列表**顺序调用既有决策端点**（`decideRoleChangeRequest` / `decideTransferRequest` / `stores/:id/decision`），每个请求独立幂等键与 `expectedRevision`；reason 用「CHU13 批量批准」；失败项单独提示可重试。不新增批量端点（每周几十量级，保持 API 面最小）。

### 5.3 决策 API（无后端改动）

审批理由复用既有 `reason` 字段（前端输入：批准可选 / 拒绝必填，带 `expectedRevision` 乐观锁）。

### 5.4 迁移 0008（门店待审核状态）

`stores.status` CHECK 从 `('active','disabled')` 扩为 `('active','pending','disabled')`。SQLite 需重建表（沿用 0006 对 store_members 的 RENAME→CREATE→INSERT→DROP 模式）：

1. `ALTER TABLE stores RENAME TO stores_legacy`
2. `CREATE TABLE stores (id, code UNIQUE, name, timezone, status CHECK(…'pending'…), created_at, updated_at, city_id REFERENCES cities(id) ON DELETE RESTRICT)`
3. `INSERT INTO stores SELECT … FROM stores_legacy`
4. `DROP TABLE stores_legacy`
5. 重建 `stores_city_active_idx`

风险控制：迁移后跑隔离 SQLite drill 验证完整性（0 FK 违规、行数一致），Preview D1 由工作流自动应用，Production D1 仅在正式发布时应用。

## 6. 前端组件清单

| 文件 | 动作 |
| --- | --- |
| `PlatformAdminConsole.jsx` | 6 分区；`#admin/stores/:storeId` 路由；移动端底部标签栏；待审批角标（含门店审核数） |
| `AdminStoresSection.jsx` | 新增：列表（搜索）+ 详情面板（组织/概览/成员） |
| `AdminOverviewSection.jsx` | 重构：上排今日 / 下排 7-30 天；权限变更表；变化流；全部可点击 |
| `AdminApprovalsSection.jsx` | 重构：三页签（角色/调店/门店审核）× 三组（待审批/已过期/已处理）；勾选批量批准 + 全部批准；理由输入；历史查看 |
| `AdminDirectorySection.jsx` | 门店创建 → 提示「创建后需 CHU13 审核」；门店行「待审核」黄标 + 「查看」动作 |
| `AdminUsersSection.jsx` | 创建账号对话框（含角色选择）；禁用/恢复（确认弹窗）；重置密码对话框（一次性密码展示） |
| `AdminAuditSection.jsx` | 门店/操作人/动作类型筛选 |
| `workshop`（门店工作台） | 头部/菜单待审批角标：`isPlatformAdmin` 时轮询 `pending-count`（60s），显示黄标总数；点击进 `#admin/approvals` |
| `api/admin.js` | 新增/扩展对应函数 |
| `styles/admin-console.css` | 底部标签栏、卡片化表格、批量选择条、确认弹窗样式；44px 目标；reduced-motion/forced-colors |
| `tests/admin-console.test.mjs` | 扩展：新分区/路由/写操作/移动端类名/角标/批量断言 |
| `apps/worker/test/admin-console.test.ts` | 扩展：新端点、storeId/actor/action 过滤、写操作审计动作、无密码泄漏、禁用撤销会话、平台管理员自禁防护、迁移 0008 |

## 7. 统计与数据口径

- 新增门店/用户：`created_at` ≥ 起始日（今日 / 7 天 / 30 天）。
- 权限变更：`role_change_requests` 按 status 分组；`initiated` 按 `created_at`，`approved/rejected` 按 `decided_at`；周期内按 store 分组 Top 8。
- 门店审核：`stores.status='pending'` 且 `created_at` 距今 ≤ 30 天（队列按创建时间倒序）。
- 变化流（最近 10 条跨类型合并，倒序）：新增门店 / 新增用户 / 角色变更批准 / 调店批准（近 30 天）。
- 门店业务概览：今日工单 `work_items.business_date=today && deleted_at IS NULL` by kind；闭店状态 `daily_closings` 今日；成员数 `store_members.status='active'`。
- 今日口径统一用 `localBusinessDate()`（各门店时区）+ 平台管理端用亚洲/上海时区展示。

## 8. 视觉 / 可访问性（约束不变）

DESIGN.md 唯一事实源；黄色仅主操作/激活/待办/待审核徽标/强调 KPI；「待审核」用黄色系、「已过期」用 muted、「已处理」用语义绿/红。8px 圆角、44px 触控、`:focus-visible` 黄、reduced-motion、forced-colors、无渐变玻璃、状态不单靠颜色（图标+文字）。

## 9. 测试与门禁

- 契约测试扩展（§6）；全量 web 契约、worker 34+、worker `tsc`、`vite build`、`git diff --check`、CI verify/secrets。
- 迁移 drill：0008 应用后隔离 SQLite 完整性验证（行数、0 FK 违规）。
- 密码安全契约：任何响应/审计不含密码明文/哈希（沿用 `doesNotMatch /password/` 模式并扩到新端点）。
- **CodeGraph 前置/后置**：本环境无 CodeGraph，需 Termux 本机执行或用户豁免。
- 版本账本：不递增正式版本号（Preview 周期）。

## 10. 实施顺序（一轮）

1. 迁移 0008（stores pending）+ drill 验证
2. 后端：overview 扩展 + stores/:id + approvals + pending-count + users/audit 过滤扩展 + 用户写操作 + 门店审核端点 + worker 测试
3. 前端：门店分区 + 目录联动 + 总览重构 + 审批重构（三页签三组 + 批量）+ 用户写操作 + 审计筛选 + 工作台角标
4. 移动端 CSS（底部标签栏 + 卡片化 + 审批快捷操作）
5. 门禁全量 + 文档（DESIGN.md 更新、progress、CHECKPOINT）
6. PR → CI → Preview 部署 → 用户真实 CHU13 登录态一次验收
7. 验收通过后由用户决定正式发布（聚合周期递增版本号，正式记录 V5.8.4/5.8.5 已回滚）

## 11. 风险与开放项

- 门店审核制引入**首次 Schema 迁移**（0008）与写操作面扩大：依赖迁移 drill、requirePlatformAdmin + CSRF + 幂等 + 审计闭环；验收重点：越权、密码泄漏、会话撤销即时性。
- 批量批准循环调用：失败项重试与幂等已内建；拒绝理由必填时批量操作仅允许「全部批准」（拒绝须单项填写理由）。
- 工作台角标轮询：仅 `isPlatformAdmin` 触发，60s 间隔，不增加普通门店用户负担。
- 多平台管理员账号：本期不支持（R16），后续需扩展角色模型。
- 桌面真实窗口适配：验收时一并确认（与此前 1536×1024 参考问题关联）。
