# Workshop 首屏参考图分析与响应式设计规格

> 状态：设计事实源候选（仅文档，不代表已实施）  
> 日期：2026-07-29  
> 基线：`feature/cloudflare-workers-d1` / `3c0f7b31466dba3c146164d368e08ec4a05a1bfc` / V5.7.9  
> 参考图：用户提供的生成效果图，`852 × 1705 px`  
> 适用范围：Workshop 登录后的业务总览首屏，手机优先，同时覆盖平板与桌面  
> 发布边界：本文件不修改代码、数据、版本、工作流或任何部署环境

## 1. 结论

参考图应解释为一张约以 `devicePixelRatio = 2` 导出的手机页面：

- 图像像素：`852 × 1705 px`。
- 对应基准 CSS 视口：约 `426 × 852.5 CSS px`。
- 基准内容轨道：约 `390 CSS px`，左右各 `18 CSS px`。
- 页面不是桌面缩窄截图，也不应把图中尺寸按 `852 CSS px` 实现。
- 手机端保持纵向单列、固定底部六项 Dock、黑白工业台账与黄色状态强调。
- 平板和桌面允许卡片重排，但信息顺序必须继续是：身份与日期 → 闭店状态 → 销售 KPI → 业务入口 → 待取车辆。
- 所有数字、日期、门店、身份与状态必须来自现有 Workshop 数据；参考图中的 `00`、门店、Profile 和日期只表达版式，不是固定内容。

“忠实还原”指还原视觉构图、层级、密度、锚点与黑白黄关系，不包括复制造成错误语义的生成瑕疵。

## 2. 证据与测量方法

### 2.1 测量规则

- 下表的图像坐标以左上角为 `(0, 0)`，单位为原图像素。
- CSS 坐标按原图数值除以 `2` 推导。
- 由于原图存在生成模糊、透视和抗锯齿，边界测量容差为原图 `±4 px`，即 CSS `±2 px`。
- 文本字形宽度不作为绝对坐标事实；实现时以指定容器、字号、行高和溢出规则为准。

### 2.2 一级区域锚点

| 区域 | 原图边界（约） | 基准 CSS 边界（约） | 视觉作用 |
| --- | --- | --- | --- |
| 整体画布 | `0, 0, 852, 1705` | `0, 0, 426, 852.5` | 手机首屏视口 |
| 主内容轨道 | `x=36..816` | `x=18..408`，宽 `390` | 所有卡片共用左、右基线 |
| 品牌顶栏 | `x=42, y=28, w=772, h=80` | `x=21, y=14, w=386, h=40` | 菜单、品牌、版本、日期、通知 |
| 门店身份区 | `x=64, y=160, w=744, h=96` | `x=32, y=80, w=372, h=48` | 门店/角色/Profile 与菜单入口 |
| 闭店状态卡 | `x=37, y=289, w=777, h=340` | `x=18.5, y=144.5, w=388.5, h=170` | 首要业务状态与唯一闭店动作 |
| 销售 KPI 卡 | `x=37, y=647, w=777, h=427` | `x=18.5, y=323.5, w=388.5, h=213.5` | 销售主数字与四项 KPI |
| 业务台账索引 | `x=37, y=1092, w=777, h=260` | `x=18.5, y=546, w=388.5, h=130` | 五个业务模块入口 |
| 待取车辆面板 | `x=37, y=1371, w=777, h≈240` | `x=18.5, y=685.5, w=388.5, h≈120` | 最多三条待取记录与新增入口 |
| 固定底部 Dock | `x=0, y=1590, w=852, h=115` | `x=0, y=795, w=426, h=57.5` | 六个全局业务场景 |

### 2.3 垂直节奏

基准 `426 px` 宽视口采用以下节奏：

