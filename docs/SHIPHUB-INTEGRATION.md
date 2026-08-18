# Shiphub 数据接入与网站整合方案

> 版本：v1.3
> 日期：2026-08-18
> 状态：单门店 SSO 安全实施基线
> 适用项目：Workshop Daily Ops
> 文档属性：公开仓库脱敏版，不包含账号、门店外部标识、真实端点、令牌或网络位置

## 1. 目标与边界

Workshop Daily Ops 从 Shiphub 只读同步三类门店订单：

| 类别 | 业务含义 | 网站挂载位置 |
|---|---|---|
| `hand` | 待交接的到店自提订单 | 现有「待取车辆」中的 Shiphub 自提来源 |
| `receive` | 待收货订单 | 现有「其它交接」中的「待收货」标签 |
| `ship` | 待发货订单 | 现有「其它交接」中的「待发货」标签 |

本期不包含：

- 向 Shiphub 回写取车、收货或发货状态。
- 自动创建现有 `work_items` 手工台账记录。
- 新增一级导航模块或改变移动端现有六模块布局。
- 在 Preview 环境访问真实 Shiphub。
- 保存 Shiphub 账号密码。

本期采用**单门店、账号持有人主动授权**模式：仅服务当前已授权账号对应的门店，不做组织级多租户授权，也不以此绕过 Shiphub 的身份认证或服务条款。设置中心提供「连接 Shiphub」按钮，不提供 Shiphub 用户名和密码输入框。

## 2. 实施前提

以下条件未验证前，不得启用真实同步：

1. 已获得数据所有者对 API、账号和目标门店数据使用的明确授权。
2. 已确认 OAuth2 授权端点、回调地址、scope、PKCE/state 要求、refresh token 有效期及轮换行为。
3. 已用独立测试 Worker 验证 DNS、TLS、上游访问策略和 Cloudflare 出网兼容性。
4. 已取得脱敏的 count、list、detail 响应样例，确认分页、订单主键、明细行主键、时间字段和状态字段。
5. 已确认上游限流规则及允许的最大 `page_size`。

Cloudflare Scheduled Worker 不保证固定地区或固定出口 IP。若上游只允许企业网络、门店网络或固定 IP，应改用经过授权的企业 API 网关或固定出口，不得假定普通 Worker 可以直连。

## 3. 设计原则

- **Pull once, serve many**：Worker 拉取一次写入 D1，所有浏览器只读本站 API。
- **最小上游负载**：页面打开、切换标签和普通刷新不调用 Shiphub。
- **多门店隔离**：连接、令牌、同步状态、订单和操作状态都以 `store_id` 隔离。
- **一致性优先**：count 只用于轻量门控，定期完整列表对账负责发现总数不变的订单替换。
- **本地动作与上游状态分离**：店员本地确认不覆盖上游待处理状态。
- **失败保留旧缓存**：同步失败时继续展示最后成功缓存，并明确标记缓存年龄和错误状态。
- **可审计**：同步运行、人工触发和本地确认均有结构化审计；日志不记录令牌或完整个人数据。

## 4. 总体架构

```text
Shiphub
   |
   | OAuth2 + read-only API
   v
Cloudflare Worker scheduled handler
   |-- settings center: user-initiated SSO/PKCE connection
   |-- connection/token service
   |-- per-store sync lease
   |-- category reconciliation
   |-- normalized field mapping
   v
D1 cache and local action overlay
   |
   | authenticated Workshop API
   v
Existing Workshop pages
   |-- 待取车辆：全部 / 手工台账 / Shiphub 自提
   |-- 其它交接：其它交接 / 待收货 / 待发货
   `-- 总览：复用 summary 计数，不新增一级模块
