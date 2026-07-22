# WORKSHOP SIGNAL GRID

> Workshop 全系统下一代视觉设计事实源与抗中断实施台账

## 0. 文档状态

- **方案名称**：WORKSHOP SIGNAL GRID
- **方案状态**：Phase 0 设计事实源已完成；Phase 1 设计基础已获授权并在本地实现/验证中，尚未发布 Preview
- **文档创建日期**：2026-07-22
- **文档基线**：`feature/cloudflare-workers-d1` / `a98858c388e3d866412390920d14381ed48008f2` / V5.7.8 Preview source
- **当前源码登记版本**：V5.8.0（Phase 1 字体与设计基础候选，尚未发布 Preview）
- **Phase 0 内容合并 SHA**：`94cd3f970969749167b286ef76c29c60f6e145a5`
- **Phase 0 最终行政合并 SHA**：`6da7263ca03bf6f15b9656d8d0cc27d7ae1b97b0`
- **当前 Preview**：V5.7.8 / `a98858c388e3d866412390920d14381ed48008f2`
- **当前 Staging**：V5.7.7，未因本文档修改
- **Production**：禁止
- **业务边界**：保留现有业务流程、信息架构、字段、权限和数据契约
- **知识产权边界**：借鉴 Marathon 的平面能量、色彩组织和程序化视觉方法，但不得复制其标志、字体、图标、纹章、角色、截图构图或其它专有资产

本文档是 WORKSHOP SIGNAL GRID 的完整规范、阶段队列和恢复事实源。`DESIGN.md` 只保存摘要、当前运行事实和本文件索引。

---

## 1. 设计判断

这是一次面向门店高频操作人员的产品界面视觉重构，而不是营销站改版。

核心表达：

> 入口像高端产品发布海报，操作区像精密门店工具。

目标：

- 摆脱灰阶加 Falu Red 主导的现有前景体系
- 使用明亮冷中性画布、酸性数字色和大面积模块色块
- 建立强辨识度的模块身份
- 在记录、表单、历史和报告中保持高可读性和操作效率
- 使用原创工业校准、像素数据和程序化状态信号
- 保留原生滚动、输入稳定、可访问性和低性能 Android 可用性

不改变：

- 页面路由和模块顺序
- 业务流程和权限逻辑
- 表单字段、字段顺序与校验规则
- 记录卡承载的业务事实
- 服务端状态语义、审计与撤回逻辑
- 报告数据口径
- 已验证的业务完成像素动效语义

---

## 2. 视觉强度模型

| 区域 | 视觉强度 | 信息密度 | 设计目标 |
|---|---:|---:|---|
| 登录与初始化 | 高 | 低 | 建立品牌记忆点 |
| 模块入口与标题区 | 高 | 中低 | 明确当前业务空间 |
| 总览核心 KPI | 高 | 中 | 快速掌握当日状态 |
| 记录列表 | 中低 | 高 | 快速扫描和操作 |
| 表单与 Dialog | 低 | 高 | 稳定填写，避免干扰 |
| 永久历史与账户管理 | 低 | 高 | 长时间阅读与筛选 |
| 报告封面与汇总 | 中高 | 中 | 形成可分享的视觉识别 |
| 报告明细 | 低 | 高 | 数据准确和压缩后可读 |

强视觉只集中在模块入口、核心 KPI、主要操作区和少数重点记录。禁止把每个记录、字段和按钮都做成强色海报。

---

## 3. 色彩系统

### 3.1 基础结构色

| Token | 建议值 | 用途 |
|---|---|---|
| `canvas` | `#F3F5F2` | 全局明亮冷中性画布 |
| `surface` | `#FFFFFF` | 表单、记录与密集数据表面 |
| `ink` | `#141616` | 主文字、深色结构和高对比符号 |
| `ink-secondary` | `#454B49` | 次要正文和辅助事实 |
| `text-muted` | `#697071` | 辅助文字，在 Canvas 上达到 WCAG AA |
| `line-strong` | `#141616` | 重点边界和结构框 |
| `line-soft` | `#AEB5B2` | 常规分隔和非重点框架 |
| `field-soft` | `#E7EBE8` | 禁用区、空状态和辅助分区 |

禁止暖米色主体、玻璃拟态、柔和投影和大面积灰色渐变。

### 3.2 模块专属色

| 模块 | 英文标识 | 专属色 | Hex |
|---|---|---|---|
| 总览 | OVERVIEW | Voltage Lime | `#D7FF3F` |
| 维修 | REPAIR | Ion Cyan | `#18D8FF` |
| 待取 | PICKUP | Solar Yellow | `#FFE247` |
| 销售 | SALES | Plasma Violet | `#7657FF` |
| 二手车 | RESALE | Hot Magenta | `#FF3D96` |
| 闭店 | CLOSING | Blaze Orange | `#FF5A24` |

历史、账户与设置使用冷白结构，并从记录来源继承局部模块信号色。

### 3.3 全局语义色

- 危险：Signal Red `#F02D3A`
- 警告：独立橙黄色阶，必须配 Warning 图标和明确文字
- 成功：深色结构面加亮色 Check，不使用绿色作为唯一信号
- 锁定：深石墨结构加 Lock 图标与文字
- 同步：Electric Blue 边框脉冲、进度轨迹和可读状态文字

### 3.4 色彩约束

- 一个业务页面只有一个主导模块色
- 总览可以同时出现全部模块色，但必须按真实模块分区
- 普通记录保持冷白主体
- 新记录、异常记录、待处理记录可扩大模块色区域
- 当前操作记录可以临时增强为完整模块色
- 颜色永远不是唯一状态信号，必须同时使用文字、图标或结构
- Violet 背景优先使用白色正文，其余浅色模块面优先使用 `#141616`
- 危险按钮的小号文字必须使用经验证可达 AA 的深色危险阶，不直接假设 `#F02D3A` 与白字足够
- 所有组件只能引用语义 Token，不在组件 CSS 中散落 Hex

---

## 4. 字体与排版

### 4.1 字体架构