| 关系 | 建议 CSS 值 | 参考效果 |
| --- | ---: | --- |
| 视口顶部到顶栏 | `14 px + env(safe-area-inset-top)` | 内容不贴系统状态区 |
| 顶栏高度 | `40–44 px`，按钮命中区 `44 px` | 视觉紧凑但可触摸 |
| 顶栏到门店身份区 | `24–28 px` | 形成品牌与业务上下文的分组 |
| 身份区高度 | `48–52 px` | 左侧身份、右侧菜单同层 |
| 身份区到闭店卡 | `14–16 px` | 闭店卡成为首个主内容 |
| 主卡之间 | `9–10 px` | 保持连续业务看板节奏 |
| Pickup 到展开式版本条 | `8 px` | 版本信息退出首要层级 |
| 页面可滚动底部安全区 | `Dock 高度 + safe area + 20 px` | 所有被 Dock 覆盖内容可滚出并完整读取 |

## 3. 视觉系统

### 3.1 色彩

沿用项目已存在的 Workshop Ops 黑白黄系统：

| Token | 建议值 | 用途 |
| --- | --- | --- |
| `--ops-page` | `#F4F3EE` | 页面背景 |
| `--ops-card` | `#FAFAF7` | 卡片与 Dock 背景 |
| `--ops-black` | `#0C0E0C` | 主文字、菜单 CTA、激活 Dock |
| `--ops-text` | `#0A0B0A` | 正文 |
| `--ops-muted` | `#55554F` | 次级说明与英文辅助标签 |
| `--ops-yellow` | `#FFC31A` | 版本、状态、主动作、编号 |
| `--ops-yellow-pressed` | `#E7A900` | 黄色动作按压态 |
| `--ops-border` | `#DEDDD7` | 分隔线与卡片边界 |
| `--ops-danger` | `#C63B2E` | 同步异常、离线写入禁用 |
| `--ops-success` | `#17613C` | 完成/已闭店的辅助语义 |

要求：

- 黄色只用于当前状态、编号、主动作和极少量品牌识别，不铺满大面积背景。
- 销售 KPI 主面板保持参考图的白底，不使用黑色整块背景。
- 黄色按钮使用纯色，不使用装饰性渐变。
- 页面不使用光斑、渐变球、SVG 装饰背景或模拟材质。

### 3.2 字体

| 类型 | 字体栈 | 基准字号/行高 |
| --- | --- | --- |
| 英文标题、编号、日期、数字 | `Barlow Condensed Ops`, `Arial Narrow`, `Roboto Condensed`, Arial, sans-serif | 按组件定义 |
| 中文与正文 | `Albert Sans Local`, `Noto Sans SC`, `Source Han Sans SC`, `PingFang SC`, `Microsoft YaHei`, sans-serif | 按组件定义 |
| KPI 大数字 | `Barlow Condensed Ops` 700 | `64–68 / .86` |
| 卡片中文标题 | 中文字体 700 | `18–20 / 1.15` |
| 组件英文标签 | Display 600–700 | `9–12 / 1.1` |
| 辅助正文 | Body 500–650 | `9–12 / 1.45` |

所有字距统一为 `0`。不得使用负字距压缩长文本；应通过容器宽度、换行和数字字号阶梯处理。

### 3.3 形状、边界和阴影

- 卡片圆角统一 `8 px`，不超过 `8 px`。
- 操作按钮可使用 `8 px` 圆角；图标按钮保持无可见底框。
- 卡片边界使用 `1 px solid var(--ops-border)`。
- 卡片阴影仅允许 `0 3px 12px rgb(12 14 12 / 0.05)`，不得用浮夸悬浮阴影。
- 面板内部使用分隔线和网格单元，不把卡片嵌套在卡片中。

## 4. 组件逐项规格

### 4.1 品牌顶栏 `BrandHeader`

**基准位置**

- 外框：`x≈18–21, y≈14, w≈388, h=40–44 px`。
- 四列：`44 px / minmax(0,1fr) / auto / 44 px`。
- 所有可点击图标的命中框必须至少 `44 × 44 px`。

**子元素**

