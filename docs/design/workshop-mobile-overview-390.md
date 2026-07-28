# Workshop 移动端总览首屏高还原设计方案

> 状态：已确认，作为实现与 Preview 验收基线  
> 基准视口：`390 × 844 CSS px`  
> 响应式范围：`360–430 CSS px`  
> 目标仓库：`SAINTTaiYi/decathlon-bike-daily-phase1`  
> 目标页面：Workshop 移动端总览（现有 `pulse` 场景）  
> 设计来源：用户提供的首屏效果图

## 1. 目标与边界

在不改变 Workshop 核心业务规则的前提下，将移动端总览重构为“工业操作面板 + 纸质业务台账”界面：

- 在 `390 × 844px` 上高还原模块位置、比例、排版、间距和视觉层级；
- 适配 `360–430px`，禁止整页等比缩放；
- 顶部页头处于普通文档流并随内容滚动；
- 底部六项导航固定；
- 效果图演示数据全部映射为真实动态业务字段；
- 保留现有 API、权限、数据写入、闭店规则与核心业务流程。

允许调整：信息架构、卡片布局、视觉样式、导航入口、点按反馈、加载/空/错误/权限状态。  
不允许调整：API 契约、权限判断、闭店事务、业务状态转换、数据真实性。接口错误、未水合或无权限不得显示成业务数字 `0`。

效果图中的手机系统状态栏（时间、VPN、信号、电量）不属于网页，不实现。

## 2. 设计语言

风格关键词：工业操作面板、纸质台账、维修工单、黑白黄高对比、高密度但有秩序。

- 黑、暖白、黄色三色体系；
- 细边框、硬切分、近直角；
- 英文窄体标题与大号等宽数字；
- 中文解释业务，英文建立模块分类；
- 黑色面板承载重量级摘要；
- 黄色仅用于状态、编号、进度、当前导航和主行动；
- 车辆工程线稿作为唯一强视觉记忆点；
- 禁止玻璃拟态、渐变大背景、大圆角、重阴影和过量黄色。

信息优先级：闭店要求 → 销售 KPI → 台账待办 → 待取车辆 → 门店/用户/日期/版本 → 快速入口。

## 3. 页面几何

### 3.1 坐标系

- 基准：`390 × 844px`；
- 页面左右边距：`12px`；
- 主内容宽：`366px`；
- 最大设计宽：`430px`，更宽时居中；
- 所有尺寸为 CSS 像素，不使用截图缩放。

### 3.2 基准纵向位置

| 模块 | 顶部 Y | 高度 | 底部 Y | 上间距 |
|---|---:|---:|---:|---:|
| 品牌页头 | 0 | 48 | 48 | 0 |
| 门店上下文卡 | 48 | 50 | 98 | 0 |
| 闭店状态卡 | 107 | 152 | 259 | 9 |
| 销售车辆面板 | 269 | 196 | 465 | 10 |
| 业务台账索引 | 475 | 124 | 599 | 10 |
| 待取车辆看板 | 608 | 105 | 713 | 9 |
| 版本公告条 | 720 | 23 | 743 | 7 |
| 固定底部导航 | 786 | 58 | 844 | 固定 |

文档结构：

```text
WorkshopOverviewPage
├── ScrollDocument
│   ├── BrandHeader
│   ├── StoreContextCard
│   ├── ClosingStatusCard
│   ├── SalesVehiclesPanel
│   ├── OperationsIndex
│   ├── PickupBoard
│   └── ReleaseStrip
└── FixedBottomNavigation
```

文档底部增加 `58px + env(safe-area-inset-bottom) + 8px` 遮挡补偿。短屏自然滚动，不压扁卡片、不隐藏字段、不用 `transform: scale()`。

允许误差：主容器位置 `±2px`，容器高度 `±3px`，间距 `±2px`，字体基线 `±2px`，字号 `±1px`，图标 `±2px`。

## 4. 全局令牌

### 4.1 颜色

