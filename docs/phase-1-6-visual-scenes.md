# Phase 1.6：Visual Scenes Expansion

## 目标

继续方向 A：补齐后续视觉场景，让页面从前三屏扩展为完整的移动端作品集叙事。

## 新增场景

### 1. Pickup / Online Scene

- 待取车辆做成横向 swipe cards
- 线上自提做成暗色订单信号面板
- 点击卡片进入 Bottom Action Sheet

### 2. Inventory Signal Scene

- Workshop 配件库存做成扫描信号场景
- 只突出影响维修闭环的关键 SKU
- 使用等宽字体、扫描线、amber 警示色

### 3. Resale Studio Scene

- 待处理二手车辆做成作品集式产品卡
- BTWIN Riverside 500 作为主视觉
- Condition / Price / Stage 进入隐藏操作层

### 4. Sales Finale Scene

- 今日售出车辆和二手车作为闭店最终海报
- 只突出大数字和销售结果冲击力
- 弱化完整销售表

## Dock 更新

底部 Dock 从 4 个入口扩展到 5 个入口：

- Poster
- Pulse
- Repair
- Flow：包含 Pickup / Inventory / Resale / Sales 场景
- Actions

Flow 按钮会跳转到 Pickup Scene，并在后续流动场景中保持高亮。

## 构建状态

`pnpm build` 已通过。

## 下一步建议

1. 观察新增四个场景是否保持高级作品集感。
2. 如果方向满意，下一步接入真实 React Bits / Shader Gradient。
3. 如果想继续扩展，可做场景之间的滚动过渡和更强 GSAP 叙事。