1. 汉堡菜单：可见三横线约 `18 × 14 px`，线高 `2 px`、间隔 `4 px`；图形居中于 `44 px` 命中框。
2. 品牌锁定：
   - 第一行 `WORKSHOP LEDGER`，`9 px / 10 px`。
   - 第二行 `WORKSHOP OPS`，`22 px / 22 px`，是顶栏最强文字。
   - 版本徽标紧跟品牌，最小宽 `36 px`、高 `18 px`，黄底黑字，读取 `APP_VERSION`。
3. 日期：使用 `workflow.dateKey`，显示 `YYYY / MM / DD 周X`；`11 px`，靠右但不与品牌重叠。
4. 通知：铃铛可见图形约 `18 × 21 px`；`workflow.events.length > 0` 时显示 `6 px` 黄点。

**溢出规则**

- `≤374 px` 时日期切换为 `MM / DD 周X`。
- 品牌不得缩小到 `20 px` 以下；优先压缩日期与品牌/版本间隙。
- 不隐藏菜单和通知入口。

**效果**

顶栏像一条印刷刊头，不使用独立卡片背景。品牌明显，但高度控制在首屏约 `5%`，避免挤压业务内容。

### 4.2 门店与用户上下文 `StoreContextCard`

**基准位置**

- 外层位于 `y≈80 px`，宽度与内容轨道一致，高 `48–52 px`。
- 视觉上不做完整外框卡片；采用三段水平布局：`44 px 门店图标 / minmax(0,1fr) 身份 / 142 px 菜单 CTA`。
- 图标与文字间 `10–12 px`，文字与菜单间不小于 `12 px`。

**子元素**

1. 门店图标区：`40 × 40 px`，淡黄底；使用 Iconoir `ShopWindow` 或项目现有门店图标，不手绘新的 SVG。
2. 上行：`currentStore.storeName · roleLabels[role]`，`11 px / 14 px`，最多一行。
3. 下行：`currentUser`（真实 Profile），Display `19 px / 20 px`。
4. 菜单 CTA：黑底、白字、黄线框文档图标；高 `44–46 px`。
5. CTA 内部三列：`24 px 图标 / 1fr 菜单与 MENU / 16 px 箭头`，间隙 `8 px`。

**长内容**

- 门店名与 Profile 使用单行省略，但 `aria-label` 保留全值。
- 不把生成图中的“五象店”“CHU13”写死。
- 角色为空时显示项目统一的角色回退文案，不显示假身份。

### 4.3 闭店状态卡 `ClosingStatusCard`

这是首屏最高优先级业务卡。

**外框**

- 基准：`x=18.5, y=144.5, w≈389, h=170 px`。
- 白底、`8 px` 圆角、`1 px` 边界、轻阴影。
- 不使用参考图中不存在的装饰性黄色顶边。

**上半区**

- 高 `108–112 px`，内边距 `18 px 16 px 14 px`。
- 三列建议：`minmax(128px, 1.05fr) / 84 px / minmax(112px, 1fr)`，列间 `12 px`。
- 左列：
  - `Daily closing`，`10 px / 12 px`。
  - `今日闭店进度`，`20 px / 23 px`，不强制拆成英文两行。
  - `销售数据是唯一闭店要求`，`10 px / 15 px`，最多两行。
- 中列：状态环外径 `76 px`、内径 `70 px`；数字 `38 px`，百分号 `10 px`。
- 右列：状态解释 `11 px / 18 px`，最多三行。

**状态环语义**

项目当前闭店门槛是二值条件，因此不得伪造连续进度：

| 数据状态 | 环内显示 | 环形 | 解释/动作 |
| --- | --- | --- | --- |
| 已同步但销售未填 | `0%` | 灰环 | 填写当日销售数据 |
| 销售已保存、未闭店 | `100%` | 黄环 | 检查并完成闭店 |
| 已闭店 | `100%` 或 `DONE` | 黄环，辅以成功语义 | 查看记录 |
| 未加载/同步错误 | `—` | 灰环 | 处理异常/刷新 |