| Token | 值 | 用途 |
|---|---|---|
| `--ops-page` | `#F4F3EE` | 页面暖白背景 |
| `--ops-card` | `#FAFAF7` | 白色卡片 |
| `--ops-black` | `#0C0E0C` | 黑色主面板 |
| `--ops-text` | `#0A0B0A` | 主文字 |
| `--ops-text-muted` | `#55554F` | 次级说明 |
| `--ops-text-inverse` | `#F6F5EF` | 黑底文字 |
| `--ops-yellow` | `#FFC31A` | 主强调 |
| `--ops-yellow-pressed` | `#E7A900` | 黄色按下态 |
| `--ops-border` | `#D6D5CF` | 卡片边框 |
| `--ops-border-strong` | `#B9B8B1` | 强分隔 |
| `--ops-danger` | `#C63B2E` | 阻断/错误 |
| `--ops-success` | `#17613C` | 完成 |

颜色不是唯一状态信号；错误、完成、无权限必须同时有文字或图标。

### 4.2 字体

英文标题与数字建议自托管 `Barlow Condensed`，普通英文使用 `Barlow`，数字启用 `font-variant-numeric: tabular-nums`。

```css
font-family: "Barlow Condensed", "Arial Narrow", "Roboto Condensed", Arial, sans-serif;
```

中文：

```css
font-family: "Noto Sans SC", "Source Han Sans SC", "PingFang SC",
  "Hiragino Sans GB", "Microsoft YaHei", sans-serif;
```

业务正文不低于 `11px`，辅助信息不低于 `9px`，底部英文不低于 `8px`。字体自托管并提供 fallback。

### 4.3 边框、圆角、阴影

- 主模块 `1px solid var(--ops-border)`；
- 内部分隔线 `1px solid #E2E1DB`；
- 黄色强调线 `3px`；
- 圆角 `0–2px`；
- 默认无阴影；底栏最多使用 `0 -2px 8px rgba(0,0,0,.04)`。

## 5. 组件规格

### 5.1 `BrandHeader`

- `x:14; y:0; width:362; height:48px`；无边框、垂直居中；
- 结构：`[菜单] [WORKSHOP LEDGER / WORKSHOP OPS / 版本] [营业日期] [通知]`。

菜单：视觉 `18 × 16px`，三线高 `2px`、长 `17px`、间距 `5px`；触控至少 `44 × 44px`。  
品牌：小字 `9/10px`、500；主标题 `22/22px`、窄体 750、字距 `-0.3px`。  
版本：高 `18px`、最小宽 `36px`、黄色底、`10px`、700，读取真实 `APP_VERSION`；Preview-only 不提升版本号。  
日期：`11px`、600、等宽，显示 `workflow.dateKey` 对应营业日；仅有切换能力时显示下拉箭头。  
通知：铃铛 `18 × 20px`，触控 `44 × 44px`，未读用 `5–6px` 黄色点。

按下反馈 `80–120ms`，透明度变化并缩放至 `0.96`。

### 5.2 `StoreContextCard`

- `x:12; width:366; height:50px`；暖白底、`1px` 边框；
- 左身份区约 `220px`，右菜单块约 `136px`，间隔约 `8px`。

左侧：第一行 `门店 · 角色`，`11/14px`、600；第二行用户，`18/20px`、窄体 700；长文本单行省略。映射 `currentStore.storeName`、`roleLabels[role]`、`auth.user.displayName`。

右侧：约 `136 × 36px` 黑底；黄色文档图标 `18 × 22px`；“菜单” `11px`、“MENU” `9px`；右箭头 `8 × 14px`；整块可点。按下时背景 `#191B18`、箭头右移 `2px`、`120ms`。

### 5.3 `ClosingStatusCard`

最高优先级任务卡：`x:12; width:366; height:152px`；上间距 `9px`；白底、灰边框、顶部 `3px` 黄色线。

上半区约 `94px`，三列：

