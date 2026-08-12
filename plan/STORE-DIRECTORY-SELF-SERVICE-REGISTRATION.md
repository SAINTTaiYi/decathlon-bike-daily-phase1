# 全国门店目录、自助注册与权限流转落地方案

> **当前实施口径（2026-08-12）**：网站已取消区域、小区域、城市层级。当前运行模型只有门店编码/名称；门店可以自助发起注册，首位完成 OTP 注册的人自动成为门店管理员，后续注册人加入已有门店并默认为操作员。本文下方的旧层级方案保留为历史决策记录，不再代表运行时接口。


**状态：** 实施中；本地质量门禁进行中，尚未部署
**编写时间：** 2026-07-26 00:24 +08:00  
**实施基线：** `feature/cloudflare-workers-d1` / `678e80a27e4123bd00980cb36cbbec762ed42d9e` / 公共界面版本 **V5.7.8**  
**范围：** D1 Worker、Supabase 兼容迁移、Web 注册与治理界面、审计与测试；不包含 Preview、Staging、Production 部署。

---

## 1. 已确认的业务决策（实现的唯一依据）

| 领域 | 已确认规则 |
| --- | --- |
| 全国目录权威 | 平台管理员 **CHU13** 是全国 `区域 → 城市 → 门店` 目录的唯一维护者。 |
| 首批目录 | `南区 → 广西 → 1299 五象店 / 1670 民族东店 / 994 穿山店 / 1249 河东店`。 |
| 自助注册资格 | 仅接受规范化后的 `@decathlon.com` 邮箱；所有门店在目录中启用后均可注册。 |
| 注册顺序 | 区域 → 城市 → 门店 → Profile/用户名 → 邮箱 OTP → 验证成功 → 设置密码 → 完成 → 登录。 |
| 账号创建边界 | OTP 验证前，系统不得创建或激活用户账号、会话或门店成员关系。 |
| 初始权限 | 注册完成后，所选门店是初始成员门店，初始角色固定为 `operator`。 |
| 角色提权 | 任意 `operator → manager/admin`，或 `manager → admin` 的提权，必须由 **CHU13** 审批并执行。 |
| 跨店调动 | 调动申请由**目标门店当前有效的 `admin`** 审批；审批通过后才切换成员门店。 |

这些规则优先于旧 `PRODUCT.md` 中“管理员直接创建账号并分配角色”的旧模型；代码落地时必须同步修订产品事实源、接口、测试与迁移，不能只新增前端入口。

## 2. 目标与非目标

### 目标

1. 将“可注册的门店”收敛为 CHU13 维护的受控目录，杜绝自由文本门店和未登记门店。
2. 让在册门店同事用公司邮箱自主完成账号开通，不依赖临时密码或人工建号。
3. 将角色提权和跨店调动拆成两条可追溯、不可绕过的审批链。
4. 在 D1 Worker 运行时与 Supabase 兼容迁移之间维持同一领域语义、约束和审计证据。
5. 保持现有登录、HttpOnly 会话、CSRF、限流、审计、离线只读和 V5.7.8 Preview 版本治理边界。

### 非目标

- 不接入迪卡侬企业目录、HR、SSO 或官方业务 API。
- 不开放非 `@decathlon.com` 邮箱、邀请码注册、批量导入员工或自动提权。
- 不在本阶段创建邮件服务密钥、Supabase/Cloudflare/EdgeOne 新资源，也不发送真实业务邮件。
- 不改变日常闭店、维修、待取、二手车和报表业务规则。
- 不部署 Preview、Staging 或 Production；本文件不是部署授权。

## 3. 权限与职责模型

### 3.1 平台权限与门店角色分离

现有业务角色仍为 `operator / manager / admin`，但需新增一个**平台作用域**而非依赖前端隐藏按钮：

- `platform_admin`：初始唯一主体是 Profile `CHU13`。可维护目录、审批/执行所有角色提权、创建首位门店管理员、冻结目录项和处理例外。
- `operator`：仅执行所属门店日常台账操作。
- `manager`：保留既有闭店、重开、迁移等门店内权限；不能自行提权或审批角色提权。
- `admin`：保留既有门店管理职责；仅能审批**本门店作为目标门店**的调动，不得维护全国目录、改变任意角色或绕过 CHU13。

`CHU13` 是当前已确认的授权主体，不应将字符串散落在业务判断中。实现时应通过受迁移/种子保护的平台权限记录、稳定 user id 和审计快照判定；Profile 只用于展示和人工核对。

### 3.2 角色提权工作流