其它台账数量不能参与百分比，除非以后业务规则正式改变。

**下半动作区**

- 高 `58–62 px`，左右内边距 `16 px`，顶部 `1 px` 分隔线。
- 三列：`32 px 时钟 / minmax(0,1fr) 状态文字 / 136 px 主动作`，间隙 `10 px`。
- 时钟图标可见尺寸 `26–28 px`，黄色。
- 状态文字依次是 `NEXT / 唯一要求`、动作标题、辅助说明；字号 `8 / 13 / 9 px`。
- 主动作高 `36 px`、黄底黑字、右箭头，命中区高度至少 `44 px`（可通过透明外扩实现）。
- 离线且未闭店时禁用写操作；已闭店的只读历史仍可进入。

### 4.4 销售车辆与四项 KPI `SalesVehiclesPanel`

**外框**

- 基准：`x=18.5, y=323.5, w≈389, h≈214 px`。
- 白底、`8 px` 圆角、边界与轻阴影。
- 分为 `128 px` 主区和 `86 px` KPI 表格；两区之间用分隔线，不做嵌套卡片。

**主区元素**

1. 左上黄色 `7 × 7 px` 方块。
2. `SALES VEHICLES`，Display `12 px`；下方说明 `销售车辆 · 读取真实业务数据`，Body `10 px`。
3. 右上日期读取 `workflow.dateKey`，格式 `YYYY / MM / DD`，Display `11 px`。
4. 主数字读取 `workflow.kpi.salesVehicles`：黄字、Display 700、`64–68 px`。
5. 自行车线稿使用现有 `/images/ops/bicycle-workshop-blueprint.svg`，位于主区右半，约 `154 × 73 px`，灰色低对比；`UNIT` 标签黄色。
6. 主区整块可点击，进入现有 `KpiDialog`。

**数值规则**

- 真实零显示 `00`。
- 数据未加载、错误或不可用显示 `—`，不能显示 `00`。
- `1–2` 位使用基准字号，`3` 位降至 `54 px`，`4` 位降至 `46 px`；大于四位显示完整值并降到能容纳的最小 `38 px`，不截断。

**KPI 表格**

四列等宽，每列约 `97 px`：

| 编号 | 字段 | 中文 | 英文辅助 |
| --- | --- | --- | --- |
| `01` | `kpi.safetyChecks` | 安全检查开单 | `MODEL`；有 `safetyModel` 时显示真实车型 |
| `02` | `kpi.validReviews` | 顾客有效评价 | `VALID REVIEWS` |
| `03` | `kpi.usedSold` | 销售二手车 | `USED SOLD` |
| `04` | `kpi.usedReceived` | 收二手车 | `USED RECEIVED` |

- 单元格顶部编号黄色，`9 px`。
- 中文 `10–11 px`，英文 `8 px`，数值 `28–32 px`。
- 单元格之间仅有 `1 px` 竖分隔线。
- 每个单元格是进入同一 KPI 编辑器的独立 `44 px` 以上命中区域。

### 4.5 业务台账索引 `OperationsIndex`

**外框**

- 基准：`x=18.5, y=546, w≈389, h=130 px`。
- 白底、`8 px` 圆角、边界与轻阴影。

**标题条**

- 高 `38 px`，左右 `12 px`。
- 左侧 `OPERATIONS INDEX · 业务台账`，Display `11 px`。
- 右侧读取 `operationSummary(workflow)`，Body `9–10 px`。
- 下边 `1 px` 分隔线。

**五列入口**

按项目真实顺序，不跳号：

