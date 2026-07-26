# Workshop Preview 门店隔离与后端安全审计

**审计时间：** 2026-07-26 19:52–20:35、21:48–22:08 +08:00
**审计分支：** `audit/store-isolation-backend-security-preview`
**审计基线：** `8e9daff8d7b6ba340989a96b2042dc514923d0f3`
**Preview 身份：** V5.7.8 / `9cf88c1555bd3a7e055ef8842926d778dcb18123` / Worker Version `0cd1c215-15b9-43c1-9e4f-84e17d32c4b8`
**边界：** 仅无副作用安全测试；未创建账号、未提交 OTP、未修改 Preview D1、未部署 Preview/Staging/Production。

## 方法与证据

- CodeGraph 前置门禁：177 files / 2,038 nodes / 6,282 edges，索引最新。
- 本地使用完整 D1 `0001`→`0006` 迁移构造内存 SQLite + Worker 路由隔离环境。
- 新增 `apps/worker/security/d1-test-adapter.ts` 与 `apps/worker/security/security-audit.test.ts`；红队基线 12 项，3 项通过、9 项失败。
- 既有全量验证：`pnpm test` 150/150 通过；`pnpm typecheck` 通过；`pnpm check:workflows` 88 policies 通过。
- Preview 仅执行 GET/HEAD/OPTIONS 与 Cloudflare D1 SELECT；恶意 Origin、`null`、正式域 Origin 在 Preview 均被 403 拒绝，仅 Preview 自身 Origin 通过预检。
- Preview D1 完整性 SELECT：重复活跃成员、孤儿成员、无成员活跃用户、无有效访问会话、孤儿工单/明细、审计跨店归属、治理待审状态错位、平台管理员成员关系异常、重复闭店日均为 0。
- 路径变体探测覆盖重复斜杠、编码斜杠/点段、尾斜杠、分号与反斜杠；未发现未认证访问绕过。
- `pnpm audit --prod`：13 high / 30 moderate / 3 low；直接 Preview 依赖 `hono@4.8.5` 命中多项公告。JWT、内置 CORS、serveStatic、JSX/SSG 等未使用路径单独标为“依赖暴露但当前路径不适用”；核心路径解析仍适用升级要求。

## 已验证有效的安全控制

1. `x-store-id` 不能将单门店会话切换到非成员门店；伪造请求返回 401。
2. 工单列表、直接 ID 修改与删除均使用 `context.storeId`；跨店 ID 无法读取或修改。
3. 审计列表、永久历史和撤回均绑定当前门店；跨店审计 ID 无法撤回。
4. 非平台管理员不能新增/停用目录项。
5. 只有目标门店 active admin 可以审批调店；来源成员关系、目标审批者与 revision 均有条件守卫。
6. 角色提权仅 CHU13 可决策；目标成员关系和 revision 变化会使审批失效。
7. D1 唯一约束维持单 active membership、单 platform-admin、单待处理角色/调店申请。
8. Session 原值与 CSRF 原值不入库；Cookie 已具备 `__Host-`、Path=/、HttpOnly、SameSite=Lax、Secure、无 Domain。
9. Preview CORS 使用精确 Origin allowlist，恶意、`null` 与非 Preview Origin 均拒绝。

## 发现

### SEC-01 · 高 · 固定 CHU13 可被远程错误密码锁死

- **证据：** 任意来源连续 5 次错误密码后，正确密码仍返回 401；唯一平台管理员被锁 15 分钟。
- **原因：** 登录只按用户名累计失败并锁账号，没有 Cloudflare 边缘/IP/设备维度限速、递增延迟、管理员恢复通道或对唯一平台管理员的可用性保护。
- **影响：** 已知固定 Profile `CHU13` 可被低成本持续拒绝服务，阻断全国目录、提权与治理审批。
- **建议：** 取消仅靠账号硬锁；采用账号+可信 Cloudflare IP 哈希的速率桶、指数退避、边缘 WAF/Rate Limiting、失败审计与安全恢复流程。唯一平台管理员不应被匿名攻击永久维持在锁定状态。

### SEC-02 · 高 · 并发错误 OTP 绕过 5 次尝试上限