- 标题：左 `13px`、顶 `14px`；`Daily closing` 为 `10px`；`CLOSING / STATUS` 两行 `27–29px`、行高 `24–26px`、窄体 750；
- 圆环：直径 `70px`、线宽 `1.5–2px`；浅灰轨道、黄色进度、12 点起点；数字 `32px`、百分号 `10px`；现规则 `kpiReady=false → 0%`，`true → 100%`；接口错误/未水合显示 `—`；
- 说明：约 `110px` 宽，`11/18px`；未完成说明销售数据为唯一闭店要求，完成后说明可闭店，已闭店显示完成时间，异常明确说明无法判断。

下半区约 `54px`，顶部有内缩 `13px` 分隔线：

- 黄色时钟约 `21px`；
- `NEXT / 唯一要求` 为 `8px`；
- 主标题 `13px`、700；说明 `9px`；
- 主按钮约 `120 × 28px`，黄色底、`12px`、700、右箭头；
- 文案按状态为“填写数据 / 检查闭店 / 查看记录 / 处理异常”；
- 调用现有 KPI 编辑、闭店确认或历史记录，不创建平行业务流程。

### 5.4 `SalesVehiclesPanel`

- `x:12; width:366; height:196px`；上间距 `10px`；上黑下白、灰边框。

黑色主区高约 `111px`：黄色方块 `7 × 7px` + `SALES VEHICLES`（`10px`）；中文状态 `10/14px`；销售车辆数字 `62–66px`、黄色、窄体 700、等宽，映射 `kpi.salesVehicles`；日期右上 `10px`，映射 `workflow.dateKey`；不可用显示 `—`。

车辆线稿位于右半部，约 `148 × 75px`，灰白描边、透明度 `30–40%`，配黄色 `UNIT`。素材必须原创或合规开源、自托管，记录来源、许可证、用途与 SHA，不热链、不使用专有品牌图纸，装饰时 `aria-hidden="true"`。

下半区四列等宽：

1. 安全检查开单 → `kpi.safetyChecks`；
2. 顾客有效评价 → `kpi.validReviews`；
3. 销售二手车 → `kpi.usedSold`；
4. 收二手车 → `kpi.usedReceived`。

每列包含黄色编号 `01–04`（`9px`）、图标 `18–21px`、中文 `9–10px`、英文 `8px`、数值 `24px`。数字基线一致，列间 `1px` 竖线。3 位降至 `21px`，4 位以上 `18px`，不截断。整列可点；无独立详情时进入现有 KPI 编辑。

### 5.5 `OperationsIndex`

- `x:12; width:366; height:124px`；上间距 `10px`；白底、灰边框；
- 标题行高 `38px`：左 `OPERATIONS INDEX · 业务台账`（`10px`），右动态摘要（`9px`）；
- 摘要优先级：同步异常 → 销售数据待填写 → 可闭店 → 已闭店 → 无待办。

五列入口：Pickup、Other、Repair、Used、Sales。每列约 `73px`，黄色序号 `02–06`，英文 `10px`，中文 `8–9px`，状态 `8px`，数值 `23px`，底部箭头。数据来自对应 `recordsByScene`；Sales 按状态显示 `DUE / READY / DONE / ERROR / —`。整列可点并调用现有 `jumpTo(sceneId)`。

### 5.6 `PickupBoard`

- `x:12; width:366; height:105px`；上间距 `9px`；白底、灰边框；
- 标题栏约 `25px`：黑色编号块 `29 × 20px`、黄色 `02`；标题 `14px`；中文 `9px`；`VIEW ALL` 视觉高 `18px`、触控至少 `44px`。

内容为前三条车辆卡 + 新增卡：

```css
grid-template-columns: repeat(4, minmax(0, 1fr));
```

内边距 `8px`、列间距 `7px`；卡片约 `82–85 × 70px`。展示真实车辆标题/车牌、联系人、预约时间和状态；缺失字段使用已有真实替代字段，不虚构。更多菜单触控至少 `32 × 32px`。

新增卡仅在有创建权限、未闭店、在线且无存储错误时可用，调用现有待取编辑流程。超过三条仍显示前三条 + 新增，`VIEW ALL` 跳转完整 Pickup 场景，不做横向拖动。

### 5.7 `ReleaseStrip`

