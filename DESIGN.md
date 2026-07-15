# Design

## Direction

**Hard-edge mobile product lookbook for authenticated, database-backed bike operations.**

界面不是普通 Dashboard。外层借鉴产品 Lookbook 的标题、序号、印刷节奏与单一强视觉；内层以连续运营票据承载销售、待取、其它交接、维修和二手车。数据库化不得把界面改造成蓝白企业后台，也不得牺牲现有业务密度和移动端可操作性。

## Product hierarchy

1. **首次初始化**：一次性 HTTPS Setup 链接创建首位管理员和门店；完成后链接失效。
2. **安全登录**：黑色品牌开屏内嵌用户名与密码表单；登录成功后由上下分屏动画进入工作台。
3. **强制改密**：管理员创建的临时密码账号在改密前不能访问业务数据。
4. **顶部日报刊头**：仅显示 `WORKSHOP OPS` 和当前 V5 版本，不承担模块导航。
5. **身份条**：持续显示当前门店、角色和数据库用户，菜单提供退出登录而非任意改名。
6. **全局闭店摘要**：销售数据是唯一闭店门槛；完成闭店/重新打开只对 manager/admin 开放。
7. **当前版本说明**：摘要下方只展示当前版本，不做历史版本时间线。
8. **六个 LOOK**：KPI → 待取车辆 → 其它工作交接 → 维修交接 → 二手车台账 → 销售数据。
9. **操作记录与附件**：模块和记录均可查看审计；业务记录可打开私有图片附件。
10. **尾部运行状态**：显示当前用户、门店、角色、最后同步时间、闭店操作、日报菜单和当日日志。
11. **固定 LOOK Dock**：只做场景跳转和闭店状态提示，不复制业务主操作。

## Runtime truth

- PostgreSQL 是用户、门店、闭店、台账、审计、导入记录和附件元数据的唯一正式事实源。
- API 根据 HttpOnly Session、CSRF、门店成员关系和角色执行授权；客户端不能提供可信 actor、role 或业务日期。
- 服务端按门店时区计算业务日期，默认 `Asia/Shanghai`。
- 所有正式写入携带 Idempotency-Key；可并发编辑的对象使用 revision，冲突后刷新并让用户重新确认。
- 业务写入和审计事件在同一数据库事务中提交。
- 联系方式在服务端使用 AES-256-GCM 加密；取货码不持久化。
- Supabase Storage 对象保持私有；浏览器只接收对象级短期 signed upload/download URL，server-only Secret 不进入前端。

### Browser state

- Session Cookie 由浏览器管理但 JavaScript 不可读；CSRF Token 与当前门店 ID 只保存在运行时内存。
- 成功加载的数据库快照保存在 React 内存中，用于同步失败/离线后的只读展示。
- 页面聚焦时刷新；在线且页面可见时每 45 秒刷新；写入成功后立即刷新。
- 首次同步失败时只显示 `DATABASE UNAVAILABLE`，不以空台账冒充真实状态。
- 旧 localStorage v5 数据只在 manager/admin 打开迁移 Dialog 并确认后提交；它不是运行时事实源。

## Authentication and permission states

- 登录页必须同时要求用户名和密码，支持 Enter、自动填充、提交中、内联错误与 48px 主按钮。
- 登录错误使用通用文案，不暴露账号是否存在；连续失败可能触发短时锁定。
- Session 恢复期间显示 `VERIFYING SESSION`；业务数据同步期间显示 `SYNCING DATABASE`。
- 首次改密使用独立 gate，不能通过关闭 Dialog 绕过。
- 离线、同步错误、闭店锁定与角色限制都必须反映到写按钮状态；不能只依赖 Toast。
- operator 可以执行日常台账动作，但不能闭店/重开或导入旧数据。
- manager/admin 可闭店、重开和迁移；admin 额外拥有账号创建 API 权限。

## Closing requirement

- **唯一必需**：当天销售数据已保存。
- **闭店权限**：manager/admin。
- **非必需**：维修、待取、二手车和其它交接是否更新或完成。
- **闭店后**：全部业务写操作锁定；审计、附件查看、日志和复制报告仍可访问。
- **离线或数据库同步失败**：闭店按钮禁用，不允许基于过期快照完成闭店。

## Record lifecycle

### Resale

- 新增记录写入 `pending`，显示在黑底白字待上架区。
- “维修完毕”保留记录 ID，进入 `listed` 浅色在册区。
- “已售出”退出当前在册，操作历史与可撤回快照保留。

### Repair

- 字段：`contactType / contactValue / repairType / repairProject / pickupDate / status`。
- 联系方式类型只允许手机号或会员号；维修类型只允许质保、付费、免费、门店产品维修。
- 状态只允许维修中、等待配件、已开付款单、已开质保单。
- 质保、付费、免费维修必须选择日期；门店产品维修隐藏并清空日期。
- 门店产品维修完成后留在维修模块并当日标黑；下一服务端业务日自动清理。
- 其它维修完成后保留同一记录和完整维修字段，转入待取模块。

