# Product

## Register

product

## Product purpose

Decathlon Bike Ops 是自行车部门的移动端优先闭店与跨日业务工作台。它保留产品 Lookbook / editorial ops 的视觉语言，同时以数据库、真实账号和服务端业务规则支撑多设备协作。

系统不接入迪卡侬官方业务 API。销售、维修、待取、二手车和其它交接仍由门店同事人工录入，但 PostgreSQL 是正式业务事实源，浏览器不再以 localStorage 作为生产数据源。

## Users and roles

- `operator`：查看门店数据；新增、编辑并执行日常台账动作。
- `manager`：包含 operator 权限；完成/重新打开闭店；执行旧 v5 数据导入。
- `admin`：包含 manager 权限；创建门店账号并分配角色。

所有权限都由 API 根据 HttpOnly Session、当前门店和数据库角色执行。前端隐藏按钮不是授权边界。

## Authentication and first-run

- 首位管理员通过一次性 `#setup=<token>` HTTPS 链接创建；服务器只比较 Setup Token 的 SHA-256 指纹。
- 后续账号由管理员创建，使用用户名和密码登录，不开放自助注册。
- 密码使用 Argon2id 与服务端 pepper；临时密码账号首次登录必须改密。
- Session 原值只存在 HttpOnly Cookie；数据库仅保存 Session/CSRF 哈希。
- 登录失败累计达到阈值后短时锁定；登出、账号禁用和密码变更可撤销会话。
- 写请求必须携带 CSRF Token 和 Idempotency-Key。

## Core operating model

- **唯一闭店门槛**：当天销售数据已保存。
- **闭店权限**：所有已登录用户都可以完成闭店；只有 manager 或 admin 可以重新打开。
- **服务端业务日期**：按门店时区计算，默认 `Asia/Shanghai`；客户端时钟不是跨日事实源。
- **跨日业务台账**：未发生真实变化的维修、待取、二手车和其它交接自然延续。
- **闭店锁定**：闭店后禁止写操作，但仍可查看台账、日志和审计记录。
- **并发控制**：业务对象和当日闭店使用 revision；旧 revision 写入返回冲突，前端刷新后要求重新确认。
- **审计原子性**：业务修改与 audit event 在同一数据库事务中提交；操作者来自 Session，客户端不能伪造 actor。

## Business lifecycle

### Daily sales and closing

- 保存车辆销售、安全检查、有效评价、二手售出与收车数据后满足闭店门槛。
- 清空、保存、闭店与重开均写入审计记录。
- 当日日志只展示当前业务日；跨日历史继续保存在数据库审计中。

### Repair

- 维修记录包含车辆标题、联系方式类型/内容、维修类型、维修项目、取车日期与当前状态。
- 维修类型只允许：质保、付费、免费、门店产品维修。
- 用户可选状态只允许：维修中、等待配件、已开付款单、已开质保单；执行“维修完毕”后系统写入“维修完成”。
- 手机号/会员号使用 AES-256-GCM 加密保存，可选 HMAC 指纹用于精确关联；日志不得记录明文。
- 门店产品维修无需取车日期；“维修完毕”后在维修模块当日标黑，下一业务日由服务端幂等清理。
- 质保、付费和免费维修完成后保留同一业务对象及完整维修字段，以工作项“维修完成”状态转入待取；内部维修明细保留兼容的原状态。

### Pickup

- 待取来源只允许：自提订单、维修车辆、顾客暂存。
- 自提订单必须选择天猫、京东或小程序；取货码只用于当次请求校验，不落库、不进入审计。
- 非免费维修仅在维修完成、已开付款单或已开质保单时允许取车；免费维修完成后自动写入维修完成状态。
- 通知状态与维修业务状态独立，可在“等待确认通知 / 已通知”之间切换。
- 确认取车后当日整条标黑；下一业务日由服务端清理当前台账，但历史保留。

### Resale

- 新增二手车进入待上架区。
- “维修完毕”后以同一记录进入已上架在册。
- “已售出”后退出当前在册，审计与可撤回快照保留。

### Other handover