| 编号 | scene id | 英文 | 中文 | 值 |
| --- | --- | --- | --- | --- |
| `02` | `pickup` | `PICKUP` | 待取车辆 | `recordsByScene.pickup.length` |
| `03` | `poster` | `OTHER` | 其它交接 | `recordsByScene.poster.length` |
| `04` | `repair` | `REPAIR` | 维修交接 | `recordsByScene.repair.length` |
| `05` | `resale` | `USED` | 二手车台账 | `recordsByScene.resale.length` |
| `06` | `sales` | `SALES` | 销售数据 | `DUE / READY / DONE` |

每列约 `77–78 px`，内部从上到下：

1. 黄色编号，`10 px`。
2. Iconoir 图标 `18 px` + 英文标题 `11 px`，间隙 `4 px`。
3. 中文和状态说明，`8–9 px`，单行省略。
4. 主值 `24–28 px`。
5. 右下箭头 `16 px`。

整列可点击并跳转到对应 scene。生成图中的随机标点、乱码和断裂符号全部删除。

### 4.6 待取车辆面板 `PickupBoard`

**外框与首屏关系**

- 基准起点 `y≈685.5 px`，高约 `120 px`。
- 参考图刻意让面板下部进入固定 Dock 后方，形成“后续仍有内容”的提示。
- 仅允许首屏初始位置出现这种视觉覆盖；页面必须有足够底部 padding，让用户向下滚动后完整看到每条记录、加号和版本条。

**标题条**

- 高 `30–32 px`。
- 左侧编号黑底黄字 `02`，约 `29 × 22 px`。
- `PICKUP BOARD`，Display `15 px`。
- 辅助文案 `待取车辆 · 跨日保留`，Body `9 px`。
- 右侧 `VIEW ALL ›`，可点击区至少 `64 × 44 px`。

**记录网格**

- 显示 `recordsByScene.pickup` 中 `pickedUpToday !== true` 的前 `3` 条，再加一个新增单元。
- 四列等宽，间隙 `6–8 px`；单元格是扁平表格单元，不使用第二层圆角卡片。
- 每条记录显示：
  - `record.title`，Display `12 px`。
  - `decodePickupContact(record).contactValue`，Body `8–9 px`。
  - `pickupDate` 或 `updatedAt` 的月日，Display `8 px`。
  - `pickupNotificationLabel(record)`，黄底状态带，`8 px`。
- 新增单元显示 `+` 和 `新增取车`；`writeLocked` 时改为 `当前不可新增` 并禁用。
- 空态占前三列，显示 `当前无待取车辆 / 查看完整待取台账`，不能制造示例车、示例电话或示例单号。

### 4.7 版本条 `ReleaseStrip`

参考图中版本条位于首屏 Dock 以下或未显示。实际页面保留现有展开式版本条，但退出首屏核心层级：

- 位于 Pickup Board 之后，默认折叠。
- 显示动态 `APP_VERSION`、`currentRelease.title`、`currentRelease.date`。
- 高 `24–28 px`；黄色版本标签，正文 `9 px`。
- 展开内容来自真实 release notes。
- 不为了让版本条进入首屏而压缩前述业务卡。

### 4.8 固定底部导航 `ActionDock`

**基准位置**

- `position: fixed`，`left: 0`，`bottom: var(--visual-viewport-bottom)`。
- 手机宽 `100%`，基准高 `58 px + env(safe-area-inset-bottom)`。
- 白底、顶部 `1 px` 边界、轻微向上阴影，z-index 高于内容。

**六列**

| scene | 中文 | 英文 | 图标 |
| --- | --- | --- | --- |
| `pulse` | 总览 | `OVERVIEW` | `Activity` |
| `pickup` | 待取 | `PENDING` | `DeliveryTruck` |
| `poster` | 其它 | `OTHER` | `ShopWindow` |
| `repair` | 维修 | `REPAIR` | `Wrench` |
| `resale` | 二手 | `USED` | `Label` |
| `sales` | 销售 | `SALES` | `Cash` |