#### 英文模块标题

采用超窄、粗重的 Condensed Sans。候选需在实施前检查授权、自托管能力和中文搭配：

- Barlow Condensed
- Roboto Condensed
- 合法可自托管的品牌级窄体

用途：模块英文名、大号编号、报告封面和核心 KPI。

#### 中文标题

采用厚重中文黑体。优先使用合法自托管的思源黑体或 Noto Sans SC Heavy，通过排版构图形成压缩感。

禁止使用 CSS `scaleX()` 强行压缩中文笔画。

#### 操作与正文

使用中性、稳定的中文 UI 字体：

```text
system-ui, PingFang SC, Microsoft YaHei, Noto Sans SC, sans-serif
```

金额、日期、时间、票号和指标启用 tabular numbers。

### 4.2 字级

| 层级 | 桌面 | 移动端 | 用途 |
|---|---:|---:|---|
| 英文模块名 | 64-80px | 38-48px | 模块视觉身份 |
| 中文模块名 | 42-56px | 30-38px | 中文主标题 |
| 核心 KPI | 64-96px | 48-64px | 今日关键数字 |
| 区域标题 | 24-32px | 22-28px | 列表和操作区 |
| 记录标题 | 18-20px | 17-19px | 车辆和业务记录 |
| 正文 | 16px | 16-17px | 说明和表单 |
| 紧凑标签 | 14px | 14px | 状态和辅助字段 |
| 微型结构标识 | 12px | 12px | 坐标、编号和校准信息 |

### 4.3 中英标题构图

中文与英文均为主标题，并作为一个图形单元处理：

- 上下咬合
- 左右错位
- 不同基线
- 局部裁切
- 色块穿插
- 移动端重新编排而不是简单缩放桌面构图

真实 DOM 阅读顺序、唯一 H1 和 heading 层级必须保持正确。

---

## 5. 几何、表面与空间

### 5.1 几何语言

- 直角容器
- 单侧缺角
- 斜切边缘
- 嵌套框架
- 咬合色块
- 大号编号区
- 硬边不对称裁切
- 局部像素化边缘

### 5.2 表面语言

采用纯平面海报式层级：

- 几乎无阴影
- 不使用玻璃拟态
- 不使用发光边缘
- 不使用柔和圆角卡片
- 不使用无意义渐变

层级来自：

- 1px 或 2px 结构边框
- 色块重叠与咬合
- 尺度对比
- 内容错位
- 前后层裁切
- 背景和编号区的相互遮挡

操作热区保持完整矩形。缺角和斜切只改变视觉外壳，不能缩小可点击区域。

---

## 6. 辅助微图形

采用混合程序化体系。

### 6.1 工业校准骨架

- 坐标线
- 刻度
- 工单或模块编号
- 裁切定位标
- 对齐标
- 网格索引
- 简短真实系统代码

这些元素必须对应真实结构或业务信息，不得作为随机装饰铺满页面。

### 6.2 像素与数据纹理

只用于视觉高潮：

- 登录主视觉
- 模块封面
- 重要完成状态
- 报告封面
- 空状态主图

禁止放在密集正文、输入框、表格或记录明细后方。

### 6.3 动态程序化信号

只在真实状态变化中出现：

- 同步
- 加载
- 提交
- 数据刷新
- 网络恢复
- 业务完成
- 错误回滚

允许扫描线、波形、流向箭头和进度轨迹。禁止持续播放的全页背景装饰。

---

## 7. 图标体系

### 7.1 锐利线框

用于导航、筛选、搜索、编辑、设置、展开、日期和账户。

### 7.2 实心图标

用于主要业务动作、完成、删除、锁定、错误、警告和当前激活状态。

### 7.3 规则

- 使用单一图标家族
- 统一描边粗细和视觉尺寸
- 激活态可由线框切换为实心
- 保留熟悉操作隐喻
- 图标按钮必须提供可访问名称
- 不手绘陌生科幻图标替代常见操作

---

## 8. 信息密度与响应式导航

### 8.1 分层密度

- 模块入口和关键操作区：大胆留白、强色块和大标题
- 记录列表、表单和密集数据：紧凑高效
- 移动端尽量一屏完成主要任务
- 不能为了视觉冲击膨胀每张记录卡

### 8.2 桌面导航

- 使用左侧编号模块轨道
- 轨道宽约 88-104px
- 展示模块编号、图标和简短模块名
- 当前模块扩大或展开模块色区
- 非激活项保持结构中性
- 不再叠加第二套顶部主导航

### 8.3 移动导航

- 保留拇指可达的分段底部 Dock
- 触控目标至少 48px
- 当前项显示图标和文字
- 极窄屏下非当前项可只显示图标
- 模块顺序和桌面一致
- 适配 safe area、VisualViewport 和浏览器动态底栏
- 不依赖悬停，不产生横向溢出

---

## 9. 图片与媒体语言

采用强图形化处理：

- 高对比
- 网点或抖动纹理
- 双色分色
- 硬边不对称裁切
- 原创几何遮罩

照片按所在模块映射为深色结构色加模块主色，不使用全局统一 Lime。

要求：

- 保留车辆、人物和业务对象的可识别性
- 不在密集文字后方使用高噪声照片
- 报告导出优先使用预处理资源，避免截图时运行昂贵滤镜
- 生成 AVIF/WebP 和多个响应式尺寸
- 明确宽高以避免 CLS

---

## 10. KPI 与数据可视化

采用分层混合体系：

- 核心 KPI 使用超大数字主导构图
- 趋势、完成率和异常使用简洁工业刻度、条形轨迹和方向符号
- 禁止装饰性仪表盘
- 禁止无真实意义的进度和图表
- 数字必须来自真实数据，不创造假精度

示例：

- 今日维修：`12`
- 待取车辆：`07`
- 今日销售：`¥ 28,640`
- 闭店时间：`21:48`

---

## 11. 组件规范

### 11.1 模块标题区

必须包含：

