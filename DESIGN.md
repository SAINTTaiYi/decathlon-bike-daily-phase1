# Design

## Direction

**Restrained Swiss workshop ledger for authenticated, database-backed bike operations.**

界面不是普通 Dashboard。它以瑞士网格、工业档案和编辑式留白组织真实运营任务：外层保留 Workshop Ledger 的黑白品牌语言，内层通过明确的信息层级让车型、工单、维修内容与业务事实快速可扫。不得改成蓝白企业后台，也不得用装饰取代业务密度和移动端可操作性。


## Next-generation visual target: WORKSHOP SIGNAL GRID

> **Status: implementation in progress.** Phases 1-5 are complete in the working source. Phase 6 now owns full-system quality validation before the single consolidated Preview review.

The complete specification and anti-interruption checkpoint ledger live in [`docs/WORKSHOP-SIGNAL-GRID.md`](docs/WORKSHOP-SIGNAL-GRID.md). That file is the canonical source for the future full-system redesign, phase plan, recovery state, validation evidence, blockers and next-action queue.

### Design read

WORKSHOP SIGNAL GRID is a full-system visual overhaul for authenticated, high-frequency store operations. It preserves routes, information architecture, business workflows, fields, permissions, audit semantics and data contracts while replacing the gray plus Falu Red foreground language with an original bright industrial signal system.

The intended balance is:

- Module entry and key-action zones behave like bold product posters.
- Records, forms, history and detailed reports behave like precise operational tools.
- Visual energy may borrow from Marathon's high-saturation flat composition and procedural product-design language, but no proprietary logos, fonts, icons, heraldry, characters, screenshots or recognisable compositions may be copied.

### Module color architecture

- Overview: Voltage Lime `#D7FF3F`
- Repair: Ion Cyan `#18D8FF`
- Pickup: Solar Yellow `#FFE247`
- Sales: Plasma Violet `#7657FF`
- Resale: Hot Magenta `#FF3D96`
- Closing: Blaze Orange `#FF5A24`
- History, account and settings: cool-white structure with inherited source-module signals
- Global danger: Signal Red `#F02D3A`
- Global success: dark structure plus bright Check
- Global locked state: graphite structure plus Lock and text
- Global synchronization: electric-blue border pulse, progress path and readable state text

The base canvas is bright cool-neutral rather than a global dark game HUD. Large vivid color fields are reserved for module headers, core KPI groups, primary action zones and selected priority records. Dense content and form surfaces remain bright and neutral. Color never acts as the sole status signal.

### Typography and geometry

- Ultra-condensed heavy Latin module names, oversized real numbers/codes and forceful heavy Chinese titles form the display layer.
- Chinese and English titles are dual-primary and compose into one offset, split or stacked graphic unit.
- Body copy, labels, controls and dense operational data retain a neutral, highly readable UI font.
- The geometry uses square frames, notches, diagonal cuts, nested outlines and interlocking color fields.
- Soft card radii, glassmorphism, decorative shadows, gradients and floating SaaS panels are not part of the target language.
- Visual depth comes from borders, overlap, cropping, scale and offset composition, not elevation shadows.

### Procedural graphics, media and icons

- Industrial coordinates, scales, work-order numbers and registration marks form the structural micrographic backbone.
- Pixel/dither and data textures appear only at visual peaks.
- Scan lines, waveforms, directional arrows and progress tracks appear only during real loading, synchronization and state changes.
- Photography is strongly graphic: high contrast, halftone/dither, duotone separation and hard asymmetric crops. Its duotone follows the active module color.
- Navigation and ordinary functions use one sharp engineering-outline icon family. Primary actions, semantic states and destructive actions use filled icons. Active controls may switch from outline to filled.

### Density, records and navigation