- 每列最小高度 `58 px`，图标 `20 px`，中文 `9 px`，英文 `8 px`。
- 当前场景黑底黄图标/黄中文；英文用反白，保持对比度。
- 点击后使用现有 `jumpFromOverview`/`jumpTo`，活动状态与 `activeScene` 同步。
- Dock 不允许水平滚动；六列必须稳定等宽，文字不应改变 Dock 高度。

### 4.9 离线、加载和异常提示

- 离线提示插入身份区与闭店卡之间，高度由内容决定，红色左边线。
- 加载中不允许用假 `00` 填满页面，统一显示 `—` 或明确加载状态。
- 同步错误时闭店主动作变为刷新/处理异常；写操作锁定。
- 提示出现后允许页面整体向下增长，不使用绝对定位覆盖下一个卡片。

## 5. 真实数据映射

| 可见内容 | 事实源 | 空/异常规则 |
| --- | --- | --- |
| 版本 | `APP_VERSION` | 不写死 `V5.7.9` |
| 当前日期 | `workflow.dateKey` | 无效日期显示 `—` |
| 通知黄点 | `workflow.events.length` | `0` 时不显示点 |
| 门店 | `currentStore.storeName` | 使用统一 `门店` 回退 |
| 角色 | `roleLabels[role]` | 使用项目角色映射 |
| Profile | `currentUser` | 无值显示 `—` |
| 在线状态 | `online` | 离线显示只读提示并禁写 |
| 闭店可用性 | `hydrated && hasSnapshot && !storageError` | 不可用显示 `—` |
| 闭店进度 | `kpiReady ? 100 : 0` | 不能由其它台账拼出假百分比 |
| 闭店完成 | `closedAt` | 显示完成时间与历史入口 |
| 销售车辆 | `kpi.salesVehicles` | 真零 `00`，不可用 `—` |
| 四项 KPI | `safetyChecks`, `validReviews`, `usedSold`, `usedReceived` | 同上 |
| 业务数量 | `recordsByScene[id].length` | 不可用 `—` |
| 销售模块状态 | `kpiReady`, `closedAt` | `DUE / READY / DONE` |
| Pickup 列表 | `recordsByScene.pickup` | 排除 `pickedUpToday`，最多三条 |
| Pickup 联系方式 | `decodePickupContact(record)` | 无值显示 `未填写联系人` |
| Pickup 日期 | `pickupDate` / `updatedAt` | 无值显示 `日期未填写` |
| Pickup 通知 | `pickupNotificationLabel(record)` | 使用现有业务映射 |
| 版本说明 | `currentRelease` | 默认折叠 |

## 6. 响应式布局

### 6.1 手机：`320–599 px`

- 单列，页面内容宽 `min(calc(100% - 24px), 390px)`。
- `400–599 px` 左右内边距 `18 px`；`375–399 px` 为 `12–14 px`；`320–374 px` 为 `10 px`。
- 基准 `426 × 852.5` 按第 2 节坐标执行，误差 `±4 CSS px`。
- 不按视口宽度连续缩放字号。
- `≤374 px`：日期缩短；门店菜单宽度降至 `124 px`；闭店环降至 `68 px`；主动作宽度降至 `112 px`。
- KPI 与业务索引仍保持 `4` 列和 `5` 列，不水平滚动；通过固定网格、两级字号和单行省略控制。
- Dock 全宽固定，内容底部 padding 始终大于 Dock 实际高度。

### 6.2 平板：`600–839 px`

- 主内容最大宽 `720 px`，左右 `24 px`。
- 顶栏、身份区、闭店卡、销售卡、业务索引、Pickup 仍按单列阅读顺序。
- 卡片内部不随宽度放大字体；将额外空间分配给列宽和留白。
- 销售主区可改为左侧数据 `45%`、右侧线稿 `55%`，四项 KPI 仍位于下方。
- Dock 宽 `min(calc(100% - 32px), 728px)`，距底 `16 px + safe area`，允许 `8 px` 圆角。

### 6.3 大平板/小桌面：`840–1199 px`