1. 英文模块名
2. 中文模块名
3. 今日真实业务摘要
4. 一项最主要操作
5. 模块专属强色块
6. 少量具有结构意义的工业定位标

不得添加虚假版本号、装饰性经纬度、天气或无意义科技文本。

### 11.2 业务记录

#### 普通记录

- 冷白主体
- 模块色编号区、局部框架或操作色
- 1px 深色边界
- 清晰的字段分组

#### 新记录、异常记录和待处理记录

- 扩大局部模块色
- 显示明确文字标签和图标
- 不使用闪烁吸引注意

#### 当前操作记录

- 局部或整块增强为模块色
- 主操作区与记录外壳咬合
- 操作结束后回归普通密度或进入既有业务完成动效

### 11.3 按钮

- 主按钮：模块色或深色实心
- 次按钮：冷白底和完整深色边框
- 危险按钮：独立危险语义，不继承模块色
- 禁用按钮：降低对比，同时保留禁用图标或文字
- 加载按钮：宽度不跳变
- 桌面和移动端标签均不得折行
- 触控目标至少 44px，移动端优先 48px

### 11.4 表单

- 标签位于输入框上方
- placeholder 不能代替标签
- 输入框保持稳定矩形结构
- 焦点使用模块色外框加深色辅助边
- 错误在字段下方并通过 `aria-describedby` 关联
- 必填、帮助、错误和 loading 均有独立状态
- 输入区不使用网点、扫描纹理或持续动效

### 11.5 Dialog 与任务层

- 桌面优先右侧任务面板或集中式原生 Dialog
- 移动端使用接近全屏的任务层
- 顶部保留标题和明确关闭操作
- 底部操作在虚拟键盘和浏览器工具栏出现时仍可见
- 通过框架、遮罩和色块建立层级，不依赖投影
- 支持 Escape、焦点锁定和焦点返回

---

## 12. 页面级设计

### 12.1 登录

- 中英文品牌标题构成主视觉
- 使用深色加 Voltage Lime 的高对比双色摄影
- 表单保持冷白、稳定、易读
- 登录按钮使用深色结构和 Lime 状态反馈
- 不模拟游戏启动界面，不使用虚假加载百分比和系统代码

### 12.2 初始化与强制改密

- 只在流程确有顺序时显示步骤关系
- 使用 Overview Lime 作为系统引导色
- 表单区域保持中性
- 当前步骤使用大色块和实心图标
- 不能通过装饰降低安全提示权重

### 12.3 总览

总览不是六张同构卡片网格，而是非对称业务地图：

- 今日总 KPI 占据最大的 Voltage Lime 区域
- 六模块按真实状态和重要性使用不同面积
- 异常模块可扩大或改变结构
- 每个模块只显示一项核心数据和一个直接入口
- 详细数据留在对应模块

### 12.4 维修

- Ion Cyan 模块头部
- 维修队列使用冷白高密度表面
- 状态同时使用文字、图标和形状
- `维修完毕` 为实心主要操作
- 现有维修完成像素语义保留

### 12.5 待取

- Solar Yellow 模块头部
- 时间、逾期和通知状态优先
- 天猫、京东、小程序自提标识继续明确展示
- `确认取车` 保持主要操作
- Yellow 不能单独代表警告

### 12.6 销售

- Plasma Violet 模块头部
- 金额和成交数据使用高对比文字
- 核心数字放大
- 明细恢复冷白密集表面
- 禁止紫底低对比灰字

### 12.7 二手车

- Hot Magenta 模块头部
- 强调商品流转和当前阶段
- 待维修、待上架和已售出使用不同文字、图标和结构
- 状态不能只靠颜色

### 12.8 闭店

- Blaze Orange 模块头部
- 将闭店表达为一天的收束流程
- 核心金额、业务日期和完成状态优先
- 明细区域保持冷白
- 最终确认必须明确影响范围
- 重新打开闭店保留独立权限提示

### 12.9 永久历史

- 冷白主结构
- 每条历史记录继承来源模块的局部信号色
- 日期和模块筛选放在稳定工具栏
- 按时间轴或分组列表组织
- 不使用大面积彩色背景
- 撤回和恢复显示明确结果和影响范围

### 12.10 账户与设置

- 使用冷白结构
- 角色、权限和来源模块只使用局部颜色
- 危险账户操作使用全局危险语义
- 不重新发明标准设置控件

### 12.11 报告导出

- 汇总页可使用强图形构成和超大 KPI
- 明细页回归冷白和高对比文本
- 报告继承相关模块色身份
- 小号数字和明细后方不放高噪声纹理
- 检查彩色屏幕、聊天压缩和灰度打印
- 保持真实数据口径和自提平台标识

---

## 13. 动效系统

### 13.1 动效语言

- 导航和布局：快速硬切、咬合滑入
- 加载和同步：扫描、边框脉冲和进度轨迹
- 状态变化：局部色块重组
- 业务完成：保留并统一既有像素语言
- 错误：短促边框或结构状态变化，不抖动整个页面

### 13.2 时长建议

| 类型 | 时长 |
|---|---:|
| 按钮反馈 | 100-160ms |
| 导航切换 | 140-200ms |
| 面板进入 | 180-240ms |
| 筛选和布局更新 | 160-220ms |
| 同步信号 | 仅在真实同步期间 |
| 业务完成效果 | 按既有业务语义单独校准 |

### 13.3 禁止项

- 长时间页面入场表演
- 滚动劫持
- 大范围持续视差
- 鼠标追踪 3D 倾斜
- 无限网点移动
- 持续扫描整个页面
- 弹跳和弹簧式业务按钮
- 填写表单时移动容器

### 13.4 Reduced Motion

- 滑入改为即时切换或短交叉淡入
- 像素完成效果可直接进入最终状态
- 扫描和脉冲停止
- 不删除 pending、success、error 等可读反馈

---

## 14. 可访问性底线