- Module entry and key-action areas use large titles, vivid fields and deliberate whitespace.
- Record lists, forms and dense data remain compact; mobile prioritizes completing the primary task within one screen where practical.
- Ordinary records use cool-white bodies with module signal framing, number zones and action color.
- Pending, abnormal or newest records receive larger local color fields.
- The actively operated record may temporarily intensify to its full module color.
- Desktop uses a numbered left-side module rail.
- Mobile retains a thumb-reachable segmented bottom Dock with identical ordering and semantics.

### KPI and motion

- Core KPI values use oversized number-led compositions.
- Trends, completion rates and exceptions use concise industrial scales, bars and progress tracks.
- Decorative gauges and invented precision are prohibited.
- Navigation and layout transitions use brief hard cuts and interlocking slide assemblies.
- Loading, synchronization and state transitions use restrained procedural signals.
- Existing business-completion pixel effects remain and will be rhythmically unified.
- Broad continuous ambient motion, scroll hijacking and task-disruptive parallax are prohibited.
- Native scroll, input stability and `prefers-reduced-motion` are mandatory.

### Coverage and implementation governance

The redesign covers login, setup, forced password change, overview, all business modules, permanent history, account/settings, Dialogs, forms and report exports. It is delivered in isolated phases with complete local verification, normal PR/CI and checkpoints. Intermediate phases do not deploy Preview; all phases converge into one final Preview for human acceptance. Staging requires a later explicit approval; Production remains forbidden.

After every completed phase or important verified step, update both:

1. `docs/WORKSHOP-SIGNAL-GRID.md`, including scope, decisions, files, commit/SHA, tests, deployment identity, blockers and next queue.
2. Long-term agent memory and the active session checkpoint.

This write-ahead checkpoint rule exists to survive network loss, context compaction and token limits. No runtime implementation may begin until the user explicitly authorizes Phase 1.


### Phase 1 runtime foundation mapping

> **Status: complete.** Phase 1 established the shared design foundations without changing any business rule, API, database contract or workflow.

- Primitive tokens: `apps/web/src/styles/signal-grid-primitives.css`
- Semantic tokens and module scopes: `apps/web/src/styles/signal-grid-semantic.css`
- Component tokens and runtime theme hooks: `apps/web/src/styles/signal-grid-components.css`
- Font faces and safe fallback policy: `apps/web/src/styles/signal-grid-fonts.css` plus `apps/web/public/fonts/SOURCES.md`
- Module and icon registry: `apps/web/src/design/signalGrid.js`
- Runtime scene-to-module mapping: `apps/web/src/data/lookbookScenes.js` and `data-signal-module` on the six scenes, closing summary and Dock controls
- Icon family: Iconoir only. Navigation and ordinary actions use regular outline icons at a standardized 1.75 stroke; active navigation, semantic status and destructive feedback use matching solid Iconoir variants.
- Typography state: Albert Sans Variable, Barlow Condensed 400/700/800/900 and Noto Sans SC Variable are verified, OFL-licensed and self-hosted. `SOURCES.md` records package provenance, tarball integrity and per-file SHA-256 manifests. The inactive Noto Serif SC assets were removed with explicit user approval.
- Other Handover: cool-white neutral structure with Voltage Lime only for numbering and operation signal, never a seventh module color.


### Phase 2 runtime shell mapping

> **Status: complete.** Phase 2 changed only the visual shell and navigation structure. Business actions, permissions, API calls, audit semantics and data contracts remain unchanged.

