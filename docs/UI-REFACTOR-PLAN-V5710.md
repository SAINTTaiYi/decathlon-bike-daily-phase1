# Workshop UI 重构方案 V5.7.10

**方案版本**: 1.0  
**制定日期**: 2026-07-28  
**目标版本**: V5.7.10  
**项目基线**: V5.7.8 (workshop-staging-retry-checkpoint)

---

## 一、重构目标与边界

### 1.1 核心目标

1. **首屏与 KPI 高度融合** — 将当前分离的 KPI 数据卡片与业务模块导航深度整合，减少视觉层级，提升信息密度
2. **车辆卡片信息整合** — 压缩待取/维修车辆卡片的垂直占用，整合冗余字段，提高单屏展示数量
3. **二级页面菜单重构** — 统一所有业务模块的次级导航模式，优化交互路径

### 1.2 边界确认

- **允许后端改动** — 可新增/合并聚合查询端点，优化首屏数据加载性能
- **保持路由与权限逻辑** — 不改变现有 URL 结构、鉴权中间件和角色权限
- **兼容现有动效系统** — 新设计需适配 Endfield Maximal 视觉深度与 GSAP 动画编排
- **验收方式** — Preview 独立验收，通过后再合并主线

---

## 二、现状分析

### 2.1 首屏结构（PulseScene）

**当前布局**：
```
┌─────────────────────────────────────┐
│ KPI Sheet (data-motion="data")      │
│ ├─ 主KPI：销售车辆 (大卡片)           │
│ └─ 次要KPI：安全检查/评价/二手车 (4行) │
├─────────────────────────────────────┤
│ Handover Index (业务台账导航)         │
│ ├─ 待取车辆 (count)                  │
│ ├─ 其它交接 (count)                  │
│ ├─ 维修交接 (count)                  │
│ ├─ 二手车台账 (count)                │
│ └─ 销售数据 (ready/due)              │
└─────────────────────────────────────┘
```

**问题诊断**：
- KPI 与导航分离成两个独立区块，视觉割裂
- 主 KPI 卡片占据过大空间，次要 KPI 4 行排列冗长
- 导航区域仅展示计数，缺少 KPI 关联提示
- 两区块间缺少数据关联的视觉线索

### 2.2 车辆卡片结构（RecordLedger）

**当前字段布局** (单卡约 180-220px 高度)：
```
┌─────────────────────────────────────┐
│ Header                               │
│ ├─ 操作记录图标                       │
│ ├─ 车型 (title)                      │
│ ├─ 票据号 (ticketNumber)             │
│ ├─ 通知状态下拉 (pickup only)         │
│ └─ 徽章行：来源/支付/状态/meta         │
├─────────────────────────────────────┤
│ Body                                 │
│ ├─ 维修内容 (detail 完整文本)         │
│ ├─ 扫描行：联系方式 + 取车日期         │
│ ├─ 错误提示 (条件显示)                │
│ ├─ 完成提示 (条件显示)                │
│ └─ 操作按钮：编辑 + 主操作             │
└─────────────────────────────────────┘
```

**问题诊断**：
- 维修内容 `detail` 字段全文展示，常见案例占 2-3 行
- 徽章行 4 个徽章横向排列，在窄屏换行造成高度不稳定
- 联系方式与取车日期分行，实际可合并
- Header meta 与 Body 扫描行存在信息重复（状态、日期）

### 2.3 二级页面导航

**当前模式** — 无统一二级导航，各场景独立处理：
- `PickupScene` / `RepairScene` / `ResaleScene` — 直接进入 RecordLedger，无二级筛选
- `SalesScene` — 仅 KPI 编辑对话框
- 跨场景跳转依赖首屏 Handover Index

**问题诊断**：
- 缺少场景内快速导航（如"今日已取" vs "等待取车"）
- 无统一的"返回首屏"交互模式
- 历史记录/筛选功能分散在对话框中，不符合移动端习惯

---

## 三、设计方案

### 3.1 首屏 KPI 融合设计

#### 3.1.1 整合原则

**核心思路** — 将 KPI 数据嵌入业务导航卡片，形成"数据驱动的导航"：