1. 申请人或有权代办者提交目标用户、目标门店、目标角色和理由。
2. 系统仅允许“高于现有角色”的请求进入提权流；降权/禁用使用单独的安全管理流，不伪装为提权。
3. 请求状态为 `pending`，此时不修改用户角色或门店成员关系。
4. 只有 `platform_admin`（当前 CHU13）可以批准或拒绝，并填写可审计理由。
5. 批准动作与角色写入、旧会话失效（若角色影响权限）及审计事件必须在同一事务/原子批次内完成。
6. 重复审批、过期请求、已撤销用户、已失效门店成员关系和陈旧 revision 必须失败关闭。

### 3.3 跨店调动工作流

1. 已登录用户从自己的当前有效成员门店发起调动，选择目录中启用的目标门店并填写可选说明。
2. 系统把请求投递给目标门店所有当前有效 `admin`；**只有目标门店 admin** 能批准或拒绝。
3. 批准前再次核验：目标门店启用、审批人仍是该目标门店 admin、申请人仍有唯一当前有效成员关系、请求未过期/未被取消。
4. 批准时原子完成：关闭原门店成员关系 → 建立目标门店成员关系 → 更新用户当前门店指针 → 写审计事件。任何一步失败都不得留下半完成调动。
5. 调动本身只转移门店，不自动携带管理权限：目标门店初始角色为 `operator`。若需 `manager` 或 `admin`，必须另走 CHU13 的角色提权流程。
6. 目标门店没有有效 `admin` 时不可审批调动；CHU13 必须先以提权流程指定首位目标门店 admin。
7. 用户、目标门店 admin 与 CHU13 可查看自身相关的状态和审计结果；不得向无关门店泄露个人资料。

这条“调动不自动提权”的约束是已确认角色审批规则的必要技术实现，避免通过跨店操作绕过 CHU13。

## 4. 数据模型与迁移策略

### 4.1 目录模型

新增受控层级，所有名称保留显示值，同时另存规范化键：

- `regions`：`id`、`name`、`normalized_name`、`status`、`sort_order`、审计列。
- `cities`：`id`、`region_id`、`name`、`normalized_name`、`status`、`sort_order`、审计列。
- `stores`：`id`、`city_id`、`store_code`、`name`、`normalized_name`、`status`、审计列。

约束：

- 启用目录在层级内唯一：`region(normalized_name)`、`city(region_id, normalized_name)`、`store(city_id, store_code)`。
- 门店代码作为文本保存，避免 `0994` 等前导零被破坏；当前首批代码依次为 `1299`、`1670`、`994`、`1249`。
- `status` 至少区分 `active / suspended / archived`。历史成员、审计和业务记录只引用稳定 id；归档不物理删除。
- 注册 API 只返回 `active` 项；历史审计可显示已归档显示名快照。

### 4.2 用户与成员关系

当前单门店用户模型需演进为显式成员关系，避免把历史门店归属覆盖掉：

- `users`：保留身份、密码哈希、状态、平台权限、当前成员关系引用（或由唯一 active membership 推导）。
- `store_memberships`：`id`、`user_id`、`store_id`、`role`、`status`、`effective_from`、`effective_to`、`created_by`、`ended_by`、原因和 revision。
- 数据库保证每用户最多一条 `active` membership；历史关系保留。
- 现有用户迁移为当前门店的一条 active membership，不自动改变其角色、账号状态或业务数据。

### 4.3 注册与审批对象

新增以下独立对象，原始 OTP、密码、Session 与访问令牌均不得落库或进入审计：

- `registration_challenges`：邮箱规范化值、所选门店 id、Profile 规范化值、OTP 的带 secret 哈希/HMAC、发送/过期/尝试次数、完成状态；到期后可清理。
- `registration_completion_grants`：OTP 验证后的短生命周期、一次性、仅用于“设置密码并原子创建账号”的服务端证明；只保存哈希。
- `role_change_requests`：申请/目标/门店/原角色/目标角色/状态/理由/审批人/审批时间/revision。
- `store_transfer_requests`：申请人/源门店/目标门店/状态/目标门店审批人/理由/过期时间/revision。

每一张新增表都必须有最小索引、外键/引用完整性、状态机约束、创建与决策时间，以及对敏感字符串的最小化保留策略。

### 4.4 双存储一致性

当前代码路径包含 Worker/D1 与 Supabase 兼容资产。实施必须：