- **证据：** 5 个并发错误 OTP 请求均返回 400，但数据库最终 `attempts=1`、状态仍 `pending`。
- **原因：** 先读取 `attempts`，再写入固定 `attempts + 1`，缺少原子增量/条件更新。
- **影响：** 攻击者可并发放大 6 位验证码猜测次数，绕过状态机尝试上限。
- **建议：** 单条条件 UPDATE 原子执行 `attempts = attempts + 1` 与过期状态切换；以 `status='pending' AND attempts < 5 AND expires_at > now` 作为守卫，并按 challenge/client/IP 增加速率限制。

### SEC-03 · 高 · `hono@4.8.5` 直接依赖包含核心路径解析漏洞

- **证据：** `pnpm audit --prod` 命中 GHSA-9hp6-4448-45g2（CVSS 7.5，修复于 4.9.6）及后续大量公告；项目版本为 4.8.5。
- **实际适用性：** Preview 未使用 Hono JWT、内置 CORS、serveStatic、JSX/SSG，因此相应公告当前路径不直接适用；但路由/path 解析属于核心 Hono 使用面。外部路径变体未复现鉴权绕过，不等于可继续保留已知脆弱版本。
- **建议：** 至少升级到消除当前审计全部 Hono 公告的安全版本（审计时需 `>=4.12.27`），重新执行路径混淆、CORS、Cookie、全量回归与 Worker bundle 验证。

### SEC-04 · 中高 · 并发错误登录绕过累计阈值

- **证据：** 5 个并发错误登录均返回 401，但数据库最终 `failed_login_count=1`、未锁定。
- **原因：** 先读计数，再写固定 `nextCount`，缺少数据库原子增量。
- **影响：** 攻击者可通过并发请求绕过现有 5 次锁定阈值；与 SEC-01 同时说明当前锁定既能被 DoS，又不能可靠抗爆破。
- **建议：** 原子 UPDATE/RETURNING；将账号状态与 IP/设备速率桶分离。

### SEC-05 · 中 · 幂等重放直接 500，失败请求永久占位

- **证据：** 同一成功写请求重放时，`INSERT INTO idempotency_requests` 触发唯一约束，未进入既有结果读取分支，返回 500；第一次业务校验失败后，占位行保持 `response_status/body = NULL`，后续同键同样 500/无法重试。
- **原因：** 普通 INSERT 假设冲突会返回 `changes=0`，实际 D1/SQLite 唯一冲突会抛错；handler 异常没有删除或终结 reservation。
- **影响：** 客户端网络重试不能安全重放；失败请求可造成 24 小时局部自我拒绝服务，并把预期 4xx 变成 500。
- **建议：** `INSERT OR IGNORE`/受控冲突语义；异常时删除 reservation 或持久化可重放的错误结果；增加并发同键与失败重试测试。

### SEC-06 · 中 · OTP 请求响应可枚举邮箱/Profile 可注册性

- **证据：** 已注册邮箱/Profile 返回 `{ok,message,retryAfterSeconds}`；新有效身份额外返回 `challengeId`。
- **影响：** 未认证攻击者可枚举公司身份是否已在 Workshop 注册。
- **建议：** 对无效/已注册/不存在门店也返回同形态的合成 challenge 标识，或改成同一客户端不可区分的后续状态；同时统一时序并清理合成状态。

### SEC-07 · 中 · 唯一平台管理员可停用自己的有效目录路径

- **证据：** CHU13 可将自身唯一 active membership 对应门店直接改为 disabled；操作返回成功，之后 loadSession 无法连接 active store。
- **影响：** 唯一治理账号可误操作自锁，且没有第二 platform-admin 恢复。
- **建议：** 停用 store/city/region 前检查是否会让唯一 active platform-admin 失去有效 admin membership；阻止并给出迁移/恢复步骤。

### SEC-08 · 中 · Worker 没有明确请求体上限