```
┌─────────────────────────────────────┐
│ 日期 + 主KPI (紧凑版)                 │
│ ├─ 2026 / 07 / 28                   │
│ ├─ 销售车辆 12 台 (ready/due 状态)   │
│ └─ 次要KPI 横向紧凑显示 (icon + 数字) │
├─────────────────────────────────────┤
│ 融合导航模块 (5个卡片)                │
│ ┌────────────┬────────────┐          │
│ │ 待取车辆    │ 其它交接    │          │
│ │ 8 台       │ 2 条       │          │
│ │ KPI: 评价3 │            │          │
│ └────────────┴────────────┘          │
│ ┌────────────┬────────────┐          │
│ │ 维修交接    │ 二手车台账  │          │
│ │ 5 条       │ 收3 售1     │          │
│ │ KPI: 安检4 │            │          │
│ └────────────┴────────────┘          │
│ ┌──────────────────────────┐        │
│ │ 销售数据 (主KPI复现)       │        │
│ │ 12 台 · READY            │        │
│ └──────────────────────────┘        │
└─────────────────────────────────────┘
```

#### 3.1.2 视觉层级

- **L1 主KPI头部** — 缩小至 80px 高度，水平布局：日期 + 销售车辆数 + ready 状态
- **L2 次要KPI栏** — 4 个次要 KPI 改为图标+数字横向排列（安全检查/评价/收车/售车），高度 36px
- **L3 融合导航卡片** — 2x2 网格 + 1 个底部通栏，每个卡片内嵌：
  - 模块名称（如"待取车辆"）
  - 记录计数（大号数字）
  - 关联 KPI 提示（如"评价 3"小字灰色）

#### 3.1.3 交互优化

- 点击任意导航卡片 → 跳转对应场景并显示二级筛选栏
- 主 KPI 头部可点击 → 快速编辑销售数据
- 次要 KPI 图标可点击 → 跳转关联场景（如安全检查 → 维修交接）

### 3.2 车辆卡片信息整合方案

#### 3.2.1 紧凑布局设计

**目标高度** — 单卡从 180-220px 压缩至 120-140px

**字段整合规则**：

```
┌─────────────────────────────────────┐
│ Header (单行，60px)                  │
│ ├─ [图标] 车型 · 票据号               │
│ └─ 状态徽章 (单个，自动优先级)         │
├─────────────────────────────────────┤
│ Body (紧凑，60-80px)                 │
│ ├─ 维修内容 (截断 1 行 + 展开按钮)     │
│ ├─ 元数据行：📞联系方式 | 📅取车日期 | 来源 │
│ └─ 操作区：[编辑] [主操作] (右对齐)    │
└─────────────────────────────────────┘
```

**具体改动**：

1. **Header 单行化**
   - 车型 + 票据号合并为 `车型 · 票据号` 格式
   - 徽章行 4 个徽章改为智能单徽章：
     - 优先级：`已取车` > `已完成` > `维修类型` > `来源` > `其它`
     - 其它信息移至 Body 元数据行

2. **维修内容截断**
   - 默认显示 1 行（约 60 字符），超出显示 `...` + 小型展开图标
   - 点击展开图标 → 原地展开完整内容（不跳转对话框）
   - 已展开卡片右上角显示收起图标

3. **元数据行合并**
   - 联系方式、取车日期、来源 用 `|` 分隔横向排列
   - 使用图标前缀减少文字（📞 / 📅 / 🏷️）
   - 字号缩小为 12px，灰色

4. **通知状态优化**（pickup only）
   - 从 Header 移至 Body 操作区左侧
   - 改为图标按钮 + tooltip：`🔔` (已通知) / `🔕` (待通知)

#### 3.2.2 响应式策略

- **宽屏 (>= 768px)** — 卡片可展示为两列网格
- **窄屏 (< 768px)** — 单列，维持 120-140px 高度
- **超窄屏 (< 375px)** — 元数据行可折叠为两行

### 3.3 二级页面菜单重构

#### 3.3.1 统一导航模式

**新增组件** — `SceneSubNav.jsx` 通用二级导航栏

```jsx
<nav className="scene-subnav" data-workspace-priority="true">
  <button onClick={onBack}>← 首屏</button>
  <div className="subnav-tabs">
    <button data-active={tab === 'all'}>全部 (12)</button>
    <button data-active={tab === 'today'}>今日 (3)</button>
  </div>
  <button onClick={onFilter}>筛选</button>
</nav>
```

**适配场景**：