- `x:12; width:366; height:23px`；上间距 `7px`；白底、灰边框；
- 黄色版本块高 `15px`、最小宽 `35px`、`9px`；读取 `APP_VERSION`；
- 更新摘要 `9px`，日期 `8px`；
- 右侧入口打开现有 `ReleaseNotes`；若保留加号，提供“查看更新说明”可访问名称。

### 5.8 `BottomNavigation`

固定底部，视觉高 `58px`，另加 `env(safe-area-inset-bottom)`；暖白背景、顶边框、最大宽 `430px`、六列等宽。不保留独立 `OPEN/CLOSED` 尾部列。

1. 总览 / OVERVIEW；
2. 待取 / PENDING；
3. 其它 / OTHER；
4. 维修 / REPAIR；
5. 二手 / USED；
6. 销售 / SALES。

图标 `19–21px`，中文 `9px`，英文 `8px`。活跃项黑底、黄色图标和中文、浅色英文；非活跃项暖白底、黑图标、灰英文。切换 `120–160ms`，保留门店和营业日上下文。

## 6. 图标与素材

- 统一线性图标，线宽 `1.5–1.8px`；
- 优先复用现有 `iconoir-react`；
- 白底黑色，黑底白色或黄色；
- 不混用填充式、卡通式和多色图标；
- 车辆线稿不使用复杂 CSS 强行模拟，必须自托管并具备来源/许可证/SHA 记录。

## 7. 动态数据与状态

| 视觉字段 | 真实来源 |
|---|---|
| 门店 | `currentStore.storeName` |
| 角色 | `roleLabels[currentStore.role]` |
| 用户 | `auth.user.displayName` |
| 日期 | `workflow.dateKey` |
| 闭店完成度 | 当前规则由 `kpiReady` 决定 |
| 销售 KPI | `workflow.kpi.*` |
| 台账数量 | 对应 `recordsByScene` |
| 销售状态 | `kpiReady / closedAt / storageError` |
| 待取卡 | 当前门店真实 Pickup 记录 |
| 版本 | `APP_VERSION` 与当前 release notes |

每个动态模块覆盖：加载、有数据、真零值、空数据、接口错误、无权限、部分数据不可用、离线、存储同步错误、已闭店写锁。

- 加载：保留尺寸，使用低对比骨架，大数字显示 `—`；
- 空状态：明确说明，并保留有权限的创建/查看入口；
- 错误：明确提示并局部重试；最后成功数据需标更新时间；
- 权限：沿用 `role`、`closedAt`、`online`、`workflow.storageError` 和 `writeLocked`，不可绕过。

## 8. 交互、动效与可访问性

- 首选触控区 `44 × 44px`，密集卡片最低 `36 × 36px`；
- 更多菜单不能只让三个点本身可点；
- 闭店圆环动画 `500–700ms`，`cubic-bezier(.2,.8,.2,1)`；
- 黄色主按钮按下时背景加深、箭头右移 `2px`、缩放 `0.985`，`100–140ms`；
- 其他交互仅用背景、透明度和 `1px` 位移；
- 禁止弹簧、重阴影、连续闪烁和车辆线稿循环运动；
- `prefers-reduced-motion: reduce` 下直接显示终态；
- 所有入口使用真实 `button` 或 `a`，焦点可见，当前导航使用 `aria-current="page"`；
- 图标不能是唯一标签，颜色不能是唯一状态信号；
- 200% 文本缩放仍能完成核心操作，页面无横向滚动。

## 9. 响应式

### `360–374px`

边距 `10px`；品牌标题可降至 `20px`；日期简化为 `MM / DD 周X`；菜单块缩至约 `124px`；闭店说明最多两行；销售 KPI 保持四列；中文不低于 `9px`；台账保持五列，不改为横向滚动。

### `375–399px`

使用 390px 基准比例，按可用宽度自然分配，不改变结构。

### `400–430px`

边距 `14px`；不整体放大文字；额外宽度分配给说明、车辆卡和标题间距；卡片高度保持，大数字最多增加 `2px`。

低于 `760px` 高度时自然滚动，不压缩模块；横屏保持最大宽 `430px` 并居中，本阶段不改桌面双栏。