- WCAG 2.1 AA 为最低标准
- 正文对比度至少 4.5:1
- 大号文字至少 3:1
- 边框、焦点和图标至少 3:1
- 颜色始终配合文字、图标或形状
- 键盘焦点使用清晰高对比外框
- 所有操作可由键盘完成
- Dialog 支持 Escape、焦点锁定和焦点返回
- 状态更新使用合适的 `aria-live`
- 装饰纹理使用空 alt，信息图片使用准确 alt
- 支持 200% 浏览器缩放
- 320px 宽度无横向页面溢出
- 触控目标至少 44px，优先 48px
- 网点和像素纹理不能降低文字辨识度
- 必须测试 protanopia、deuteranopia 和 tritanopia

---

## 15. 性能边界

- 不引入 WebGL 或持续 Canvas 动画
- 双色分色、网点和抖动图优先在构建阶段生成
- 图片使用 AVIF/WebP 和响应式尺寸
- 不对滚动容器实时应用昂贵滤镜
- 动效主要使用 transform、opacity 和少量局部 mask
- 非当前模块媒体延迟加载
- 图片预留宽高，避免 CLS
- 目标：LCP < 2.5s、INP < 200ms、CLS < 0.1
- 低性能 Android 优先保证原生滚动、输入和业务提交

---

## 16. 原创与知识产权边界

可以借鉴：

- 高饱和模块色
- 平面工业构成
- 超窄标题和大号编号
- 网点与双色图像
- 程序化状态反馈
- 锐利几何和不对称布局

禁止复制：

- Marathon 标志
- 游戏阵营符号和纹章
- 原始 UI 图标
- 专有字体组合
- 角色、装备和游戏截图
- 具有明确识别度的编号或版面构图

Workshop 的视觉素材必须来自自身业务事实：

- 工单号
- 业务日期
- 车辆状态
- 门店流程
- 时间刻度
- 同步状态
- 操作阶段
- 报告数据

---

## 17. 分阶段实施路线

> Phase 0 已完成；Phase 1 已获用户明确授权并进行中。Phase 2 及以后仍须另获明确授权。

### Phase 0：设计方案与事实源

**状态：已完成**

- 完成方向研究与逐项需求确认
- 确认色彩、字体、几何、微图形、图标、密度、导航、图片、KPI、动效和覆盖范围
- 写入长期记忆
- 写入 `DESIGN.md` 摘要和本完整规范
- 尚未修改运行时代码
- 尚未触发 Preview、Staging 或 Production 部署

### Phase 1：设计基础

**状态：进行中**

- 建立 primitive、semantic、component 三层 Token
- 确认字体授权和自托管资源
- 建立模块主题映射
- 建立统一图标家族和状态规则
- 更新 DESIGN.md 的运行时代码映射
- 不改变业务逻辑

### Phase 2：系统外壳

**状态：未开始**

- 登录
- 初始化和强制改密
- 桌面左侧模块轨道
- 移动底部 Dock
- 页面基础画布
- 总览业务地图

### Phase 3：核心业务模块

**状态：未开始**

- 维修
- 待取
- 销售
- 二手车
- 闭店
- 统一记录、KPI 和状态组件

### Phase 4：操作与管理体系

**状态：未开始**

- 表单
- Dialog 和任务层
- 筛选、加载、错误和空状态
- 永久历史
- 账户与设置

### Phase 5：媒体与报告

**状态：未开始**

- 模块化双色摄影
- 网点和抖动媒体资源
- 报告汇总与明细
- 聊天压缩和灰度输出测试

### Phase 6：全系统质量验证

**状态：未开始**

- 真机移动端
- 强光门店环境
- 键盘与屏幕阅读器
- 色觉模拟
- reduced-motion
- 性能预算
- Preview 人工验收
- Staging 仅在明确批准后部署
- Production 继续禁止

---

## 18. 抗中断进度治理

### 18.1 强制检查点

完成以下任一事件后，必须立即更新本文档和长期记忆，再继续下一步：

1. 需求或设计决策确认
2. 开始新 Phase 或子阶段
3. 完成可验证代码范围
4. 修改重要文件或数据结构
5. 创建提交并获得准确 SHA
6. PR 创建、CI 成功或失败
7. Preview 部署及独立身份验证
8. 用户人工验收结果
9. Staging 获得明确授权
10. Staging 部署及独立验证
11. 出现网络、工具、测试、权限或数据阻塞
12. 上下文接近压缩或 Token 风险区

### 18.2 每个检查点必须记录

```markdown
## Checkpoint YYYY-MM-DD HH:mm

- Phase：
- 状态：planned | in_progress | blocked | verified | preview | approved | released
- 基线分支和 SHA：
- 本阶段完成范围：
- 关键决策：
- 修改文件：
- 数据库或契约变化：
- 测试与验证结果：
- PR / CI run：
- 部署环境、Deployment ID、Worker Version：
- 用户验收结果：
- 阻塞原因：
- 未完成队列：
- 下一步：
- Production：forbidden
```

没有相关内容的字段写 `N/A`，不能省略关键验证和下一步。

### 18.3 恢复顺序

中断后恢复时按以下顺序读取：

1. 本文件的“当前恢复状态”
2. 本文件最新 Checkpoint
3. `DESIGN.md` 的 WORKSHOP SIGNAL GRID 摘要
4. `~/session-state.md`
5. `~/memory/working-buffer.md`
6. 长期记忆中的 WORKSHOP SIGNAL GRID 与抗中断规则
7. Git 远端分支、提交、PR 和 CI 的实际状态
8. Cloudflare Preview/Staging 的实际版本和流量状态

恢复后先核对事实，不依赖聊天中的模糊描述，不重复已经验证的操作。

### 18.4 网络和工具失败规则

- GitHub、Cloudflare、npm 或境外资源不可达时停止该依赖项
- 提醒用户确认 VPN 或网络，不盲目重复请求
- 工具返回 error 时先读取错误并记录 Checkpoint
- 禁止用不相干工具绕过专用工具失败
- 数据删除、历史改写、force push 和 Production 操作需要独立明确授权

### 18.5 检查点提交的非递归规则