### Pickup

- 来源只允许 `self-pickup / repair / customer-storage`。
- 自提订单必须选择天猫、京东或小程序，说明正文保存为空。
- 顾客暂存必须填写说明。
- 通知状态 `pending / notified` 与维修状态独立。
- 非免费维修仅在已开付款单或已开质保单时通过取车校验；免费维修无需先改状态。
- 自提取货码只存在于当次确认请求，不显示在票据、附件或审计中。
- 取车成功后当日整条票据标黑；下一业务日清理当前台账。

### Other handover

- 只在真实完成时执行“完成”。
- 完成后当日标黑；下一业务日清理当前台账。

## Audit and undo

- 模块记录展示相关场景历史；对象记录只展示同一 entity 的历史。
- 记录显示操作时用户快照、动作摘要、业务日期、时间和撤回状态。
- 维修转待取事件同时属于维修和待取场景历史。
- 只有对象最近一次仍可安全恢复的可逆事件显示“撤回”。
- 撤回产生新的不可逆审计事件；跨日自动清理和附件增删不可作为普通业务撤回。
- 闭店时不显示撤回动作。

## Attachments

- 入口位于业务记录操作区，沿用同一按钮与 Dialog 语义。
- 上传前显示 JPEG/PNG/WebP、10 MB、每条最多 6 张的限制。
- 上传/删除必须具备明确 loading、success、error 状态。
- 图片 URL 为短期签名地址；过期后重新请求，不能长期缓存带签名 URL。
- 删除采用数据库软删除优先，Supabase Storage 清理失败不得让已删除记录重新显示。

## Legacy migration

- 入口只在 manager/admin 且浏览器检测到 v5 数据时出现。
- Dialog 明确说明：不会静默上传、会剥离取货码、旧本机数据不会自动删除。
- 先显示 accepted/rejected/day 数量，再允许确认导入。
- rejected 记录不进入数据库，不能用空值绕过新结构化字段。
- 迁移使用 source fingerprint 和服务端幂等逻辑，防止重复导入。

## Palette

- Ink `#08080A`
- Ink soft `#272729`
- Paper `#F4F5F0`
- Cool paper `#E7E9DE`
- Raised `#FFFFFF`
- Hairline `#C9CBC3`
- Hairline strong `#8B8D86`
- Muted `#62625E`
- Action blue `#075DFF`
- Critical `#B53B18`
- Success `#17613C`

高对比状态必须同时使用文字、图标或票据反转表达，不能只依赖颜色。

## Typography

- 拉丁、数字与英文 Display：本地 `Albert Sans Local`。
- 中文字形补全：本地 `Noto Serif SC Variable`。
- 不使用外链字体；字体文件由 Pages 静态托管。
- 刊头、KPI 与票据事实可使用 display weight；按钮、表单标签和操作说明保持紧凑、清晰、可扫描。
- KPI 与目录数字使用 tabular/lining numerals 与固定槽位。
- 长正文使用 `text-wrap: pretty`，避免窄屏孤行和溢出。

## Visual system

- 冷纸白、黑白高对比、硬边无圆角、移动全宽；桌面内容宽约 760px。
- 页面背景使用本地低对比纸张纹理；不覆盖 Dialog、黑色 KPI、图片和固定 Dock。
- 全页只保留一个黑色 KPI 强视觉，不把每个模块做成独立卡片。
- 业务对象使用连续票据和 1px 分隔线，不使用同构卡片网格或玻璃拟态。
- 每条票据左侧 Journal 标识是审计入口，不代表完成勾选。
- 二手车在同一 LOOK 内分为黑色待上架区与浅色在册区。
- 已取车、已完成交接和已完成门店维修整条反黑；重复写操作隐藏。
- 维修与维修来源待取共用服务票据骨架：标题带、跨栏说明、右侧日期、左下事实组、右下动作区。
- 通知状态是待取票据内联选择，不添加到维修票据。
- 身份、离线、同步与权限状态使用已有条带/票据语言，不引入独立 SaaS 式状态卡。

## Interaction

- 所有业务枚举使用 `ProjectSelect`，支持外部点按关闭、Escape、方向键、Home/End、选中态和焦点恢复。
- 日期继续使用原生日期控件。
- Dialog 使用原生 `<dialog>`，支持 Escape、焦点圈定/恢复和语义表单。
- 写操作成功后以 Toast 反馈并刷新数据库快照；失败时保留当前表单数据。
- revision conflict 需要显示明确冲突信息并刷新，不静默覆盖。
- 页面离线时显示常驻 banner；写按钮禁用，不能让用户完成后才收到错误。
- 复制报告只复制当前成功加载的数据库快照，并明确当前门店和用户。
- 退出登录撤销服务器 Session，即使网络失败也清除本地运行时会话。