- Shared access structure: `apps/web/src/components/SignalAccessFrame.jsx`; login, first setup and forced password change use the same dark structure, Voltage Lime registration field and accessible form grammar.
- Access implementation: `BootLoader.jsx`, `InitialSetup.jsx` and `PasswordChangeGate.jsx`; labels, autofill, inline errors, busy states and password rules remain intact.
- Authenticated canvas: `.signal-workspace` and `.signal-workspace-canvas` in `apps/web/src/styles/signal-grid-shell.css`; the active shell is bright cool-neutral, flat and grid-registered, with no paper-fibre layers, elevation shell or continuous parallax.
- Navigation: the single `ActionDock.jsx` source renders a fixed numbered left module rail from `960px` upward and the same six modules as a thumb-reachable bottom Dock below `960px`.
- Overview: `PulseScene.jsx` uses one Voltage Lime core sales KPI, four real secondary metrics and a five-module signal map. It does not invent data or change the closing requirement.
- Motion: `useWorkspaceMotion.js` provides one short post-login hard-cut assembly with Skip/Escape/reduced-motion paths. `useMotionSystem.js` retains only immediate button press feedback. Active scene tracking uses `IntersectionObserver` rather than continuous scroll listeners.


### Phase 3 runtime core-module mapping

> **Status: complete.** Phase 3 replaces the core business-module foreground system without changing workflow handlers, permissions, API calls, D1 schema, audit events or data contracts.

- Shared module title and real metric strip: `LookbookPrimitives.jsx` and `SignalStateMark.jsx`; Repair, Pickup, Resale and Sales use their module field, bilingual title and real record/KPI counts.
- Shared record grammar: `RecordLedger.jsx` plus `signal-grid-modules.css`; ordinary rows remain cool-white, pending rows expand the module signal, the currently submitting row temporarily becomes the module color, errors use Signal Red, and completed rows use dark structure plus a bright Check.
- Shared state grammar: text, Iconoir state icon, border/fill and readable tone are always combined. Color is never the only signal.
- Sales KPI: the existing real `salesVehicles`, `safetyChecks`, `safetyModel`, `validReviews`, `usedSold` and `usedReceived` fields are recomposed into one Plasma Violet primary value and four dense neutral metrics.
- Closing: `ClosingSummary.jsx` retains the existing close/reopen/export behavior while exposing Blaze Orange status, actual readiness and the existing next-required action.
- Existing pickup fill and repair dissolve effects retain their business sequencing and reduced-motion behavior.

### Phase 4 runtime operations mapping

> **Status: complete.** Phase 4 unifies task-layer foregrounds and interaction states without changing any business rule, permission, API, D1 schema, audit contract or workflow handler.

- Native Dialog foundation: `apps/web/src/components/dialogs/AppDialog.jsx`; stable `useId()` labelling, Escape/backdrop close, focus restore and VisualViewport scrolling remain intact. Every task layer now declares a `data-signal-module` scope and a flat registration strip.
- Shared task state: `apps/web/src/components/SignalTaskState.jsx`; loading, error, success and empty states combine code, Iconoir icon, text, structure and `aria-live`. Loading motion collapses under `prefers-reduced-motion`.
- Task-layer styling: `apps/web/src/styles/signal-grid-operations.css`; module signal strips, square form controls, flat selectors, dense history rows, account management and destructive commitments consume the existing Phase 1 semantic/component tokens. No gradients, elevation shadows or new color tokens are introduced.
- Forms and selectors: `RecordEditorDialog.jsx`, `KpiDialog.jsx`, `PickupConfirmDialog.jsx`, `CreateUserDialog.jsx` and `ProjectSelect.jsx`; labels remain above controls, touch targets stay at least 44px, errors remain inline, and business field validation/wiring is unchanged.
- Permanent history: `PermanentHistoryDialog.jsx`; the module filter now uses the shared accessible ProjectSelect, queries clear stale results, and loading/error/empty/result-count states use the common task grammar.
- Account and settings: `MenuDialog.jsx`, `CreateUserDialog.jsx`, `LocalMigrationDialog.jsx` and `UpdateRefreshDialog.jsx`; current identity, role selection, migration review, update prompt, confirmation and generated-credential display use the same operational surface language.
- Attachments: `AttachmentDialog.jsx`; native `window.confirm` was replaced by an inline task-layer destructive confirmation while upload, private-media limits, API calls and permission locks remain unchanged.
- App-level gates: `App.jsx` and `AppErrorBoundary.jsx`; authentication verification, database synchronization, initial snapshot failure and fatal UI states use the same accessible loading/error grammar.