- 功能或阶段主提交、准确内容 SHA、PR、CI、测试和部署证据必须写入项目 Markdown。
- 引入该检查点文件本身的最终行政合并 SHA 不再通过无限追加提交自我引用。
- 该最终合并 SHA 必须立即写入长期记忆和 `~/session-state.md`，并在下一阶段首个项目 Checkpoint 中继承。
- 这样既保留项目内可恢复事实，又避免“为记录合并而再次合并”的无限循环。

---

## 19. 当前恢复状态

### 当前任务

实施 WORKSHOP SIGNAL GRID Phase 1 设计基础：三层 Token、字体授权与自托管策略、模块主题映射、统一 Iconoir 图标规则和 DESIGN.md 运行时代码映射。不得改变业务逻辑。

### 当前已完成

- Phase 0 设计事实源、双文档结构和抗中断治理已进入正式源码分支
- Phase 0 最终行政合并 SHA：`6da7263ca03bf6f15b9656d8d0cc27d7ae1b97b0`
- Phase 1 三层 Token、七个模块主题、Iconoir regular/solid 状态规则和运行时主题标记已实现
- Albert Sans、Barlow Condensed 和 Noto Sans SC 的来源、OFL 许可证、包完整性和逐文件 SHA-256 已核验
- 已获明确授权删除停用的 Noto Serif SC 资源，避免无效 public build 体积
- V5.7.10 基础候选已完成一次全量本地验证；字体替换后将按规则进入 V5.8.0 并重新全量验证
- 远端基线已恢复并精确对齐 `6da7263c…`
- 尚未触发 Preview、Staging 或 Production 部署

### 当前未授权

- Phase 2 及以后系统外壳和业务模块重构
- 数据库、契约、权限或业务逻辑变化
- Staging 部署
- Production 部署

### 下一步队列

1. 登记 V5.8.0，更新 release notes 和 328+ 文件指纹
2. 运行字体清单/许可证/引用约束、完整测试、typecheck、production build 和 Worker bundle
3. 记录字体替换后的体积结果和最终 Phase 1 功能 SHA
4. 推送对齐分支，创建 PR 并等待完整 CI 与全历史 Gitleaks
5. CI 全绿后正常合并并部署 Preview 供用户人工验收
6. Staging 仍需独立明确批准；Production 禁止

---

## 20. 最终验收标准

1. 不看文字也能通过色彩和结构辨认当前模块
2. 记录列表的信息读取速度不低于现有版本
3. 移动端一屏内仍能完成主要业务动作
4. 普通记录不会因鲜艳色彩造成视觉疲劳
5. 状态不依赖颜色单独表达
6. 登录、业务模块、历史、账户、Dialog、表单和报告属于同一系统
7. 没有玻璃拟态、柔和卡片、无意义发光和持续背景动画
8. 没有复制 Marathon 专有资产
9. 现有业务流程、数据、权限和审计逻辑不变
10. 强光环境、低性能 Android 和聊天截图压缩后仍然可用


---

## Checkpoint 2026-07-22 23:04

- Phase：Phase 0 - 设计方案与事实源
- 状态：verified
- 基线分支和 SHA：`feature/cloudflare-workers-d1` / `a98858c388e3d866412390920d14381ed48008f2`
- 本阶段完成范围：完整方案写入本文件；DESIGN.md 写入摘要、索引、设计边界与检查点治理；长期记忆已同步。
- 关键决策：采用 DESIGN.md 摘要加 `docs/WORKSHOP-SIGNAL-GRID.md` 完整规范的双文档结构；运行时 V5.7.8 视觉与未来目标明确分离。
- 修改文件：`DESIGN.md`、`docs/WORKSHOP-SIGNAL-GRID.md`、`package.json`、`apps/web/package.json`、`apps/web/src/data/releaseNotes.js`、`version-manifest.json`。
- 数据库或契约变化：N/A
- 测试与验证结果：工作流策略 88/88；Domain 4/4；Database 5/5；Web 100/100；API 16/16；Worker 11/11；完整 typecheck、Web/API build、Worker typecheck/bundle、version check、diff check 和自定义 Markdown 完整性断言全部通过。Web CSS 186.70 kB（gzip 48.12），JS 442.87 kB（gzip 154.59）；Worker 270.3 kB / 150.1 kB minified。首次 `pnpm check:version` 按治理预期阻止未登记文档，随后已正式登记 V5.7.9。
- 内容提交 SHA：`7007ccee74059ea2437d884530a60e209766495a`
- PR / CI run：PR #31；内容 CI `29932191032`、检查点 CI `29932395912`、合并后源码头 CI `29932642968` 均通过 `secrets` 与 `verify`
- 部署环境、Deployment ID、Worker Version：N/A；GitHub run inventory 已核对，本次没有触发任何部署工作流
- 用户验收结果：用户已确认双文档结构和抗中断自动记录要求
- 阻塞原因：N/A
- 未完成队列：N/A，Phase 0 已完成；等待 Phase 1 明确授权
- 下一步：等待用户未来明确授权 Phase 1
- Production：forbidden


---

## Checkpoint 2026-07-22 23:19

- Phase：Phase 0 - 设计方案与事实源
- 状态：released
- 基线分支和 SHA：`feature/cloudflare-workers-d1` / `94cd3f970969749167b286ef76c29c60f6e145a5`
- 本阶段完成范围：WORKSHOP SIGNAL GRID 完整规范、DESIGN.md 摘要、V5.7.9 文档登记、阶段路线、恢复状态和抗中断治理已进入正式源码分支。
- 关键决策：当前运行时仍使用 V5.7.8 视觉；WORKSHOP SIGNAL GRID 只是已批准的下一代目标，Phase 1 未授权。采用检查点提交非递归规则，避免为记录最终行政合并而无限追加提交。
- 修改文件：`DESIGN.md`、`docs/WORKSHOP-SIGNAL-GRID.md`、`package.json`、`apps/web/package.json`、`apps/web/src/data/releaseNotes.js`、`version-manifest.json`。
- 数据库或契约变化：N/A
- 测试与验证结果：本地工作流策略 88/88；Domain 4/4；Database 5/5；Web 100/100；API 16/16；Worker 11/11；完整 typecheck、build、Worker bundle、version、diff 和文档完整性验证通过。CI `29932191032`、`29932395912`、`29932642968` 全绿。
- PR / CI run：PR #31 已正常合并；CI 如上。
- 部署环境、Deployment ID、Worker Version：N/A；没有触发 Preview、Staging 或 Production。已部署 Preview 仍为 V5.7.8 `a98858c388e3d866412390920d14381ed48008f2`；Staging 仍为 V5.7.7 `8642dd7cd6d97b39215c3b1788de8a1488af238d`。
- 用户验收结果：用户确认 WORKSHOP SIGNAL GRID 方案、双文档结构和自动检查点治理。
- 阻塞原因：N/A
- 未完成队列：等待用户明确授权 Phase 1。
- 下一步：Phase 1 授权后先读取本文件、长期记忆和最新远端状态，再实施设计基础。
- Production：forbidden