| 场景 | Tab 1 | Tab 2 | 筛选器 |
|------|-------|-------|--------|
| Pickup | 等待取车 | 今日已取 | 日期/来源 |
| Repair | 进行中 | 已完成 | 维修类型/日期 |
| Resale | 在册 | 已售出 | 阶段/日期 |
| Poster | 全部 | 已完成 | 日期 |

#### 3.3.2 交互规范

- **位置** — 固定在场景顶部，滚动时不吸顶（保持文档流）
- **返回首屏** — 左侧箭头按钮，点击触发 `jumpTo('pulse')`
- **Tab 切换** — 本地状态筛选，无需请求后端
- **筛选器** — 打开浮层对话框（日期选择器 + 多选框）

---

## 四、后端聚合接口设计

### 4.1 新增端点：`GET /api/v1/dashboard/summary`

**用途** — 为首屏融合设计提供单次请求获取所有 KPI + 模块计数

**请求参数**：
```typescript
{
  storeId: string
  businessDate: string // YYYY-MM-DD
}
```

**响应结构**：
```typescript
{
  businessDate: string
  kpi: {
    salesVehicles: number
    safetyChecks: number
    validReviews: number
    usedSold: number
    usedReceived: number
    safetyModel: string | null
    ready: boolean // 销售数据是否已填写
  }
  modules: {
    pickup: { waiting: number, completedToday: number }
    repair: { active: number, completedToday: number }
    resale: { pending: number, listed: number, soldToday: number }
    poster: { active: number, completedToday: number }
  }
  closedAt: string | null
}
```

**实现路径**：
- 新建 `apps/api/src/routes/dashboard.ts`
- 复用 `getOrCreateDay` 获取 KPI
- 复用 `listWorkItems` 并按 scene 分组计数
- 在 `server.ts` 注册路由

### 4.2 优化端点：`GET /api/v1/bootstrap`

**变更** — 保持现有结构不变，但内部调用 `/dashboard/summary` 逻辑减少重复查询

**向后兼容** — 现有前端代码无需修改

### 4.3 数据库查询优化

**当前问题** — `listWorkItems` 全量查询后前端分组

**优化方案** — 在 `work-items.ts` repository 新增：
```typescript
export async function countWorkItemsByScene(
  sql: Database,
  storeId: string,
  businessDate: string
): Promise<Record<string, { active: number, completedToday: number }>>
```

**SQL 实现**：
```sql
SELECT 
  scene,
  COUNT(*) FILTER (WHERE picked_up_on IS NULL AND completed_on IS NULL) as active,
  COUNT(*) FILTER (WHERE picked_up_on = $businessDate OR completed_on = $businessDate) as completed_today
FROM work_items
WHERE store_id = $storeId 
  AND (created_on <= $businessDate)
  AND (picked_up_on IS NULL OR picked_up_on >= $businessDate)
  AND (completed_on IS NULL OR completed_on >= $businessDate)
GROUP BY scene
```

---

## 五、实施计划

### 5.1 阶段划分

#### Phase 1: 后端基础 (1 天)
- [ ] 新建 `dashboard.ts` 路由文件
- [ ] 实现 `countWorkItemsByScene` repository 函数
- [ ] 实现 `/api/v1/dashboard/summary` 端点
- [ ] 编写单元测试（覆盖计数逻辑）
- [ ] 更新 API 类型定义

#### Phase 2: 前端组件重构 (2 天)
- [ ] 创建 `SceneSubNav.jsx` 通用二级导航组件
- [ ] 重构 `PulseScene.jsx` — 实现融合导航设计
- [ ] 重构 `RecordLedger.jsx` — 实现紧凑卡片布局
- [ ] 新建 `RecordCardExpanded.jsx` — 处理维修内容展开状态
- [ ] 适配 `PickupScene` / `RepairScene` / `ResaleScene` 使用 SceneSubNav

#### Phase 3: 样式与动效 (1 天)
- [ ] 编写融合导航 CSS（网格布局 + 卡片悬停）
- [ ] 编写紧凑卡片 CSS（单行 header + 截断文本）
- [ ] 适配 Endfield 深度层（data-depth-card 属性）
- [ ] 编写卡片展开/收起 GSAP 动画
- [ ] 响应式断点测试（375px / 768px / 1024px）