## 10. 现有代码映射

- 页面装配：`apps/web/src/App.jsx`；
- 总览：`apps/web/src/scenes/PulseScene.jsx`；
- 底栏：`apps/web/src/components/lookbook/ActionDock.jsx`；
- 页头：`apps/web/src/components/lookbook/LookbookHeader.jsx`；
- 闭店摘要：`apps/web/src/components/lookbook/ClosingSummary.jsx`；
- 场景定义：`apps/web/src/data/lookbookScenes.js`；
- 业务配置：`apps/web/src/data/operationsData.js`；
- 工作流：`apps/web/src/hooks/useRemoteClosingWorkflow.js`；
- 样式：`apps/web/src/styles/*.css`。

推荐组件树：

```text
WorkshopOverviewPage
├── BrandHeader
├── StoreContextCard
├── ClosingStatusCard
├── SalesVehiclesPanel
├── OperationsIndex
├── PickupBoard
├── ReleaseStrip
└── BottomNavigation
```

复用现有 `workflow`、`auth`、对话框和处理函数；首页只汇总与导航，不复制业务规则；不硬编码门店、姓名、车牌、时间或版本；不改变 API 请求顺序与事务边界。

## 11. 实施阶段

1. **结构与数据映射**：建立组件边界，映射 `auth/workflow/records/kpi/closedAt`，保留菜单、KPI、闭店、历史和场景跳转。
2. **视觉系统**：落地字体、黑白黄令牌、390px 网格、边框、车辆 SVG 和固定底栏。
3. **响应式与交互**：验证 `360/375/390/412/430px`、短屏、安全区、按下态和 reduced-motion。
4. **测试与 Preview**：运行测试、typecheck、构建、工作流门禁和修改后 CodeGraph；提交独立分支、创建 PR、部署并独立核验 Preview；等待人工验收，不部署 Production。

## 12. 验收清单

### 视觉

- [ ] 不包含系统状态栏；左右边距约 `12px`；
- [ ] 主卡片左右对齐；
- [ ] 门店卡右侧为黑色菜单块；
- [ ] 闭店卡是首要任务卡，`CLOSING STATUS` 为两行窄体；
- [ ] 圆环位于标题和说明之间，黄色主按钮位于下半区右侧；
- [ ] 销售面板上黑下白，黄色数字与车辆线稿平衡；
- [ ] 四项 KPI 数字基线一致；
- [ ] 台账索引保持五列；
- [ ] 待取看板显示前三项与新增；
- [ ] 版本公告为细条；
- [ ] 底部导航固定，当前项黑底；最后内容不被遮挡。

### 响应式与业务

- [ ] `360/375/390/412/430px` 无横向溢出；
- [ ] 所有数字来自真实数据；
- [ ] 门店、角色、日期和用户正确；
- [ ] 接口错误不显示为零；
- [ ] 闭店资格、离线锁、存储错误和权限与原系统一致；
- [ ] 各卡片跳转正确，返回后保留上下文；
- [ ] 创建、编辑、历史和闭店对话框继续工作。

### 可访问性与性能

- [ ] 按钮可键盘操作且焦点可见；
- [ ] 图标有文字或可访问名称；
- [ ] reduced-motion 生效；
- [ ] 200% 文本缩放可完成核心操作；
- [ ] 字体与车辆素材自托管；
- [ ] 首屏无明显布局跳动；
- [ ] 不引入无必要的大体积动画或图片。

## 13. 最终原则

该首屏不是普通圆角 SaaS 首页。黑色代表重量级业务总览和当前导航，黄色代表状态、编号、进度与下一行动，暖白承载业务台账，窄体大数字用于快速经营判断，细边框与网格建立秩序。

必须避免：整页缩放、硬编码演示数据、错误显示为零、过度使用黄色、来源不明的车辆图纸、忽略权限/错误/空状态、过小触控范围，以及 Preview 未验收就部署 Production。

本文件是 Workshop 移动端总览重构的正式设计、实现和 Preview 验收基线。