---

## Checkpoint 2026-07-23 03:27

- Phase：Phase 1 - 设计基础
- 状态：in_progress
- 基线分支和 SHA：本地 `feat/signal-grid-phase1-foundations` / `adb20ec19f0ca2696437a680a9cf6d8e2a46e1ff`；继承远端 Phase 0 最终行政合并 `6da7263ca03bf6f15b9656d8d0cc27d7ae1b97b0`，发布前必须对齐
- 本阶段完成范围：建立 primitive、semantic、component 三层 CSS Token；建立七个运行时主题作用域（六个业务模块加中性 Other Handover）；Iconoir 导航 outline/active filled 和语义 filled 规则已进入运行时；Albert Sans 已迁入独立自托管目录并记录许可证、来源和 SHA-256；DESIGN.md 已增加运行时代码映射。
- 关键决策：Phase 1 只接入设计基础和少量可验证主题钩子，不实施 Phase 2 系统外壳；其它工作交接使用冷白结构加 Voltage Lime 信号；唯一图标家族保持现有 Iconoir，不引入新依赖；未验证的 Barlow Condensed / Noto Sans SC 文件不进入仓库。
- 修改文件：`apps/web/src/styles/signal-grid-{fonts,primitives,semantic,components}.css`、`apps/web/src/design/signalGrid.js`、`apps/web/src/data/lookbookScenes.js`、`ActionDock.jsx`、六个 Scene、`ClosingSummary.jsx`、状态/确认图标引用、`vite.config.js`、字体资源与来源文档、`tests/signal-grid-phase1.test.mjs`、`DESIGN.md`、本文件。
- 数据库或契约变化：N/A
- 测试与验证结果：Phase 1 聚焦静态契约 4/4 通过；`git diff --check` 通过。全量验证和版本登记尚未执行。
- PR / CI run：N/A
- 部署环境、Deployment ID、Worker Version：N/A；未触发 Preview、Staging 或 Production
- 用户验收结果：Phase 1、开源字体自托管政策和 Other Handover 中性主题已明确授权
- 阻塞原因：GitHub/npm/jsDelivr 境外网络仍不可达；官方 Barlow Condensed / Noto Sans SC 二进制与最终远端基线暂时不能校验
- 未完成队列：字体二进制校验；全量测试/构建；V5.7.10 登记（5.7.9 的下一补丁；后续补丁才进入 V5.8.0）；远端基线对齐；PR/CI/Preview
- 下一步：先使用本地缓存完成依赖恢复和全量源码验证；网络恢复后补齐字体与远端对齐，不对相同失败网络路径盲目重试
- Production：forbidden

---

## Checkpoint 2026-07-23 03:42

- Phase：Phase 1 - 设计基础
- 状态：in_progress
- 基线分支和 SHA：本地 `feat/signal-grid-phase1-foundations` / `adb20ec19f0ca2696437a680a9cf6d8e2a46e1ff`；发布前仍须对齐远端最终 Phase 0 行政合并 `6da7263ca03bf6f15b9656d8d0cc27d7ae1b97b0`
- 本阶段完成范围：初始 Phase 1 代码审查完成；未验证的 Barlow Condensed / Noto Sans SC 已从活动运行时字体栈移除，确保只有已入库并校验的 Albert Sans 与平台中文黑体参与渲染；新增 AA 合规的深色危险操作面 Token，保留亮红作为危险信号/边框。
- 关键决策：字体候选只有在官方二进制、许可证、来源和 SHA-256 全部验证后才能成为活动运行时字体；危险语义同时保留高能量信号红与可承载小号浅色文字的深红面，不假设 `#F02D3A` 与白字自动满足 AA。
- 修改文件：前一检查点所列 Phase 1 文件，加上危险层级/字体回退约束及对应静态测试；没有业务、API、数据库、权限或契约修改。
- 数据库或契约变化：N/A
- 测试与验证结果：工作流策略 88/88；Domain 4/4；Database 5/5；Web 104/104；API 16/16；Worker 11/11；完整 typecheck 通过；Phase 1 聚焦静态契约 4/4 通过；`git diff --check` 通过。首次 production build 按治理预期停在版本登记门：登记文件 321，当前 328。
- PR / CI run：N/A
- 部署环境、Deployment ID、Worker Version：N/A；未触发 Preview、Staging 或 Production
- 用户验收结果：Phase 1、开源字体政策和 Other Handover 中性主题已明确授权
- 阻塞原因：官方 Barlow Condensed / Noto Sans SC 与最终远端基线仍受当前境外网络/GitHub 访问阻塞；本地实现与验证可继续。
- 未完成队列：V5.7.10 正式登记与 stamp；production build/Worker bundle；最终 diff/秘密审查；远端基线对齐；PR/CI/Preview。
- 下一步：使用官方版本脚本登记 V5.7.10，重新运行 version/build/Worker 验证；不重复当前不可达的字体或 GitHub 网络路径。
- Production：forbidden

---

## Checkpoint 2026-07-23 03:49