## Accessibility

- WCAG 2.1 AA；正文、placeholder、状态文字均满足对比度要求。
- 全部触摸目标至少 44px；登录主按钮 48px。
- 提供 Skip Link、语义 heading、label、button、status/alert 和 `aria-live`。
- 加载、首次同步失败、离线、权限不足、空台账、提交中和删除确认均有可读状态。
- 键盘用户可以完成登录、改密、Dialog、ProjectSelect、审计撤回、附件与闭店流程。
- 支持 Forced Colors 与 200% 缩放，不允许横向页面溢出。

## Motion governance

- GSAP `3.13.0`：品牌开屏进入/退出和一次性页面内容编排。
- anime.js `4.5.0`：按钮按压反馈。
- Motion 只承担登录过渡、内容进入与即时反馈，不使用 ambient loop。
- 不动画布局属性；主要过渡 150–250ms，品牌开屏可更长但不得阻塞 reduced-motion 用户。
- `prefers-reduced-motion: reduce` 下跳过编排并立即展示可操作内容。

## Architecture

```text
apps/web/src/
  api/                    fetch、Cookie/CSRF 会话、业务与附件 API
  hooks/
    useAuth.js            Session 恢复、登录、改密、登出
    useRemoteClosingWorkflow.js
                          数据库 bootstrap、刷新、离线只读、revision 恢复
    useClosingWorkflow.js 仅用于旧 v5 迁移/规则回归参考
  components/
    dialogs/              KPI、维修/台账、取货码、审计、附件、迁移、菜单、闭店
    lookbook/             刊头、摘要、版本说明、连续票据、Dock
  data/                   展示配置、枚举、兼容映射、版本说明
  scenes/                 六个 LOOK 场景
  styles/                 tokens/base/layout/components/motion/responsive

apps/api/src/
  auth/                   Session、CSRF、密码与角色中间件
  routes/                 bootstrap、closing、work-items、audit、media、migrations
  services/               业务事务、幂等、旧数据导入与撤回恢复
  repositories/           数据库记录映射
  storage/                Supabase private Storage 签名、对象信息与真实摘要校验

packages/
  domain/                 共享业务规则
  contracts/              Zod 契约
  database/               PostgreSQL 连接与 migration runner
```

## Deployment design

- Staging 源码为 `develop`，EdgeOne 只监听 `edgeone-staging`；Production 源码为 `main`，EdgeOne 只监听 `edgeone-production`。
- 两个发布 Workflow 均仅手动触发；部署分支只允许普通快进，禁止 force push 和历史改写。
- 发布顺序：immutable source gate → tests/typecheck/build → checksum migration → deployment-branch fast-forward → EdgeOne Git deployment → Web/API/database/version/SHA/environment verify。
- EdgeOne build 只安装和构建，不执行 migration 或云资源变更。
- Production Workflow 必须验证 main HEAD、完整 release SHA、当前已部署并验收的 Staging SHA、祖先关系和源码一致性。
- Production release 同时需要 GitHub Environment 审批、显式 Production 批准、Free/no-billing 确认、加密导出和恢复演练确认。
- Workflow Secret 按 GitHub Environment 隔离；GitHub 只保存 migration-only URL，EdgeOne 保存运行时变量。
- Staging 与 Production 使用不同 Supabase Project 和 EdgeOne Project；不得复制 Production 数据到 Staging。
- 境外 npm、GitHub、EdgeOne 或 Supabase 不可达时停止并提示开启 VPN，不盲目重试。

## Version governance

- 当前版本：`V5.2.10`。
- 根 `package.json`、`apps/web/package.json`、`apps/web/src/data/releaseNotes.js` 与 `version-manifest.json` 必须一致。
- `pnpm version:patch -- ...` 递增 V5 版本并生成当前发布说明。
- 完成代码与文档后运行 `pnpm version:stamp`；`pnpm build` 先校验版本和源码/部署事实指纹。
- 指纹覆盖 Web/API/Packages、测试、migrations、Workflow、infra 配置与事实源文档；排除生成物、依赖、真实环境 state 和执行 receipt。

## Skill governance

- `design-taste-frontend`：保持反模板化 lookbook 语言。
- `impeccable`：生产状态、错误、性能、可访问性与信息层级。
- `shadcn-ui`：当前仅有目录条目；继续使用原生语义、Dialog、按钮状态和一致组件契约。
- `ui-ux-pro-max`：当前仅有目录条目；继续遵循移动触摸、色彩、排版与克制动效原则。
- `DESIGN.md` 是后续视觉、交互、状态和发布 UI 的事实源。