1. 为 D1 创建前向、可重复检验的迁移；
2. 为 `supabase/migrations/` 创建语义等价的前向迁移；
3. 在测试中断言两套 schema 的核心枚举、唯一性、成员关系和审批状态机一致；
4. 不修改已应用迁移，不使用手工控制台 DDL 代替仓库迁移，不在 Preview/ Staging 之外隐式执行迁移。

## 5. 自助注册协议

### 5.1 用户可见流程

```text
选择区域
→ 选择城市
→ 选择启用门店
→ 输入 Profile 与 @decathlon.com 邮箱
→ 发送 OTP
→ 输入 OTP 并验证
→ 设置密码
→ 原子创建账号 + operator 成员关系
→ 自动登录或跳转登录页
```

- 下拉选择严格按父级过滤；切换区域清空城市和门店，切换城市清空门店。
- Profile 是可见用户名，不得仅靠前端检查唯一性；服务端进行 Unicode/空白规范化、长度和唯一性验证。
- 邮箱按小写、去首尾空格、严格域名后缀验证。接口统一返回不暴露“邮箱是否已注册”的文案。
- 未验证 OTP 时，不创建 `users`、`store_memberships`、可用 Session 或可登录凭据。
- OTP 验证成功后，仅签发一次性 completion grant；设置密码时再在同一原子操作内创建身份、初始 `operator` 成员关系和审计记录。

### 5.2 OTP 与反滥用控制

以下是实现下限；具体阈值应配置化并经过安全测试，不放在前端：

- 使用密码学安全随机 OTP，原值只出现于送信请求，服务端只保存 HMAC/哈希。
- 默认有效期 10 分钟、单 challenge 最多 5 次验证尝试、单邮箱重发冷却至少 60 秒；过期或耗尽后必须重新申请。
- 同时按规范化邮箱、IP/边缘客户端标识和 Profile 施加窗口限流；超限仅返回通用重试提示。
- 重发使旧 challenge 立即失效；验证成功、密码完成、账号冲突和目录失效都使 completion grant 失效。
- 邮件 provider 仅在服务端调用；API key、模板 id、发件域配置都属于环境 Secret，不能进入 `VITE_*`、仓库、日志、审计或客户端响应。
- 使用测试 mail adapter 覆盖自动化测试；真实邮件 provider 配置和 DNS 验证另行审批。

### 5.3 冲突与异常处理

- 已存在的邮箱或 Profile：返回通用“无法完成注册，请联系管理员/登录”结果；不得披露哪个字段已存在。
- 邮箱已经是历史/禁用用户：禁止自助覆盖或重激活，转平台管理员处理。
- 门店在 challenge 期间被暂停/归档：完成时二次检查并拒绝建号。
- 同一邮箱并发完成：数据库唯一约束作为最后防线，失败方不生成半成品成员关系。
- 密码规则继续使用现有安全哈希实现与强度要求；不得把密码、OTP、completion grant、认证 Cookie 写进 audit payload。

## 6. API、服务与前端拆分

所有写接口沿用现有同源、CSRF、Idempotency-Key、结构化错误、审计与 revision 模式；匿名注册端点额外施加独立限流。

### 6.1 建议接口边界

| 范围 | 接口（建议路径） | 说明 |
| --- | --- | --- |
| 公开注册 | `GET /api/v1/registration/directory` | 仅返回 active 区域/城市/门店的最小展示字段。 |
| 公开注册 | `POST /api/v1/registration/otp` | 验证 Profile/邮箱/门店并创建或重发 challenge。 |
| 公开注册 | `POST /api/v1/registration/verify-otp` | 验证 OTP，仅返回一次性 completion 状态。 |
| 公开注册 | `POST /api/v1/registration/complete` | 携带 completion proof 与密码，原子创建账号和 operator membership。 |
| 平台目录 | `/api/v1/platform/directory/*` | CHU13 维护 region/city/store，全部写入审计。 |
| 提权 | `POST/GET /api/v1/role-change-requests` 与 `POST .../:id/decision` | 创建、查看和由 platform_admin 决策。 |
| 调店 | `POST/GET /api/v1/store-transfer-requests` 与 `POST .../:id/decision` | 申请人创建；目标 store admin 决策。 |

实现可对路径命名作一致性调整，但必须保留以上职责边界；不得把目录或审批权复用到普通 `/api/v1/users` 创建接口中而跳过状态机。

### 6.2 目标代码范围（实施前以实时 CodeGraph 复核）