使用 `12` 列网格，最大宽 `1080 px`，列间 `16 px`：

- 顶栏：`1 / -1`。
- 门店身份区：`1 / -1`。
- 闭店状态卡：`span 7`。
- 销售 KPI 卡：`span 5`。
- 业务台账索引：`1 / -1`。
- Pickup Board：`1 / -1`。
- Release Strip：`1 / -1`。

闭店卡与销售卡顶部、底部对齐；高度由共享网格行控制，不能一张卡因内容变化使另一张卡错位。

### 6.4 桌面：`≥1200 px`

使用 `12` 列网格，最大宽 `1180 px`，列间 `20 px`，页面左右至少 `32 px`：

- 第一行：顶栏全宽。
- 第二行：门店身份区全宽。
- 第三行：闭店卡 `span 7`，销售卡 `span 5`。
- 第四行：业务索引 `span 7`，Pickup Board `span 5`。
- 第五行：Release Strip 全宽。
- Dock 最大宽 `728 px`，居中固定；不能铺满超宽桌面。

桌面仍是操作型后台，不增加营销 Hero、插画区或解释性卡片。第一视口应直接显示真实业务状态与入口。

## 7. 交互与动效

- 图标按钮、菜单 CTA、卡片入口和 Dock 项均有 hover、focus-visible、active、disabled 状态。
- 鼠标 hover 只改变边界/底色，不抬高卡片或造成布局位移。
- 按压可使用 `opacity: .82` 与 `scale(.985)`，持续 `110 ms`。
- 状态环从 `0` 到 `100` 可在数据到达时做一次 `240–320 ms` 的线性扫入；不循环播放。
- Dock 激活态只做颜色切换，不做滑块追逐或弹跳。
- `prefers-reduced-motion: reduce` 时取消缩放和环形过渡。
- 所有跳转与编辑继续调用项目现有 handler，不引入第二套状态。

## 8. 可访问性与健壮性

- 所有交互命中区至少 `44 × 44 px`。
- 图标仅作装饰时 `aria-hidden="true"`；按钮必须有明确 `aria-label`。
- 当前 Dock 使用 `aria-current="page"`。
- 状态环具有可读标签，如 `闭店准备度 0%` 或 `闭店准备度暂不可用`。
- 页面支持键盘顺序：顶栏 → 门店菜单 → 闭店动作 → 销售/KPI → 业务入口 → Pickup → Release → Dock。
- 颜色不是唯一状态信号；`DUE / READY / DONE / —` 必须同时可见。
- 支持 `forced-colors`；支持 `200%` 页面缩放而无文本重叠。
- 长门店名、长 Profile、四位以上 KPI、三条长 Pickup 标题必须通过真实边界测试。
- Android/iOS 动态浏览器工具栏变化时，Dock 使用 `visual viewport` 底部偏移；弹窗和最后内容不得被遮挡。

## 9. 生成图中禁止照搬的内容

以下内容属于生成痕迹或错误业务表达，应修正而不应复刻：

1. 图中部分中文、英文和标点存在乱码、断字或错误间隔。
2. 图中的日期、门店、角色、Profile、电话、车辆和所有 `00` 都是构图占位。
3. 操作索引中的随机小符号、列间碎字不属于 UI 元素。
4. 不能用 `00` 表示加载失败或未读取；必须显示 `—`。
5. 闭店进度不能根据卡片数量伪造连续百分比。
6. Pickup 被 Dock 覆盖只能是初始视口构图，不能形成永久不可访问内容。
7. 不使用参考图可能暗示的黄色渐变按钮；采用项目纯黄色。
8. 不复制图中的假门店图标；使用项目图标库。
9. 不为了塞进一屏而把中文缩到低于可读下限。
10. 不新增效果图中没有业务事实来源的通知数量、趋势、排名或完成率。

## 10. 实施映射

后续真正实施时，优先修改现有结构，不新建平行首页：