```

浏览器永不获得 Shiphub access token 或 refresh token，也不直接调用 Shiphub API。密码只在 Shiphub/Decathlon IdP 页面提交，Workshop 不接收密码。

## 5. 最小调用策略

### 5.1 营业活跃时段

| 类别 | 轻量 count | 强制完整 list 对账 |
|---|---:|---:|
| `hand` | 每 5 分钟 | 每 15 分钟 |
| `receive` | 每 10 分钟 | 每 30 分钟 |
| `ship` | 每 10 分钟 | 每 30 分钟 |

执行规则：

1. 非强制对账轮次先请求 count。
2. count 与上次不同，立即读取全部 list 分页。
3. count 相同则跳过 list，但到达强制对账时间仍必须读取全部 list 分页。
4. 新订单首次出现时读取 detail；已有订单仅在上游提供可靠变更标识且标识变化时重读 detail。
5. 使用上游允许的最大 `page_size`，减少分页请求。
6. 所有类别默认串行或限制为极低并发，避免短时突发。

不能只依赖 count。订单一进一出时总数可能不变，只有定期完整对账才能避免漏单。

### 5.2 页面和人工操作

| 用户行为 | 上游调用 |
|---|---:|
| 打开网站、切换模块、普通页面刷新 | 0 |
| 查看订单和商品明细 | 0，读取 D1 |
| 本地取车、收货、发货确认 | 0，写本地状态和审计 |
| 明确点击「同步」 | 缓存未超过 2 分钟时为 0；超过阈值时排队一次后台同步 |

人工同步立即返回当前缓存，不阻塞页面等待上游结果。所有用户共享同一门店级限频和同步租约，因此多人同时操作不会放大调用量。

### 5.3 低活跃降频

若门店连续 20 分钟没有已认证的业务 API 活动，三类统一降为每 15 分钟检查一次；重新出现业务活动后恢复正常频率。无论是否低活跃，完整对账的最大间隔不得超过：

- `hand`：15 分钟。
- `receive` / `ship`：30 分钟。

### 5.4 Token、重试和熔断

- 仅在下一次真实请求前检查 access token；临近过期才刷新。
- refresh token 轮换必须原子保存，防止旧 token 覆盖新 token。
- 同一轮遇到 `401` 时只允许刷新并重试一次。
- `429` 和可重试 `5xx` 最多重试一次，遵守 `Retry-After`；随后进入短时熔断。
- 非可重试 `4xx` 不重试，记录脱敏错误码并保留旧缓存。
- 不使用随机请求伪装，不模拟浏览器流量。

### 5.5 预计调用量

按营业 12 小时、页面较活跃估算：

| 类型 | 预计日调用 |
|---|---:|
| count / list 基础轮次 | 约 288 |
| count 变化后的追加 list | 约 30 |
| 新订单 detail | 约 60 |
| token 刷新 | 约 6 |
| 合计 | 约 380 |

低活跃时通常约 300 至 340 次/天。最终预算以真实分页数、订单量和上游 token 有效期为准。

## 6. 同步一致性模型

每个门店、每个类别独立执行以下状态机：

```text
检查功能开关和营业时段
  -> 获取门店级同步租约
  -> 判断 count 轮次或强制完整对账轮次
  -> 读取全部分页到内存中的本轮集合
  -> 仅在全部分页成功后写入订单和明细
  -> 仅在完整对账成功后标记本轮未出现订单为 upstream_absent
  -> 更新 last_success_at / next_reconcile_at
  -> 释放租约