- **证据：** 2 MB JSON 被完整解析后才因 strict schema 返回 400，不会提前 413；源码未配置 body limit。
- **影响：** 登录、OTP 和写接口可被大请求消耗 CPU/内存；Hono 4.8.5 同时命中 body-limit 绕过公告，但当前更直接的问题是完全没有启用上限。
- **建议：** 升级 Hono 后在 API 边界加入严格 body limit（按接口分类），对已知 `Content-Length` 提前拒绝并覆盖 chunked/unknown-length。

### SEC-09 · 中低 · 敏感 API 缺少显式 no-store 与通用安全响应头

- **证据：** Preview 登录/401/目录/健康/API 响应未见 `Cache-Control: no-store`、`X-Content-Type-Options: nosniff`；Web Shell 也未见 CSP/X-Frame-Options/HSTS 应用层声明。
- **影响：** 敏感身份/业务 JSON 对浏览器和中间缓存的约束不明确；页面缺少应用层点击劫持和内容策略防护。
- **建议：** `/api/*` 默认 `Cache-Control: no-store, private` 与 `Pragma: no-cache`；全局 `nosniff`、Referrer-Policy、Permissions-Policy；HTML 增加 CSP `frame-ancestors 'none'`（或 X-Frame-Options DENY）并评估 HSTS。

### SEC-10 · 低 · 过期 OTP challenge 状态未主动收敛

- **证据：** Preview D1 SELECT 存在 1 条 `status='pending'` 且 `expires_at` 已过期的历史 challenge。
- **影响：** 验证时仍会按时间拒绝，不构成直接绕过；但状态统计、限速与运营判断可能出现残留。
- **建议：** 请求/定时清理中原子标记过期，设置保留期后删除敏感 challenge 数据。

### OPS-01 · 非安全阻断 · schemaVersion 元数据仍报告 0002

- Preview D1 实际迁移已到 `0006_store_directory_self_registration.sql`，但 `/api/v1/meta/version` 硬编码 `0002_work_item_ticket_numbers`。这是部署身份准确性缺陷，不作为本安全审计的主要漏洞，但应一并修复。

## 未发现的问题

- 未发现跨门店 SQL 漏过滤或 IDOR 成功路径。
- 未发现恶意 Origin CORS 反射；Preview 对 `evil.example`、`null`、`workshop.skin` 均拒绝。
- 未发现 Preview D1 中孤儿数据、重复 active membership、跨店审计归属或治理状态错位。
- 未发现 Session/CSRF 明文入库、联系方式明文持久化或动态用户输入拼接 SQL 表名。
- 路径变体探测未发现未认证路由绕过；对 Hono 已知路径解析风险仍要求依赖升级。

## 后续顺序

1. 先提交本审计测试与报告，不改运行时代码。
2. 用户确认修复范围后，优先处理高风险原子性边界：SEC-13（维修并发脏写）、SEC-14（闭店 TOCTOU），随后处理 SEC-01/02/03/04/05；每项先保留/细化失败回归测试，再改代码。
3. 修复后执行 CodeGraph、23 项安全测试、既有 150 项测试、typecheck、workflow、build、Worker bundle、依赖审计和 Preview 只读完整性复核。
4. 只有用户另行明确授权后才重新部署 Preview；Staging/Production 继续禁止。

## 第二阶段扩展（2026-07-26 21:48–22:08 +08:00）

- 用户确认继续“只测试、不修复”，新增覆盖：Session/CSRF、审计敏感数据、业务并发、平台管理员初始化竞争、Hono 路径解析实际触达面。
- 边界保持：仅本地隔离测试和证据文档；不修改运行时代码、不推送、不部署、不写 Preview D1。
- CodeGraph v1.5.0 已从本地源码重新构建；Termux 下 `npm run build` 未解析本地 `tsc`，改用同一源码树的本地 TypeScript 编译器直接构建成功，未修改 CodeGraph 源码。
- 第二阶段前置门禁：179 files / 2,095 nodes / 7,052 edges，索引最新。
- 扩展后的隔离红队套件共 23 项：9 通过、14 失败。相对第一阶段新增 11 项，其中 6 通过、5 失败；失败均为安全要求未满足，不是测试夹具异常。

### 第二阶段新验证通过的控制