| 责任 | 现有文件 |
| --- | --- |
| 首屏组件与数据绑定 | `apps/web/src/components/overview/WorkshopOverviewPage.jsx` |
| 手机布局与 Ops tokens | `apps/web/src/styles/mobile-overview.css` |
| 全局页面/Dock 兼容 | `apps/web/src/styles/layout.css`, `components.css`, `responsive.css`, `refinement.css`, `desktop-endfield.css` |
| Dock 结构 | `apps/web/src/components/lookbook/ActionDock.jsx` |
| 六场景名称和图标 | `apps/web/src/data/lookbookScenes.js` |
| 日期、KPI、记录与闭店状态 | `apps/web/src/hooks/useClosingWorkflow.js` |
| 用户、门店、角色和 handler 注入 | `apps/web/src/App.jsx` |
| 版本 | `apps/web/src/data/releaseNotes.js` |
| 自行车线稿 | `apps/web/public/images/ops/bicycle-workshop-blueprint.svg` |

实施原则：

- 复用现有组件、Iconoir 图标、hooks 和 handler。
- 不新增数据库字段或 API 只为完成视觉布局。
- 平板和桌面应让 `WorkshopOverviewPage` 可见，而不是继续回退到另一套信息架构。
- 只在现有 CSS 中建立共用布局变量和断点，不复制整套 DOM。

## 11. 视觉与行为验收

### 11.1 必测视口

- `320 × 568`
- `360 × 800`
- `390 × 844`
- `426 × 852`
- `768 × 1024`
- `1024 × 768`
- `1440 × 900`

### 11.2 基准图验收

在 `426 × 852`、DPR 2 下：

- 一级区域锚点与第 2.2 节相比误差不超过 `±4 CSS px`。
- 主内容左右轨道误差不超过 `±2 CSS px`。
- 卡片间垂直间隔误差不超过 `±2 CSS px`。
- Dock 顶边位于 `y≈795 px`，并露出 Pickup Board 的后续内容提示。
- 页面滚动后 Pickup 与 Release Strip 均能完全位于 Dock 上方。
- 顶栏、闭店主动作、KPI、Operations 与 Dock 无文字重叠或裁切。

### 11.3 数据与状态矩阵

至少验证：

1. 全部真实值为 `0`。
2. KPI 为 `1–2` 位、`3` 位、`4` 位和更长值。
3. 加载中、无快照、同步错误、离线。
4. 销售未填、已填未闭店、已闭店。
5. Pickup 为 `0 / 1 / 2 / 3+` 条。
6. 长门店名、长 Profile、长车辆标题、缺失联系人、缺失取车日期。
7. Dock 六场景逐项激活和跳转。
8. `prefers-reduced-motion`、键盘、触摸、`forced-colors` 和 `200%` 缩放。

### 11.4 工程门禁

真正实施前后均需执行：

- 本地 CodeGraph `sync + status + explore/affected`。
- 首屏专项 DOM/数据映射测试。
- 完整 Web 测试、TypeScript typecheck、工作流策略、生产构建。
- Playwright/browser-harness 在上述视口的截图与重叠检测。
- Preview 独立部署和身份核验后再交由用户人工验收。
- Preview-only 改动不变更公开版本；未经用户明确授权不得部署 Production。

## 12. 本次文档变更证据

- 分析基线：`3c0f7b31466dba3c146164d368e08ec4a05a1bfc`。
- 修改前 CodeGraph v1.5.0：`185 files / 2,234 nodes / 7,614 edges`，`WAL`，`up to date`。
- CodeGraph 已定位 `WorkshopOverviewPage` 到六个首屏模块以及 `App`/Dock/工作流数据链。
- Markdown 不属于当前 CodeGraph 的符号语言覆盖范围；后置仍必须执行 `sync + status`，并将“节点无变化”作为文档-only 例外记录。
- 本次范围只新增 Markdown，不修改运行代码、样式、数据、迁移、版本、测试、工作流或部署。