- Phase：Phase 1 - 设计基础
- 状态：verified
- 基线分支和 SHA：本地 `feat/signal-grid-phase1-foundations` / `adb20ec19f0ca2696437a680a9cf6d8e2a46e1ff`；发布前仍须把功能提交对齐到远端最终 Phase 0 行政合并 `6da7263ca03bf6f15b9656d8d0cc27d7ae1b97b0`
- 本阶段完成范围：V5.7.10 本地候选已完成三层 Token、模块主题映射、Iconoir regular/solid 状态规则、Albert Sans OFL 自托管迁移与来源/许可证/哈希登记、运行时主题标记和 DESIGN.md 代码映射；只加入基础主题钩子，不实施 Phase 2 外壳重构。
- 关键决策：当前活动字体只使用已验证 Albert Sans 与平台中文黑体回退；Barlow Condensed / Noto Sans SC 仍是批准候选，但在官方文件完成来源、许可证与 SHA-256 校验前不参与运行时。危险语义使用亮红信号/边框加深红操作面，确保小号浅色文字达到 AA。
- 修改文件：`apps/web/src/styles/signal-grid-{fonts,primitives,semantic,components}.css`、`apps/web/src/design/signalGrid.js`、场景/导航/闭店主题钩子、Iconoir regular/solid alias 与语义图标、Albert Sans 资源与 OFL/来源文档、`tests/signal-grid-phase1.test.mjs`、`DESIGN.md`、版本与发布说明、本文件。
- 数据库或契约变化：N/A
- 测试与验证结果：V5.7.10 / 328 指纹文件；工作流策略 88/88；Domain 4/4；Database 5/5；Web 104/104；API 16/16；Worker 11/11；完整 typecheck、Web/API production build、Worker typecheck/bundle、version check、diff check 全部通过。Web CSS 96.67 kB（gzip 18.12），JS 455.83 kB（gzip 158.07）；Worker 270.3 kB / 150.1 kB minified。Phase 1 静态契约含模块色、主题作用域、图标状态、字体来源和危险对比度验证。
- PR / CI run：N/A
- 部署环境、Deployment ID、Worker Version：N/A；未触发 Preview、Staging 或 Production
- 用户验收结果：Phase 1 范围、开源字体政策与 Other Handover 中性主题已明确授权；尚待 Preview 人工验收
- 阻塞原因：当前境外网络/GitHub 认证仍不可用，无法取得官方 Barlow/Noto 二进制，也无法将本地提交对齐/发布到远端最终基线。
- 未完成队列：最终 staged diff/秘密模式审查；创建本地可恢复功能提交；恢复 VPN/GitHub 后对齐 `6da7263c…`、PR/CI/Preview；Barlow/Noto 官方资源作为后续字体补充，未验证前不得进入仓库。
- 下一步：完成本地提交和抗中断记录；然后停止网络依赖路径，等待 VPN/GitHub 恢复后继续发布。
- Production：forbidden

---

## Checkpoint 2026-07-23 03:52

- Phase：Phase 1 - 设计基础
- 状态：verified
- 基线分支和 SHA：本地 `feat/signal-grid-phase1-foundations`，功能提交父级 `adb20ec19f0ca2696437a680a9cf6d8e2a46e1ff`；远端发布前仍须对齐 Phase 0 最终行政合并 `6da7263ca03bf6f15b9656d8d0cc27d7ae1b97b0`
- 本阶段完成范围：V5.7.10 Phase 1 设计基础功能提交已创建，工作树在提交后干净；完整范围和验证证据见 03:49 检查点。
- 关键决策：当前提交是抗中断本地恢复锚点，不作为最终 PR SHA；恢复 GitHub 后必须在 `6da7263c…` 上进行普通历史对齐，重新验证并以对齐后的 SHA 发布。
- 修改文件：30 个文件；623 行新增、85 行删除；包括四层 Signal Grid CSS、模块/图标注册、场景主题钩子、Albert Sans 字体/许可证/来源、测试、设计事实和 V5.7.10 元数据。
- 数据库或契约变化：N/A
- 测试与验证结果：继承 03:49 全绿证据；提交前 staged diff whitespace 检查和新增行敏感凭据模式扫描通过；Albert Sans 移动前后 SHA-256 完全一致。
- 内容提交 SHA：`196d86fd432eeccbbc19bcd218d4e1992d0e3a1e`（本地、待远端基线对齐）
- PR / CI run：N/A
- 部署环境、Deployment ID、Worker Version：N/A；未触发 Preview、Staging 或 Production
- 用户验收结果：尚待 Preview 人工验收
- 阻塞原因：当前 GitHub/VPN 与境外字体源访问仍未确认恢复。
- 未完成队列：同版本 checkpoint stamp/提交；远端基线对齐；对齐后全量验证；PR/CI/Preview；官方 Barlow/Noto 字体补充。
- 下一步：生成本地行政检查点提交；其 SHA 只写入长期记忆/session-state，避免自引用。之后仅在网络恢复时尝试远端对齐。
- Production：forbidden

---

## Checkpoint 2026-07-23 04:00