- `apps/worker/src/auth/*`：注册、会话、密码和权限入口。
- `apps/worker/src/repositories/*`、`services/*`、`routes/*`：目录、成员关系、审批状态机、D1 批处理与审计。
- `apps/worker/src/index.ts` / 请求路由：注册与治理路由注册，不破坏现有业务路由。
- `apps/web/src/App.jsx`、认证 hooks/API client、组件与样式：登录页注册入口、步骤表单、OTP/密码错误状态、个人调店入口和管理员审批工作台。
- D1 迁移目录与 `supabase/migrations/*`：上述 schema 的前向迁移。
- `PRODUCT.md`、`README.md`、`plan/CHECKPOINT.md`、`plan/CONTEXT.md`：将已废弃的“仅管理员创建账号”叙述改为本方案的事实源。
- Domain/API/Worker/Web/migration/workflow tests：行为、权限、回归与一致性验证。

## 7. 实施阶段与每阶段验收

### Phase 0 — 事实源与门禁

- 将本方案合入事实源，并在实施分支开始前运行**当前项目本地 CodeGraph**，记录文件数、节点数、边数、影响面和目标文件。
- 确认 `CHU13` 对应的稳定 platform-admin 用户 id 与现有用户/门店数据迁移策略；不得通过猜测 Profile 字符串直接上线。
- 写明 D1 与 Supabase 当前迁移编号、部署分支和 Preview 基线。

**验收：** 设计决策、迁移顺序、角色矩阵、回滚边界和测试清单全部冻结；无代码/云变更。

### Phase 1 — Schema 与领域约束

- 建目录、成员关系、注册 challenge/completion、提权申请、调店申请与审计引用。
- 插入首批目录：南区 / 广西 / 四个门店；只创建目录，不自动创建员工账号。
- 迁移旧用户为历史可追溯的成员关系，执行幂等/唯一性/回滚演练。

**验收：** D1 与 Supabase migration tests 通过；重复迁移、非法状态、双 active membership、无效门店和并发提交均被拒绝。

### Phase 2 — Worker API 与安全服务

- 实现目录读取、OTP lifecycle、原子注册完成、平台目录管理、提权、调店审批。
- 由服务端根据 membership + platform scope 统一鉴权；所有审批/调动写不可伪造审计事件。
- 为真实 mail provider 留出 server-only adapter，但默认 test adapter，不引入任何 Secret。

**验收：** 单元与集成测试覆盖 OTP 失效、枚举防护、限流、重复提交、权限绕过、审批权限、并发/过期、审计原子性。

### Phase 3 — Web 体验与无障碍

- 在登录页增加“注册”入口；实现可恢复的多步骤表单，而不是单页堆叠输入。
- Web 体验统一遵循 [`DESIGN.md`](../DESIGN.md)，并优先保证可读标签、错误提示、键盘流程、焦点管理、44px 触摸目标、`aria-live` 和 reduced-motion。
- 为 CHU13 提供目录与角色审批界面；为目标门店 admin 提供仅属于本门店的调店审批队列。

**验收：** Android 小屏、键盘、屏幕阅读器、200% 缩放、网络中断只读/恢复、无权限状态均有明确结果；普通用户不能看到或调用管理写操作。

### Phase 4 — 回归、Preview 与人工验收

- 执行 CodeGraph 后置门禁，并将影响分析、变更文件、测试结果、迁移 checksum 和 SHA 写入项目 checkpoint。
- 执行完整 tests、typecheck、workflow validator、build、D1/Supabase migration checks、`git diff --check` 和 secret scanning。
- 若用户随后单独授权，才创建 V5.7.8 的 **Preview-only** 部署并由人工验证完整注册、CHU13 提权、目标门店审批调店、审计和回滚边界。

**验收：** Preview-only 不递增公开版本、不改正式更新公告；Staging/Production 仍需后续独立授权。

## 8. 必测验收矩阵

| 场景 | 预期结果 |
| --- | --- |
| 启用门店 + `@decathlon.com` 邮箱 | OTP 验证与密码完成后创建 `operator` 用户和唯一初始成员关系。 |
| 非公司邮箱/停用门店/伪造层级 | 服务器拒绝，且不创建用户或成员关系。 |
| OTP 重发、过期、猜测、重复完成 | 旧码失效；限流生效；不泄露账号存在性；不产生重复账号。 |
| CHU13 审批 `operator → manager/admin` | 仅 platform_admin 可批准；角色变更与审计原子完成。 |
| 非 CHU13 试图提权 | 返回禁止，数据库无角色变更。 |
| 用户申请 A 店 → B 店 | 仅 B 店有效 admin 可决策；批准后 A 关系结束、B 关系生效。 |
| 来源/第三方门店 admin 审批调店 | 返回禁止，数据库无变更。 |
| 调店后要求管理角色 | 不自动获得；必须新建 CHU13 提权申请。 |
| 目标门店无有效 admin | 调店不能批准；提示先由 CHU13 指定首位 admin。 |
| 并发审批/过期/撤销 | 只有一个终态，其他请求安全失败，审计完整。 |
| 旧业务模块和既有登录 | 无回归；原有 API、报表、二手车 Pending Pickup、精确 Origin 验证保持通过。 |