- 其它工作只在真实完成时执行“完成”。
- 完成后当日标黑，下一业务日清理当前台账；不要求每日重复更新。

## Audit and undo

- 每个模块和每条记录均可查看操作历史。
- 审计记录包含数据库用户、操作时显示名快照、门店、业务日期、动作、摘要、前后状态和 revision。
- 只有对象最近一次仍可安全恢复的事件允许撤回。
- 撤回本身生成新的不可逆审计事件；自动跨日清理和附件操作不作为普通可撤回业务动作。

## Attachments

- 用户图片保存在 Supabase private Storage，浏览器永远不获取 server-only `SUPABASE_SECRET_KEY`。
- 支持 JPEG、PNG、WebP；单文件最多 10 MB；每条业务记录最多 6 张。
- API 校验账号、门店、MIME、大小和 SHA-256，返回对象级短期 signed upload URL。
- 上传完成后 API 校验 Storage 对象信息，并重新下载对象计算真实 SHA-256；只有大小、MIME、声明摘要和实际摘要全部一致才标记可用。
- 查看使用 5 分钟 signed download URL；删除先软删除数据库记录，再尝试清理私有对象。

## Synchronization and offline behavior

- 登录后从 `/api/v1/bootstrap` 读取门店、业务日期、闭店、台账和审计快照。
- 写入成功后立即刷新；窗口重新获得焦点时刷新；页面可见且在线时每 45 秒刷新。
- 网络中断后只显示最近一次成功加载的只读快照，禁用新增、编辑、状态动作、撤回和闭店。
- 首次数据库同步失败时不展示空台账，避免把空页面误认为真实数据。
- Session 过期后清除前端内存态并要求重新登录。

## Legacy v5 migration

- 旧 `decathlon-bike-operations-ledger:v5` 与 `decathlon-bike-closing-v5:*` 仅作为显式迁移来源。
- 只有 manager/admin 可查看迁移预览并确认提交。
- 迁移在浏览器先剥离取货码，计算 source fingerprint；服务器校验、去重并在事务中导入合法记录。
- 不后台静默上传，不自动删除旧本机数据，不允许旧数据覆盖当前数据库事实。
- `useClosingWorkflow.js` 继续保留为旧 v5 迁移与规则回归参考，不是正式运行时事实源。

## Deployment environments

- Web + API：两个完全独立的 EdgeOne Makers Free 项目；Vite/React 静态站点与 Node.js Cloud Functions 同源。
- Database + Media：两个完全独立的 Supabase Free PostgreSQL / private Storage 项目。
- Staging 与 Production 使用不同 GitHub Environments、Secret、Supabase 项目、EdgeOne 项目和专用部署分支。
- EdgeOne 不直接监听 `develop` 或 `main`；GitHub 先完成测试与 checksum migration，再普通快进 `edgeone-staging` / `edgeone-production`。
- 禁止付费套餐、按量计费、自动升级和 force push。
- Production 只有在 Staging 源码验收、main SHA/version 固定、环境审批、显式批准、加密导出和恢复演练确认后才允许发布。

## Brand personality

运动、机械、明亮工业信号、大胆平面色块、硬边、程序化编号、可信运营票据、移动端原生。

## Design principles

1. **外层是 WORKSHOP SIGNAL GRID，内层是可信运营工具。**
2. **销售数据仍是唯一闭店要求。**
3. **数据库与服务端规则是正式事实源。**
4. **真实变化才操作，未变化事项自然跨日。**
5. **权限、审计、并发和敏感数据保护不是前端装饰。**
6. **离线只读，不伪装为已同步。**
7. **一个页面只保留一个明确的闭店主操作。**
8. **业务枚举使用一致的项目化选择控件。**
9. **视觉升级不得破坏现有业务规则、可访问性和移动端触摸目标。**

## Accessibility baseline

WCAG 2.1 AA：语义 HTML、Skip Link、可见焦点、44px 触摸目标、原生 Dialog、Escape、焦点恢复、aria-live、错误/加载/空/离线状态，以及 `prefers-reduced-motion` 均为必需项。