#### Phase 4: 集成测试与验收 (1 天)
- [ ] 前后端联调（dashboard summary 端点）
- [ ] 跨场景导航测试（首屏 → 二级 → 返回）
- [ ] 卡片交互测试（展开/编辑/删除/主操作）
- [ ] 动效流畅度测试（reduced-motion 兼容）
- [ ] CodeGraph 门禁验证
- [ ] 部署 Preview 环境

### 5.2 验收标准

**功能验收**：
- [ ] 首屏 KPI 与导航融合，单屏展示所有关键数据
- [ ] 车辆卡片高度从 180-220px 降至 120-140px
- [ ] 所有业务场景显示统一二级导航
- [ ] 维修内容默认截断 1 行，可点击展开
- [ ] 导航计数准确（与现有 RecordLedger 计数一致）

**性能验收**：
- [ ] 首屏数据加载从 2 次请求降至 1 次（dashboard summary）
- [ ] 卡片渲染性能无回退（列表滚动 60fps）
- [ ] 动画流畅度达标（Chrome DevTools Performance 无掉帧）

**兼容性验收**：
- [ ] 移动端适配（iOS Safari / Android Chrome）
- [ ] 窄屏布局无横向滚动（最低 375px）
- [ ] reduced-motion 模式下动画降级
- [ ] 现有 E2E 测试通过（174 测试套件）

---

## 六、风险评估与应对

### 6.1 技术风险

| 风险项 | 影响 | 概率 | 应对措施 |
|--------|------|------|----------|
| RecordLedger 重构破坏现有交互 | 高 | 中 | 保留原组件为 `RecordLedgerLegacy`，分阶段切换 |
| dashboard summary 查询性能问题 | 中 | 低 | 增加 Redis 缓存层（5 分钟 TTL） |
| 融合导航在窄屏显示不佳 | 中 | 中 | 提供"紧凑模式"备选设计 |
| GSAP 动画与 Endfield 深度冲突 | 低 | 低 | 预先验证 z-index 层级 |

### 6.2 用户体验风险

| 风险项 | 影响 | 概率 | 应对措施 |
|--------|------|------|----------|
| 卡片信息过度压缩导致可读性下降 | 高 | 中 | A/B 测试两版高度（120px vs 140px） |
| 维修内容截断丢失关键信息 | 中 | 中 | 提供"展开全部"快捷键（Shift+Space） |
| 用户不适应新首屏布局 | 中 | 高 | Preview 阶段收集反馈，保留回退开关 |

### 6.3 时间风险

- **紧凑排期** — 5 天完成存在压缩空间不足风险
- **应对** — Phase 2 可并行前后端开发，Phase 4 提前介入测试

---

## 七、后续优化方向

### 7.1 短期优化 (V5.7.11)

- 卡片批量操作（多选 + 批量删除）
- 首屏 KPI 趋势图（销售车辆 7 日曲线）
- 二级导航增加搜索框（车型/票据号快速定位）

### 7.2 中期优化 (V5.8.x)

- 卡片虚拟滚动（长列表性能优化）
- 首屏自定义布局（管理员配置 KPI 顺序）
- 深色模式适配（当前仅浅色主题）

### 7.3 长期规划 (V6.x)

- 移动端原生应用（React Native）
- 离线优先架构（Service Worker + IndexedDB）
- 智能 KPI 预测（基于历史数据的销售预测）

---

## 八、附录

### A. 关键文件清单

**前端**：
- `apps/web/src/scenes/PulseScene.jsx` — 首屏融合设计
- `apps/web/src/components/lookbook/RecordLedger.jsx` — 卡片整合
- `apps/web/src/components/lookbook/SceneSubNav.jsx` — 新建二级导航
- `apps/web/src/api/workflow.js` — API 客户端适配

**后端**：
- `apps/api/src/routes/dashboard.ts` — 新建聚合端点
- `apps/api/src/repositories/work-items.ts` — 计数查询优化
- `apps/api/src/routes/bootstrap.ts` — 兼容性调整

**测试**：
- `apps/api/test/dashboard.test.ts` — 新建聚合端点测试
- `tests/ui-refactor.test.mjs` — 前端集成测试

### B. 参考资料

- Workshop V5.7.9 Release Notes
- Endfield Maximal 视觉规范文档
- GSAP ScrollTrigger 最佳实践
- Cloudflare Workers 性能优化指南

---

**方案制定者**: Kiro AI Assistant  
**审核状态**: 待用户确认  
**预计工期**: 5 工作日  
**目标 Preview 日期**: 2026-08-02