### Phase 5 runtime media and report mapping

> **Status: complete in the main source branch; final administrative checkpoint remains.** Phase 5 changes only media presentation, report composition and output-quality gates. Business data, report values, API calls, permissions, D1 and audit semantics remain unchanged.

- Preprocessed Overview media: `apps/web/public/images/workshop-head-signal-*.(avif|webp)`; six 480/800/1200 derivatives use build-time four-level ordered dither plus Dark Void and Voltage Lime duotone. `signal-media-manifest.json` locks dimensions, byte size and SHA-256.
- Responsive source: `MainHeadImage.jsx`; AVIF is preferred with WebP fallback, explicit intrinsic dimensions and no runtime hero grayscale/filter cost.
- Module-scoped private thumbnails: `AttachmentDialog.jsx` plus `signal-grid-media.css`; small previews inherit the record module color and static halftone treatment, while opening the signed original preserves the source image.
- Report renderer: `closingReportImage.js`; the summary uses Blaze Orange closing identity and Plasma Violet real sales KPI, while Pickup, Repair and Handover details return to flat cool-white tickets with module registration, explicit labels and high-contrast borders.
- Report resilience: `REPORT_OUTPUT_PROFILE` plus `tests/signal-grid-phase5.test.mjs` enforce color contrast, minimum post-compression text/rule size, AVIF/WebP integrity, representative Canvas rendering and structural grayscale readability. Server-confirmed close snapshots, self-pickup platform labels and dedicated contact slots remain unchanged.
- Report preview: `ReportImageDialog.jsx`; the task layer explains that color is reinforced by labels and structure and keeps the existing long-press/download paths.


## Product hierarchy

1. **首次初始化**：一次性 HTTPS Setup 链接创建首位管理员和门店；完成后链接失效。
2. **安全登录**：Signal Access 左侧品牌结构与右侧数据库账号表单组成统一入口；登录成功后通过短促硬切进入工作台。
3. **强制改密**：管理员创建的临时密码账号在改密前不能访问业务数据。
4. **顶部系统刊头**：以 `WORKSHOP SIGNAL GRID / WORKSHOP OPS / 门店作业信号系统 / V5` 建立品牌和运行状态，不复制模块导航。
5. **身份条**：持续显示当前门店、角色和数据库用户，菜单提供退出登录而非任意改名。
6. **全局闭店摘要**：销售数据是唯一闭店门槛；所有已登录用户可以完成闭店，只有 manager/admin 可以重新打开。
7. **当前版本说明**：摘要下方只展示当前版本，不做历史版本时间线。
8. **六个业务模块**：总览 → 待取 → 其它 → 维修 → 二手 → 销售；桌面左侧编号轨道与移动底部 Dock 使用相同顺序和语义。
9. **操作记录与附件**：模块和记录均可查看审计；业务记录可打开私有图片附件。
10. **尾部运行状态**：显示当前用户、门店、角色、最后同步时间、闭店操作、日报菜单和当日日志。
11. **响应式模块导航**：桌面固定左侧轨道，移动固定底部 Dock；只做场景跳转和闭店状态提示，不复制业务主操作。

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
- operator 可以执行日常台账动作和完成闭店，但不能重新打开闭店或导入旧数据。
- manager/admin 可完成闭店、重新打开和迁移；admin 额外拥有账号创建 API 权限。

## Closing requirement

- **唯一必需**：当天销售数据已保存。
- **闭店权限**：所有已登录用户可以完成闭店；重新打开仅 manager/admin。
- **非必需**：维修、待取、二手车和其它交接是否更新或完成。
- **闭店后**：全部业务写操作锁定；审计、附件查看、日志和复制报告仍可访问。
- **离线或数据库同步失败**：闭店按钮禁用，不允许基于过期快照完成闭店。