- Phase：Phase 1 - 设计基础
- 状态：in_progress
- 基线分支和 SHA：`feat/signal-grid-phase1-foundations` / `1b8d553907897af0120285442c98511870508741`，直接继承远端 Phase 0 最终行政合并 `6da7263ca03bf6f15b9656d8d0cc27d7ae1b97b0`
- 本阶段完成范围：网络恢复后核验 Fontsource 正式包；加入 Barlow Condensed 400/700/800/900 Latin WOFF2 与 Noto Sans SC Variable 101 个 Unicode-range WOFF2；加入 OFL 许可证、包完整性、逐文件 SHA-256 清单和自托管 CSS；按用户明确授权删除停用的 Noto Serif SC CSS/101 个 WOFF2。
- 关键决策：英文模块显示字体使用 Barlow Condensed Local；中文 UI/显示回退使用 Noto Sans SC Variable；Albert Sans 继续承担 Latin UI/数字。所有字体本地托管并使用 `font-display: swap`，无第三方运行时请求。字体替换发生在已登记 V5.7.10 之后，因此按版本规则进入 V5.8.0。
- 修改文件：新增 `barlow-condensed/`、`noto-sans-sc/`、`signal-grid-noto-sans-sc.css` 和各自 SHA 清单；更新字体层、语义字体栈、SOURCES、DESIGN、测试和本规范；删除旧 `noto-serif-sc.css` 与 `public/fonts/noto-serif-sc/`。
- 数据库或契约变化：N/A
- 测试与验证结果：字体包/许可证/文件已完成本地来源与 SHA 核验；完整 V5.8.0 验证尚待执行。
- PR / CI run：N/A
- 部署环境、Deployment ID、Worker Version：N/A；未触发 Preview、Staging 或 Production
- 用户验收结果：用户明确允许用 Noto Sans SC 替换并删除旧 Serif 资源。
- 阻塞原因：N/A
- 未完成队列：V5.8.0 bump/stamp；聚焦字体测试；全量验证；提交/checkpoint；PR/CI/Preview。
- 下一步：完成 V5.8.0 登记和全部验证。
- Production：forbidden

---

## Checkpoint 2026-07-23 04:08

- Phase：Phase 1 - 设计基础
- 状态：in_progress
- 基线分支和 SHA：`feat/signal-grid-phase1-foundations` / `1b8d553907897af0120285442c98511870508741`；V5.8.0 字体替换尚未提交
- 本阶段完成范围：production build 后追加运行时审查，发现并修复日报图导出器仍引用已删除 `Noto Serif SC Variable` 的问题；同步修复 Albert Sans 预加载旧路径和 legacy token 字体名。
- 关键决策：日报图不再枚举并手工加载全部 CSS FontFace URL；改为使用 CSS Font Loading API 按实际报告中文内容触发 Noto Sans SC Unicode 分片，并独立确认 Barlow Condensed 与 Albert Sans 已加载。这样保持稳定自托管输出，同时避免无条件加载整套中文字体。
- 修改文件：`closingReportImage.js`、`index.html`、`tokens.css`、`DESIGN.md`、`closing-report-image.test.mjs`、`signal-grid-phase1.test.mjs`、本规范。
- 数据库或契约变化：N/A
- 测试与验证结果：前一轮全量验证已通过，但因真实运行时字体回归不再作为最终证据；新增回归约束后必须重新 stamp 和全量验证。
- PR / CI run：N/A
- 部署环境、Deployment ID、Worker Version：N/A；未触发 Preview、Staging 或 Production
- 用户验收结果：N/A
- 阻塞原因：N/A
- 未完成队列：V5.8.0 restamp；聚焦测试；全量测试/build；编译包旧 Serif 零引用核验；提交/checkpoint；PR/CI/Preview。
- 下一步：重新 stamp 并完整验证。
- Production：forbidden

---

## Checkpoint 2026-07-23 04:18

- Phase：Phase 1 - 设计基础
- 状态：verified
- 基线分支和 SHA：`feat/signal-grid-phase1-foundations` / `1b8d553907897af0120285442c98511870508741`，其功能父级直接继承远端 Phase 0 最终行政合并 `6da7263ca03bf6f15b9656d8d0cc27d7ae1b97b0`
- 本阶段完成范围：V5.8.0 完成字体基础收尾。正式接入自托管 Barlow Condensed 400/700/800/900（含 900 italic）与 Noto Sans SC Variable Unicode 分片；Albert Sans 更新为 Fontsource 5.3.0 Latin/Latin-ext 分片；删除停用 Noto Serif SC。日报图导出器已同步使用新 Sans/Condensed 字体，并按每次日报实际文字加载中文分片，避免第二次导出新汉字回退系统字体。
- 关键决策：所有运行时字体均为 OFL-1.1、仓库自托管、`font-display: swap`，无第三方字体请求；Barlow 只承担英文 Display，Albert Sans 承担 Latin UI/数字，Noto Sans SC 承担中文 UI 与标题回退。旧 Serif 只允许在来源/删除记录中作为历史文字出现，不得出现在运行时 HTML/CSS/JS 或构建字体目录。
- 修改文件：字体二进制/许可证/SHA 清单与 `SOURCES.md`；`signal-grid-fonts.css`、`signal-grid-noto-sans-sc.css`、语义/legacy 字体 Token；`index.html` 字体预加载；日报图字体加载器；DESIGN、本规范、V5.8.0 版本说明与字体/日报回归测试；删除旧 Serif CSS 和 101 个 WOFF2。
- 数据库或契约变化：N/A；没有业务逻辑、API、D1、权限或流程修改。
- 测试与验证结果：V5.8.0 / 338 指纹文件；工作流策略 88/88；Domain 4/4；Database 5/5；Web 105/105；API 16/16；Worker 11/11；完整 typecheck、Web/API production build、Worker typecheck/bundle、version、diff 全部通过。Web CSS 194.49 kB（gzip 49.58），JS 455.24 kB（gzip 157.83）；Worker 270.3 kB / 150.1 kB minified。构建运行时审查确认 HTML/CSS/JS 与字体目录零旧 Serif 引用/文件；108 个 WOFF2 文件头全部有效，public/dist 字体资产均为 4,712,220 bytes。
- 内容提交 SHA：`aeb6829d93d11176fe231fb4d0d9b4edb2b517c4`。
- PR / CI run：N/A
- 部署环境、Deployment ID、Worker Version：N/A；未触发 Preview、Staging 或 Production。
- 用户验收结果：用户明确授权删除旧 Serif 并换用已验证 Noto Sans SC，同时继续加入 Barlow Condensed；尚待 Preview 人工验收。
- 阻塞原因：N/A
- 未完成队列：最终 staged diff/凭据模式审查；创建 V5.8.0 功能提交和非递归行政检查点；PR/CI；正常合并；Preview-only 部署与身份核验。
- 下一步：完成本地提交，随后按既定自动交付策略执行 PR -> CI -> 正常合并 -> Preview；Staging 仍需用户另行明确批准。
- Production：forbidden