1. CSRF 令牌不能跨 Session 复用；登出会写入 `revoked_at`，旧 Session 随即返回 401。
2. 维修联系方式进入业务表和审计快照时保持 AES-GCM 密文；明文未出现在 `before_state` / `after_state`。
3. 审计历史 API 映射不会直接返回 `before_state` / `after_state`，人工植入的邮箱、手机号快照未出现在响应正文。
4. 普通交接记录的同 revision 并发编辑只有一个 200，另一个受控 409；最终 revision=2 且仅生成一条编辑审计。
5. 同门店 5 个并发新增请求分配唯一连续工单号 1–5，无重复。
6. 可构造 Hono 4.8.5 `getPath()` 与 WHATWG `URL.pathname` 分歧；但 Worker 外层 `routeIncomingRequest()` 使用 WHATWG URL，已测试阻止非 API 外层路径被误送进敏感 API，敏感畸形路径落为 404，未复现鉴权绕过。

### 第二阶段新增发现

#### SEC-11 · 中低 · 单槽 CSRF 轮换导致多标签页互相失效

- **证据：** 同一 Session 连续两次调用 `/api/v1/auth/me` 会生成两个令牌，但第二次直接覆盖数据库唯一 `csrf_hash`；第一标签页随后携带其合法令牌写请求返回 403，第二标签页返回预期业务响应。
- **影响：** 不会放宽 CSRF 校验，但刷新、恢复、多标签页或并发启动会造成已打开页面自我拒绝服务，可能导致用户在关键业务写入时误判 Session 已失效。
- **建议：** 每个 Session 使用稳定 CSRF 令牌，或保存当前/前一令牌并设置短暂重叠窗口；明确令牌轮换语义并增加多标签页回归。

#### SEC-12 · 中 · 自助注册审计永久保存完整公司邮箱明文

- **证据：** `self-register` 审计的 `after_state` 直接保存 `email: sensitive.registration@decathlon.com`；完整邮箱长期保留于永久审计表。
- **边界：** 审计历史 API 当前不返回原始快照，维修联系方式也保持密文；问题是数据库内重复、长期的身份明文留存，而非当前前端直接泄漏。
- **影响：** 扩大公司身份数据的保留范围、备份暴露面和内部查询可见面，不符合最小化原则。
- **建议：** 审计只保留掩码邮箱、不可逆 HMAC 标识或用户 ID；定义敏感字段清单、审计保留期和仅限安全调查的受控访问。

#### SEC-13 · 高 · 维修并发编辑的失败请求会留下子表脏写

- **证据：** 两个请求均读取 revision=1；获胜请求把主记录和维修项目更新为“第二请求”，滞后请求先更新 `repair_details` 为“第一请求”，随后主表条件 UPDATE 因 revision 冲突返回 409。最终主表 `title/detail` 属于第二请求，而 `repair_details.repair_project` 属于第一请求。
- **原因：** PATCH 路径在执行主表 revision 条件更新前先无条件更新维修/待取子表；整个业务修改未置于同一原子事务或同一条件标记下。
- **影响：** 客户端收到冲突失败，但失败请求仍污染联系方式、维修项目、状态等关键字段，产生不可见的数据撕裂与错误交付信息。
- **建议：** 将主表 revision 抢占和全部子表更新绑定为同一原子提交；子表 UPDATE 必须以成功的主表 revision/请求标记为条件，失败时不得留下任何状态变化。

#### SEC-14 · 高 · 闭店与业务写入存在 TOCTOU，闭店后仍可成功落账

- **证据：** 编辑请求通过 `ensureDayOpen()` 后暂停；并发闭店成功并把 `closing_status` 设为 `closed`；恢复编辑后仍返回 200，并把台账标题改成“闭店后不应写入”。
- **原因：** “今日是否开放”只在业务写入前独立 SELECT 一次，实际 UPDATE 未同时绑定当天仍为 open 的数据库条件。
- **影响：** 闭店快照之后仍可产生业务变更，破坏日结边界、审计解释和报表一致性。
- **建议：** 在同一事务/条件 UPDATE 中同时校验业务日状态或 closing revision；闭店需要与所有当天写操作争用同一个数据库锁/版本守卫。

#### SEC-15 · 中 · 并发平台管理员初始化把唯一约束冲突暴露为 500