## Record lifecycle

### Resale

- 新增记录写入 `pending`，在 Hot Magenta 模块中以扩大局部信号色的待上架队列表达。
- “维修完毕”保留记录 ID，进入 `listed` 浅色在册区。
- “已售出”退出当前在册，操作历史与可撤回快照保留。

### Repair

- 字段：`contactType / contactValue / repairType / repairProject / pickupDate / status`。
- 联系方式类型只允许手机号或会员号；维修类型只允许质保、付费、免费、门店产品维修。
- 用户可选状态只允许维修中、等待配件、已开付款单、已开质保单；执行“维修完毕”后系统写入“维修完成”。
- 质保、付费、免费维修必须选择日期；门店产品维修隐藏并清空日期。
- 门店产品维修完成后留在维修模块并当日标黑；下一服务端业务日自动清理。
- 其它维修完成后保留同一记录和完整维修字段，以工作项“维修完成”状态转入待取模块；内部维修状态继续保持数据库允许值。

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

### Background continuity

页面、工作台、纸张材质、Dialog 与报告导出的既有背景色保持不变。此次只重构前景 UI 的字体、图标、按钮、标签、胶囊、组件边界、焦点与状态反馈，不能借由改底色制造新主题。

### Foreground system

- Dark Void `#141616`：主文字、深色票据、完成状态文字与高对比符号。
- Iridium `#3D3C38`：次级正文、进行中胶囊的实底与深色组件层次。
- Artillery `#746D67`：弱化文字、常规边界、待处理状态轮廓。
- Equilibrium `#A49F9D`：完成状态胶囊实底、深色面上的文字与弱层级承托。
- Falu Red `#7F1D1A`：唯一暖色强调，主业务操作的红描边和低饱和红底，以及删除、错误、不可逆操作的强化危险反馈。

### Action and status rules

- 主要业务按钮不使用实心红：使用低饱和 Falu Red 填充、Falu Red 描边和深红文字；dark ticket 内使用同一语义的低亮度红承托。
- 删除和不可逆确认使用更强的实心 Falu Red，并必须有明确危险文案或 Warning 图标；不与普通业务主操作混淆。
- 待处理：Artillery 轮廓配 Iridium 文字和透明底，保证小字号状态文案在不改动纸张背景的前提下达到可读对比度。
- 进行中：Iridium 实底配 Equilibrium 文字；状态文案保留。
- 已完成：Equilibrium 实底配 Dark Void 文字和 Check 图标。
- 旧绿、黄、蓝语义状态全部退役。高对比状态必须同时使用文字、图标、填充或票据反转表达，不能只依赖颜色。

## Typography

- 拉丁 UI 与数字：本地 `Albert Sans Local`。
- 英文模块标题、刊头与大号代码：本地 `Barlow Condensed Local`。
- 中文 UI 与标题回退：本地 `Noto Sans SC Variable` Unicode 分片。
- 不使用外链字体；字体文件由 Worker Static Assets 静态托管，来源、许可证、包完整性和逐文件 SHA-256 记录在 `apps/web/public/fonts/SOURCES.md`。
- 刊头、KPI 与票据事实可使用 display weight；按钮、表单标签和操作说明保持紧凑、清晰、可扫描。
- KPI 与目录数字使用 tabular/lining numerals 与固定槽位。
- 长正文使用 `text-wrap: pretty`，避免窄屏孤行和溢出。

## Visual system

