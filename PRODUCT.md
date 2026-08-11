# Product

## Product purpose

Workshop Daily Ops 是自行车部门的移动端优先闭店与跨日业务工作台。系统以 Cloudflare D1、真实账号和服务端业务规则支撑多设备协作；界面统一遵循 [`DESIGN.md`](./DESIGN.md)。

系统不接入迪卡侬官方业务 API。销售、维修、待取、二手车和其它交接由门店同事人工录入，D1 是当前正式业务事实源，浏览器不以 localStorage 作为生产事实源。

## Users and roles

- `operator`：查看所属门店并执行日常台账操作。
- `manager`：包含 operator 权限，可执行闭店治理、重新打开和旧数据导入。
- `admin`：包含 manager 权限，只能审批以本门店为目标的调店申请。
- `platform_admin`：平台作用域，维护区域、城市、门店目录并审批角色提权。

每位用户只有一条当前有效门店成员关系。调店后旧关系进入历史、目标门店建立新的 operator 关系；管理角色必须单独审批。权限由 Worker 根据 HttpOnly Session、当前有效成员关系和数据库平台权限判定，前端隐藏按钮不是授权边界。

## Authentication

- 平台管理员使用一次性 HTTPS setup token 初始化，服务端只持有 token 哈希。
- 同事从启用目录选择区域、城市和门店，以规范化 `@decathlon.com` 邮箱完成 OTP 注册。
- OTP 验证后使用短生命周期 completion grant 原子创建账号、成员、会话和审计。
- 密码使用 PBKDF2-HMAC-SHA-256 与服务端 pepper。
- Session 原值只存在 HttpOnly Cookie；数据库保存 Session/CSRF 哈希。
- 登录失败触发退避；登出、提权、调店、账号禁用和改密撤销相应会话。
- 写请求要求 CSRF Token 和 Idempotency-Key。

## Core operating model

- 当天销售数据已保存是服务端闭店门槛。
- 所有已登录用户可以完成闭店；重新打开受管理权限约束。
- 业务日期按门店时区计算，默认 `Asia/Shanghai`。
- 维修、待取、二手车和其它交接在未发生真实变化时跨日延续。
- 闭店后禁止当日写操作，但仍可查看台账和审计。
- 业务对象使用 revision；旧 revision 写入返回冲突。
- 业务修改与 audit event 在同一 D1 transaction batch 中提交。

## Business lifecycle

### Daily sales and closing

- 保存车辆销售、安全检查、有效评价、二手售出与收车数据。
- 闭店前逐模块核对待取、维修与其它交接。
- 对全部待取来源逐台盘点，并核对系统数量与现场数量。
- 保存、清空、闭店与重开写入审计。

### Repair

- 维修类型：质保、付费、免费、门店产品维修。
- 状态：维修中、等待配件、已开付款单、已开质保单及精确完成状态。
- 联系方式使用 AES-256-GCM 加密保存。
- 非门店产品维修完成后保留业务对象与维修字段并转入待取。

### Pickup

待取来源包括：

- 自提订单（天猫、京东、小程序）
- 维修车辆
- 顾客暂存
- 二手车

取货码只用于当次请求校验，不落库、不进入审计。通知状态与业务状态独立。确认取车后当日标记完成，下一业务日由服务端清理当前台账，历史继续保留。

### Resale

二手车经历待上架、维修完成、在册、售出；售出后按同一业务对象转入二手车待取来源。

### Other handover

其它事项只在真实完成时执行完成，完成后按跨日清理规则退出当前台账。

## Audit and undo

- 审计记录包含用户、显示名快照、门店、业务日期、动作、摘要、前后状态和 revision。
- 每个模块和业务对象均可查看历史。
- 只有最近一次仍可安全恢复的事件允许撤回。
- 撤回本身生成新的不可逆审计事件。

## Attachments

当前 Cloudflare Worker 不提供文件存储，`/api/v1/attachments/*` 返回 `410 MEDIA_DISABLED`。旧 Fastify/Supabase 附件实现和测试仅作为兼容代码保留，不属于当前运行时事实源。

## Synchronization and offline behavior

- 登录后从 `/api/v1/bootstrap` 读取门店、业务日期、闭店、台账和审计快照。
- 写入成功后刷新；窗口重新获得焦点时刷新；页面可见且在线时定期刷新。
- 网络中断后只显示最近一次成功加载的只读快照，禁用所有写操作。
- 首次同步失败时不展示空台账，避免把空页面误认为真实数据。
- Session 过期后清除前端内存态并要求重新登录。

## Legacy v5 migration

- 旧本地 v5 数据只作为显式迁移来源。
- 只有 manager/admin 可查看迁移预览并确认提交。
- 浏览器先剥离取货码并计算来源指纹；服务器校验、去重并导入合法记录。
- 不后台静默上传，不自动删除旧本机数据，不允许旧数据覆盖 D1 事实。

## Deployment environments

- Preview、Staging、Production 使用完全独立的 Cloudflare Worker、D1、GitHub Environment 和 Secret。
- Preview 与 Staging 已存在；`workshop.skin` 当前连接 Staging。
- Production Worker 与 D1 尚未创建。
- Preview 不递增公开版本号。
- Production 要求：准确的 main SHA/version、线上 Staging 身份与人工验收、Environment 审批、显式批准、免费计划确认、加密 D1 导出和成功恢复演练。
- Production 发布后才允许单独审批 `workshop.skin` 域名切换。

详见 [`AUTOMATED-DEPLOYMENT.md`](./AUTOMATED-DEPLOYMENT.md) 和 [`docs/PRODUCTION-BOOTSTRAP.md`](./docs/PRODUCTION-BOOTSTRAP.md)。

## Design authority

- [`DESIGN.md`](./DESIGN.md) 是唯一视觉设计事实源。
- 本文件只定义产品、业务、权限、数据和发布规则。
- 视觉修改不得破坏业务规则、可访问性、移动端触摸目标、审计和离线边界。
