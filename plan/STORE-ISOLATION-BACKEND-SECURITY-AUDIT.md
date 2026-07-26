# Workshop Preview 门店隔离与后端安全审计

**审计时间：** 2026-07-26 19:52–20:35 +08:00
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
2. 用户确认修复范围后，按 SEC-01/02/03/04/05 优先级实施；每项先写回归测试，再改代码。
3. 修复后执行 CodeGraph、12 项安全测试、既有 150 项测试、typecheck、workflow、build、Worker bundle、依赖审计和 Preview 只读完整性复核。
4. 只有用户另行明确授权后才重新部署 Preview；Staging/Production 继续禁止。