- 冷纸白、黑白高对比、硬边无圆角、移动全宽；桌面内容宽约 960px，长行内容仍受局部列宽控制。
- 仅登录后的主工作台使用 `#EFEEEC` 旧纸底色：4.5% 胶片颗粒、2.6% 纸纤维和 1.6% 极浅灰划痕由固定、`pointer-events: none` 的独立背景层叠加。登录、改密、初始设置、Dialog、表单与日报导出不继承该材质。
- 主工作台的刊头、模块标题、摘要标题、票据车型标题和图片标题使用低对比、不规则的印刷磨损纹理；始终保留实心 Ink 回退与 Forced Colors 的纯色文字，不能降低业务文本可扫性。
- 全页只保留一个黑色 KPI 强视觉，不把每个模块做成独立卡片。
- 业务对象使用连续票据和 1px 分隔线，不使用同构卡片网格或玻璃拟态。每条票据固定三级层级：车型与工单号为一级；Maintenance 项目列表为二级；联系方式、日期、来源、支付/类型和状态为三级。
- 每条票据左侧 Journal 标识是审计入口，不代表完成勾选。
- 二手车在同一模块内分为 Hot Magenta 待上架信号区与冷白已上架在册区。
- 已取车、已完成交接和已完成门店维修整条反黑；重复写操作隐藏。
- 维修与维修来源待取共用服务票据骨架：车型最大，工单号紧随其下；维修项目按换行、加号、分号或顿号拆分；事实组使用约 70% 黑度；动作区独立置底。
- 通知状态是待取票据内联选择，不添加到维修票据。D1 为每条 work item 分配门店内稳定递增的 `ticketNo`，前端统一显示为六位 `#000031` 格式。
- 身份、离线、同步与权限状态使用已有条带/票据语言，不引入独立 SaaS 式状态卡。

## Interaction

- 所有业务枚举使用 `ProjectSelect`，支持外部点按关闭、Escape、方向键、Home/End、选中态和焦点恢复。
- 日期继续使用原生日期控件。
- Dialog 使用原生 `<dialog>`，支持 Escape、焦点圈定/恢复、动态可视视口内滚动和语义表单。
- 固定 LOOK Dock、Toast 与页面底部内容必须避开动态浏览器操作底栏和系统安全区。
- 写操作成功后以 Toast 反馈并刷新数据库快照；失败时保留当前表单数据。
- revision conflict 需要显示明确冲突信息并刷新，不静默覆盖。
- 页面离线时显示常驻 banner；写按钮禁用，不能让用户完成后才收到错误。
- 复制报告只复制当前成功加载的数据库快照，并明确当前门店和用户。
- 导出日报图中，自提订单的手机号或会员号只显示在联系槽位，不得回退到详情列表；自提标识继续占用取车时间位置。
- 退出登录撤销服务器 Session，即使网络失败也清除本地运行时会话。

## Accessibility

- WCAG 2.1 AA；正文、placeholder、状态文字均满足对比度要求。
- 全部触摸目标至少 44px；登录主按钮 48px。
- 提供 Skip Link、语义 heading、label、button、status/alert 和 `aria-live`。
- 加载、首次同步失败、离线、权限不足、空台账、提交中和删除确认均有可读状态。
- 键盘用户可以完成登录、改密、Dialog、ProjectSelect、审计撤回、附件与闭店流程。
- 支持 Forced Colors 与 200% 缩放，不允许横向页面溢出。

## Motion governance

- GSAP `3.13.0` only owns the short access exit and one-time post-login shell assembly.
- anime.js `4.5.0` owns immediate button press feedback.
- Product transitions target 80-340ms and communicate navigation, feedback or state. Broad ambient animation is prohibited.
- The Phase 2 shell contains no ScrollTrigger, scroll listener, pointer tilt, perspective, translateZ, blur reveal or continuous parallax.
- Active module tracking uses `IntersectionObserver`; native scrolling remains untouched.
- The post-login assembly runs only after a real login and hydrated data. Session restore opens directly into the workspace. Skip button, backdrop click and Escape complete the sequence immediately and focus the main content.
- `prefers-reduced-motion: reduce` collapses the assembly to an immediate handoff and retains static, readable content.
- Existing business completion pixels and swipe-delete feedback remain scoped to their actions until later phases unify their rhythm. They never transform the scroll-bearing shell.

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

- 当前版本：`V5.8.2`。
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