- **证据：** 两个合法初始化请求同时通过“管理员数量为 0”检查；唯一索引最终保证只有一个 platform-admin 和一个 active admin membership，但响应为 201 + 500，而不是 201 + 受控 409。
- **影响：** 不会创建第二平台管理员，但会向初始化操作者呈现内部错误、产生不明确的重试语义，并污染服务错误率与告警。
- **建议：** 用条件 INSERT/受控冲突语义完成初始化；捕获唯一约束并统一返回 `PLATFORM_ADMIN_ALREADY_EXISTS` 409，同时保持审计与成员关系原子性。

### Hono 路径解析实际触达结论

- `hono@4.8.5` 的 `getPath()` 对畸形 absolute-form URL（例如 authority 后的空端口形式）可与 WHATWG URL 解析产生不同路径，符合 GHSA-9hp6-4448-45g2 的问题类型。
- 标准 `Request` 构造会先规范化该 URL；隔离测试使用保留原始 `request.url` 的代理对象验证最坏输入。
- 当前 Worker 在进入 Hono 前由 `routeIncomingRequest()` 使用 `new URL(request.url).pathname` 判定 API/静态资源边界。所测非 API 外层路径被送到 Assets，未进入 Hono；所测 API 外层路径虽然 Hono 解析分歧，但只落到 404，未命中敏感路由。
- 因此当前测试未复现 Hono 路径混淆导致的鉴权绕过；依赖版本仍处于已知漏洞范围，升级要求不变。

### 第二阶段完成验证

- 隔离安全套件：23 项，9 通过 / 14 预期失败。新增 11 项中 6 通过 / 5 失败；失败对应 SEC-11–15。
- 既有仓库测试：150/150 通过（domain 5、database 8、web 106、API 16、Worker 15）。
- 全仓 `pnpm typecheck`：通过。
- `pnpm check:workflows`：88 policies 通过。
- `git diff --check`：通过。
- CodeGraph 后置门禁：179 files / 2,118 nodes / 7,218 edges，索引最新；影响测试包含本安全套件及 auth/audit/ticket/repair/closing 相关测试。
- 变更仅限 `apps/worker/security/d1-test-adapter.ts`、`apps/worker/security/security-audit.test.ts` 和本报告；没有运行时代码、依赖、迁移、工作流或部署配置改动。
- 未执行 push 或任何 Preview/Staging/Production 部署；未写远端 D1。
- 第二阶段测试/报告主提交：`3b4361cffd79f2e1f86aee84483b7b56f6f929d7`（仅本地，未推送）。

## SEC-13 / SEC-14 本地修复（完成，未推送/未部署）