## 9. 回滚、审计与运行边界

- 本方案中的目录、成员关系、角色和申请记录均采用状态/有效期变化，不对已有业务历史做物理删除。
- 一次调店或提权的撤销必须是新的、受权的业务动作和新的审计事件，不能删除原审批证据。
- 若注册/邮件 provider 出现故障，关闭注册入口或停用发送 adapter；不要退回管理员手工写密码、前端伪造 OTP 或跳过验证。
- 首批上线应保留 CHU13 的紧急冻结能力：可冻结目录项、禁用用户、撤销现有 Session；这些操作同样审计。
- 当前公共版本继续为 V5.7.8。任何后续 Preview-only 代码只更新 Preview fingerprint/检查点；只有人工验收并明确请求 Production 后，才按正式版本规则汇总公告并变更版本。

## 10. 本文件的检查点与例外记录

- 本文件是在 `678e80a27e4123bd00980cb36cbbec762ed42d9e` 基线创建的**方案级检查点**，未修改运行代码、schema、版本、部署工作流或云资源。
- 本机 Termux 环境未发现 `codegraph` / `code-graph` 可执行命令；该前置门禁缺失已记录为 `ERR-20260726-002`。仓库内旧 `code/` 派生索引的 `gitSha` 为 `4c4dffb…`，不能替代当前基线的实时 CodeGraph 结果。
- 因此本次不宣称 CodeGraph 门禁通过；真正实施前与所有实施后必须在具备本地 CodeGraph 的工作区重跑并将结果写入 `plan/CHECKPOINT.md`、`plan/CONTEXT.md` 和对应 receipt。
- 本方案不构成任何邮件、Secret、Preview、Staging、Production、数据库迁移或外部服务操作授权。


## 11. 实施检查点（2026-07-26 02:38 +08:00）

### 已完成的实现范围

- D1 `0006_store_directory_self_registration.sql` 与语义等价的 Supabase `202607260001_store_directory_self_registration.sql`：区域/城市/门店目录、邮箱键、唯一 platform-admin、单一 active membership、OTP challenge、角色提权请求、调店请求；首批 `南区 → 广西 → 1299/1670/994/1249` 已纳入迁移种子。
- 旧多门店成员关系迁移为一条确定的 current membership 与可追溯 inactive 历史；已有相同门店代码保留原稳定 id，只补齐受控城市归属。
- Worker：公开目录读取、公司邮箱 OTP、短生命周期 completion grant、原子注册、一次性 CHU13 初始化、目录维护、CHU13 提权审批、目标门店 admin 调店审批；审批/调店/注册与审计均绑定到条件化原子批次。
- Web：登录页注册入口、区域→城市→门店三步注册、CHU13 初始化页、门店与权限治理页；旧直接建号入口已关闭为 410。
- 事实源和配置：`PRODUCT.md`、`README.md`、`.env.example`、Worker route map、CI migration count 与 Preview fingerprint 范围已同步；D1 migrations 现在被 Preview/正式指纹覆盖。

### 已验证证据

- CodeGraph 前置门禁：168 files / 1,868 nodes / 5,683 edges；后置门禁：176 files / 2,031 nodes / 6,237 edges，索引已同步。
- 内存 SQLite 已按真实历史顺序执行 D1 `0001` 至 `0006`，验证多门店旧成员收敛和已有 `1299` 代码复用归属。
- 已通过：数据库 migration tests、Worker tests、完整 `pnpm test`、完整 `pnpm typecheck`、workflow policy validation（88 policies）、`git diff --check`。Web build 已在新增治理组件后通过。

### 未完成 / 运行边界

- 尚未创建 Resend API key、未配置任何 Preview Worker secret、未发送真实邮件；`work2die.asia` 仅已验证发信域。
- 尚未提交、创建 PR、触发 GitHub CI 或部署 Preview；Staging 与 Production 仍未获授权。
- 下一步固定为：功能提交 → Preview-only source fingerprint → 完整 build/Worker bundle → PR/CI → 用户已授权的 Preview-only 部署与人工验收。版本继续保持公开 V5.7.8。