```

关键约束：

- list 任一分页失败时，本轮不得标记任何订单为上游消失。
- 每轮使用唯一 `sync_run_id`，订单保存 `last_seen_run_id`。
- D1 写入必须幂等，主键至少包含 `store_id + category + upstream_order_id`。
- `upstream_state` 与 `local_action_state` 分开保存。
- 本地已确认但上游仍存在时，UI 显示「本地已处理，等待上游对齐」，不得静默复活或隐藏异常。
- 上游订单重新出现时更新 `upstream_state`，保留本地操作历史。

D1 不是长事务锁服务。同步互斥采用带过期时间的租约和条件更新；必须允许 Worker 异常退出后自动恢复。

## 7. D1 数据模型

迁移建议为纯新增 `0015_shiphub_sync.sql`，不修改现有表和约束，以符合 expand-contract 发布策略。

### `shiphub_connections`

- `store_id`：主键并关联 `stores(id)`。
- `location_ref`：外部门店标识的加密值或受控配置引用。
- `enabled`、`mode`：连接开关和 `fixture/live` 模式。
- `refresh_token_ciphertext` 及其 nonce、密钥版本；access token 不持久化。
- `token_expires_at`、`token_updated_at`。
- `authorization_status`、`last_auth_error_code`。
- `created_at`、`updated_at`。

### `shiphub_category_state`

主键：`store_id + category`。

保存 `last_count`、`last_attempt_at`、`last_success_at`、`last_full_reconcile_at`、`next_reconcile_at`、`last_error_code`、`consecutive_failures`。

### `shiphub_sync_leases`

主键：`store_id`。

保存 `lease_owner`、`lease_expires_at`、`updated_at`。租约只控制上游同步，不阻塞 D1 只读 API。

### `shiphub_sync_runs`

保存门店、触发来源、类别、开始/结束时间、状态、分页数、订单数、detail 数和脱敏错误码，用于运行审计与排障。

### `shiphub_orders`

主键：`store_id + category + upstream_order_id`。

保存经过白名单规范化的业务字段、`upstream_state`、`first_seen_at`、`last_seen_at`、`last_seen_run_id`、`upstream_absent_at` 和可选的上游变更标识。

默认不保存完整 `raw_json`。若排障确需短期保存，必须加密、限制访问并设置自动清理期限。

### `shiphub_order_items`

主键优先使用经验证的上游行项目 ID；若上游没有稳定行 ID，则使用经过验证的复合键。不能假设同一订单中的 `sku_id` 唯一。

### `shiphub_order_actions`

保存 `store_id`、订单键、动作类型、当前本地状态、操作人、操作时间、撤销信息和关联审计事件。它是本地流程覆盖层，不改变 Shiphub 数据。

## 8. 凭据与配置

- 正式 OAuth broker 的 client credential（如确需）和 token 加密主密钥通过 Cloudflare Secret 注入；不把公开前端 JS 中的 Basic 值当作机密。
- 只把 refresh token 使用信封加密后存 D1，access token 仅在 Worker 内存中短暂存在；密钥支持版本轮换。
- 不保存、不接收、不转发 Shiphub 用户名和密码。
- 不在日志、API 响应、审计摘要或错误信息中输出 token、Authorization header、OAuth code、外部门店标识或完整上游响应。
- 首次连接使用用户主动发起的 OAuth2 authorization code 流程，校验 `state` 并优先启用 PKCE S256。
- 回调使用一次性、短期、绑定门店和会话的状态记录；code 交换完成后立即失效。
- 连接成功前必须校验 IdP 返回的用户身份和门店绑定关系，拒绝跨门店连接。

### 8.1 设置中心连接模型

设置中心只提供连接状态和操作，不提供 Shiphub 账密表单：

1. 用户点击「连接 Shiphub」，Worker 生成一次性 `state`、PKCE verifier 和短期连接记录。
2. 浏览器跳转到 Shiphub/Decathlon IdP；密码只提交到 IdP 的登录页面。
3. 回调只接收 authorization code，Worker 校验 `state`、PKCE 和目标门店。
4. Worker 在服务端交换 token，立即丢弃 code；refresh token 加密后写入当前 `store_id` 的连接记录。
5. 设置中心只显示 `connected`、`reauth_required`、最后同步时间和脱敏错误码，不显示 token、账号密码或完整外部门店标识。
6. 用户点击断开时撤销或删除本地 refresh token，并清理连接状态；不得提供密码找回或密码导出。

如果未来确实需要账密输入框，必须改为独立隔离的 Credential Broker/HSM 方案；主网站 Worker 和 D1 不得解密或处理明文密码，本方案默认不启用该路径。

建议环境配置名仅表达用途，不在仓库提供真实值：

```text
SHIPHUB_ENABLED=false
SHIPHUB_MODE=fixture|live
SHIPHUB_BASE_URL=<controlled-var>
SHIPHUB_OAUTH_CLIENT_ID=<controlled-var>
SHIPHUB_OAUTH_CLIENT_SECRET=<approved-confidential-secret-only>
SHIPHUB_OAUTH_REDIRECT_URI=<controlled-var>
SHIPHUB_TOKEN_ENCRYPTION_KEY=<secret>
```

Preview 必须固定为 `SHIPHUB_ENABLED=false` 或 `SHIPHUB_MODE=fixture`。只有经过授权和连通性验证的目标环境可以使用 `live`。

### 8.2 实际认证与令牌流程（脱敏描述）

实际接入经过授权与连通性验证，采用 PingFederate 表单登录 + OAuth2 authorization code + 客户端 Basic 认证：

1. 访问授权端点，IdP 返回 PingFederate 登录表单。
2. 提交用户名密码（`pf.username` / `pf.pass`）到表单 action；校验通过后 302 重定向到 `redirect_uri` 并携带一次性 `authorization code`。
3. 服务端用客户端凭证（`Authorization: Basic base64(client_id:client_secret)`）交换 code，获得 `access_token`（约 2 小时）与 `refresh_token`。
4. `refresh_token` 每次刷新轮换（旧 token 立即失效）；信封加密存入 D1，持续自动刷新，正常运营无需重新登录。
5. 首次部署通过 bootstrap `refresh_token`（Cloudflare Secret 注入）初始化连接，之后由 D1 托管轮换。
6. 若令牌长期失效需要重新授权，密码只在 IdP 登录页提交，不经过 Workshop 系统；重新授权会使历史 refresh token 失效。

脱敏约束：授权端点、token 端点、client credential、refresh token 等真实值只通过 Cloudflare Secret / 受控环境变量注入，不在仓库、日志、审计或本文档中出现。

## 9. Worker 落地

建议文件边界：

| 文件 | 职责 |
|---|---|
| `apps/worker/src/lib/shiphub-client.ts` | 超时、错误分类、count/list/detail 传输封装 |
| `apps/worker/src/lib/shiphub-oauth.ts` | state/PKCE、授权回调、code 交换和连接状态 |
| `apps/worker/src/lib/shiphub-token.ts` | refresh token 加解密、过期检查和原子轮换 |
| `apps/worker/src/repositories/shiphub.ts` | D1 查询、幂等写入、分页批次和本地动作覆盖层 |
| `apps/worker/src/services/shiphub-sync.ts` | 多门店调度、租约、最小调用策略和完整对账 |
| `apps/worker/src/routes/shiphub.ts` | 鉴权后的 summary、列表、详情、操作和人工同步 API |
| `apps/worker/src/env.ts` | 可选配置和功能降级，不把 Shiphub 设为全站启动必需项 |
| `apps/worker/src/index.ts` | 注册路由并导出 `scheduled` handler |

Cloudflare Cron 按 UTC 执行。Cron 可每 5 分钟触发一次，代码再根据 `stores.timezone`、门店连接状态、业务活跃度和类别频率决定是否访问上游。不要把北京时间小时范围直接写入 UTC Cron。

## 10. Workshop API

所有接口复用现有 session、`x-store-id`、密码变更门禁、CSRF 和审计机制。

| 方法与路径 | 用途 | 权限 |
|---|---|---|
| `GET /api/v1/settings/shiphub` | 当前门店连接状态、授权状态、最近错误和同步时间 | 当前门店 manager / admin |
| `POST /api/v1/settings/shiphub/connect/start` | 创建短期 state/PKCE 并开始 SSO 连接 | 当前门店 manager / admin、CSRF |
| `GET /api/v1/settings/shiphub/callback` | 校验回调并保存加密 refresh token | 一次性 state，不接受账密 |
| `POST /api/v1/settings/shiphub/disconnect` | 撤销/删除当前门店连接 | 当前门店 manager / admin、CSRF |
| `GET /api/v1/shiphub/summary` | 三类计数、缓存年龄、同步健康状态 | 当前门店成员 |
| `GET /api/v1/shiphub/orders?category=&cursor=` | 当前门店订单分页 | 当前门店成员 |
| `GET /api/v1/shiphub/orders/:category/:id` | 订单和商品明细 | 当前门店成员 |
| `POST /api/v1/shiphub/orders/:category/:id/actions` | 本地确认或撤销 | 登录、CSRF、角色规则、幂等键 |
| `POST /api/v1/shiphub/sync` | 排队一次受限后台同步 | manager / admin、CSRF、全店限频 |

API 不返回 token、真实上游 URL、原始响应或其他门店数据。列表使用游标分页，summary 由一个请求提供三类状态，避免前端分别请求三个计数接口。

## 11. 前端整合

### 设置中心

设置中心增加 Shiphub 连接卡片，但不增加账号密码表单：

- 未连接：显示「连接 Shiphub」按钮和单门店授权说明。
- 连接中：显示一次性授权流程状态，不显示 authorization code 或 token。
- 已连接：显示连接状态、绑定门店的脱敏名称、最近成功同步时间和缓存状态。
- 需要重新授权：显示「重新连接」按钮和脱敏错误原因。
- 已断开：删除本地加密 refresh token 和连接状态，不影响手工台账。
- 所有连接、断开和重新授权动作写入脱敏审计事件。

### 待取车辆

在现有 `PickupScene` / `PickupLedger` 内增加分段控制：

- 全部。
- 手工台账。
- Shiphub 自提。

Shiphub 订单使用独立展示模型，不转换为普通 `work_items`，避免现有台账生命周期、撤销和闭店逻辑被外部状态污染。

### 其它交接

在现有 `OpeningScene` 内增加标签：

- 其它交接。
- 待收货。
- 待发货。

不新增一级导航，不改变现有六模块顺序和移动端紧凑 dock。

### 总览

`WorkshopOverviewPage` 只调用一次 summary：

- 「待取车辆」摘要包含 Shiphub 自提待处理数。
- 「其它交接」摘要包含手工交接、待收货和待发货数。
- 保持现有模块尺寸和横向紧凑布局。

### 状态与交互

- 所有 Shiphub 视图显示最后成功同步时间。
- 缓存超出类别最大对账间隔时显示「数据可能已过期」，但继续展示旧缓存。
- 同步失败不得显示成空列表。
- 人工同步为后台动作，按钮不进入持续等待状态。
- 本地确认后显示操作人、时间以及「等待上游对齐」状态。
- 商品图片只有在确认 URL 可由浏览器公开读取且不泄露凭据时才直连；否则使用受控代理或不展示。

## 12. 测试要求

后端至少覆盖：

- count 不变但订单集合发生替换。
- 多页列表中途失败时不误标上游消失。
- 新订单 detail 只拉一次，可靠变更标识变化后才重拉。
- refresh token 轮换并发和旧 token 不覆盖新 token。
- `401`、`429`、可重试 `5xx`、超时和熔断。
- 租约过期恢复和并发触发只产生一轮上游调用。
- 本地完成状态不被下一轮同步复活。
- 多门店查询、写入和同步完全隔离。
- Preview fixture 测试中真实网络调用为零。
- 日志和 API 响应脱敏。

前端至少覆盖：

- 现有六模块导航顺序和移动端紧凑布局不变。
- `hand` 分段筛选以及 `receive/ship` 标签切换。
- 缓存新鲜、过期、同步失败和未配置状态。
- 本地确认、重复提交幂等和权限失败。
- Dashboard summary 计数与详情列表一致。
- 动态状态行进入正常文档流，不被固定高度或 overflow 隐藏。

## 13. 分阶段交付

### Phase 0：授权与技术探针

- 确认账号持有人对单个目标门店数据的授权和使用范围；不要求组织级多门店授权。
- 确认 OAuth2 授权端点、回调、scope、state/PKCE、refresh token 有效期和轮换行为。
- 通过独立测试 Worker 验证连通性、TLS、出口限制和脱敏响应样例。
- 验证设置中心 SSO 连接不会接收或记录 Shiphub 密码。
- 不修改生产数据，不启用持续同步。

### Phase 1：后端与 fixture

- 新增 `0015_shiphub_sync.sql`。
- 完成设置中心 SSO/PKCE 连接、token 服务、同步引擎、API 和测试。
- refresh token 加密落库，access token 不持久化；连接断开和重新授权可回退。
- Preview 仅使用脱敏 fixture。

### Phase 2：前端整合

- 接入待取车辆、其它交接和总览 summary。
- 完成移动端和桌面端回归测试。
- 部署 Preview 供视觉验收，不启用真实 Shiphub。

### Phase 3：受控上线

- 用户验收 Preview 后，按项目规则执行公开版本 bump、发布说明和正式部署。
- 首次部署保持 `SHIPHUB_ENABLED=false`。
- 配置 Secrets 和授权连接后，仅启用 `hand` 观察同步质量。
- 稳定后再启用 `receive` 和 `ship`。

每一阶段都必须可通过功能开关回退为「隐藏 Shiphub UI、停止上游同步、保留本地缓存」，不得影响现有手工台账。

## 14. 验收标准

- 页面打开和普通刷新不会产生 Shiphub 请求。
- 活跃营业时段调用量符合第 5 节预算，用户数量不会放大上游调用。
- `hand` 缓存最大完整对账间隔 15 分钟；`receive/ship` 最大 30 分钟。
- 同步失败时现有手工台账和闭店流程可正常使用。
- Preview 对真实 Shiphub 的调用数为零。
- 任一门店不能读取或触发其他门店的连接与订单。
- Git、Worker 日志、浏览器和 API 响应中不存在密码、OAuth code、token 或真实外部门店标识。
- 设置中心连接流程中，Shiphub 密码只出现在 IdP 登录页面，不经过 Workshop 请求。
- 生产启用前已完成授权、连通性、分页和 OAuth2 轮换验证。

## 15. 公开文档脱敏规则

本文件及后续 PR 描述、测试 fixture 和部署证据不得包含：

- Shiphub 账号、用户名、密码、client secret、token。
- 真实外部门店代码、party number 或内部 location number。
- 未公开的真实 API 主机名、认证端点和完整请求头。
- 顾客姓名、电话、地址、订单号、运单号或原始响应。
- 规避审计、隐藏流量或模拟人工行为的实现说明。

真实配置只能进入经过授权的 Cloudflare Secret 或受控运维记录；测试数据必须为不可逆脱敏或人工构造的 fixture。