- 用户于 2026-07-26 22:23 +08:00 授权开始修复，仅限 SEC-13 与 SEC-14；保持本地、不推送、不部署。
- 修复基线：`23761cfedafce12ce3afede66c213b97fe749065`。
- CodeGraph 修复前门禁：179 files / 2,118 nodes / 7,218 edges，索引最新。
- 调用面：Worker `ensureDayOpen` 共有 7 个运行时调用位置，覆盖工单新增、编辑、动作、通知、取车、删除与审计撤回；SEC-14 采用共享原子写守卫设计，不只覆盖单一复现路径。
- 中间结果：SEC-13 / SEC-14 两个隔离复现均已转绿；完整安全套件从 9 通过 / 14 失败改善为 11 通过 / 12 失败，其余失败均为本次未授权修复的既有风险。
- Worker 使用 D1 事务化 `batchWhileDayOpen` 覆盖新增、编辑、业务动作、通知、取车、删除和审计撤回；主表与详情表写入合入同一 batch。
- Fastify/Postgres 在幂等事务内先物化 `daily_closings` 行，再 `FOR UPDATE` 锁定，关闭 absent-row 与闭店并发窗口。
- 中间验证：Worker 16/16、API 17/17，双方 typecheck 通过。
- 最终安全套件：24 项，12 通过 / 12 个其余已知风险保持预期失败；SEC-13、SEC-14 及新增的七类闭店写路径覆盖均通过。
- 最终既有回归：152/152 通过（domain 5、database 8、web 106、API 17、Worker 16）；全仓 typecheck、88 workflow policies、`git diff --check` 均通过。
- 构建：API、Web、Worker bundle 直接构建通过。`pnpm check:version` 按设计拒绝未登记 Preview 的本地修复分支；遵循 Preview-only 不变更公开版本规则，未运行 `version:preview`、未修改 V5.7.8。
- 分支：`fix/sec13-sec14-atomicity-preview`，仅本地；未修改 migration、依赖、工作流、前端或部署配置。
- SEC-13 修复：Worker 主表 revision 更新与维修/待取详情更新进入同一 D1 batch；详情语句仅在前序主表成功时执行，失败请求整体不留脏写。复合业务动作同样使用原子 parent/child batch。
- SEC-14 修复：Worker 使用事务首语句闭店冲突守卫覆盖新增、编辑、复合动作、通知、取车、删除和审计撤回；Fastify/Postgres 在幂等事务内物化并 `FOR UPDATE` 锁定业务日，串行化业务写与闭店。
- 未推送、未部署、未写 Preview/Staging/Production D1；公开 Preview 仍为 V5.7.8 / `9cf88c155…`。
- CodeGraph 修复后门禁：179 files / 2,123 nodes / 7,236 edges，索引最新；影响测试集中于 API/Worker 的 auth、audit、repair 与本隔离安全套件。
- SEC-13 / SEC-14 修复主提交：`4cf2d066377c36b19ceaca4d446e48e792ae8fb5`（仅本地，未推送）。

## SEC-01–05 本地修复（进行中）

- 用户于 2026-07-26 22:58 +08:00 授权本地修复 SEC-01/04、SEC-02、SEC-05、SEC-03；不推送、不部署、不改公开版本。
- 分支：`fix/sec01-sec05-auth-idempotency-preview`；基线：`3f044f6833780530a974dd0d604c46e7dac50931`。
- CodeGraph 前置门禁：179 files / 2,123 nodes / 7,236 edges，索引最新。
- 2026-07-26 23:02–23:13 +08:00 从中断恢复：目标工作树、分支、基线与未提交启动检查点一致，尚无运行时代码改动；CodeGraph `status` 再确认 179 files / 2,123 nodes / 7,236 edges，索引最新。
- 本阶段执行顺序保持：先 SEC-01/04 登录可用性与并发计数，再 SEC-02 OTP 原子尝试，再 SEC-05 幂等重放/失败清理，最后 SEC-03 Hono 升级与路径回归。

### SEC-01 / SEC-04 修复检查点

- Worker 登录失败改为数据库内 `failed_login_count = failed_login_count + 1` 原子增量；5 个并发错误登录最终稳定累计到 5 并锁定普通账号。
- 唯一平台管理员不再使用可被匿名请求持续维持的账号级硬锁：错误密码仍原子记录失败次数，但 `locked_until` 保持空；正确密码可恢复登录。普通账号保留 5 次失败后 15 分钟锁定。
- Fastify/Postgres 同步相同平台管理员账号锁语义；原有来源 IP 级 Fastify rate-limit 保持不变。
- 定向验证：Worker SEC-01/04 两条隔离测试 2/2 通过；API 测试 18/18 通过；Worker 与 API typecheck 通过；`git diff --check` 通过。
- CodeGraph 后置门禁：同步 3 个文件，179 files / 2,123 nodes / 7,236 edges，索引最新；受影响测试为 API audit/auth 与 Worker 安全套件。

### SEC-02 修复检查点

- 错误 OTP 改为单条条件 UPDATE：`attempts = attempts + 1`，仅允许 `status='pending' AND attempts < 5 AND expires_at > now` 的 challenge 消耗尝试。
- 第五次错误尝试在同一 SQL 中原子把状态收敛为 `expired`；并发请求不再覆盖彼此计数，也不会把 attempts 推过数据库上限。
- 定向隔离回归 1/1 通过；Worker 全量 17/17、Worker typecheck、`git diff --check` 通过。
- CodeGraph 后置门禁：同步 2 个文件，179 files / 2,123 nodes / 7,236 edges，索引最新。
