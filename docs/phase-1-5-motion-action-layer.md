# Phase 1.5：Motion + Hidden Action Layer

## 本阶段目标

在不补完整业务功能的前提下，让移动端作品集视觉壳具备更强的交互感和动效节奏。

## 已完成

### 1. Bottom Action Sheet

新增隐藏式操作层：

- 点击顶部更多按钮
- 点击 Closing readiness 卡片
- 点击 Blue Liquid Wheel
- 点击 Bento tile
- 点击 Repair Scene 的库存信号或 Open Sheet
- 点击底部 Dock 最右侧按钮

都会打开底部 Action Sheet。

Action Sheet 当前包含视觉入口：

- Edit / 编辑记录
- Confirm / 确认状态
- Revoke / 撤销操作
- Note / 添加备注

当前仅为交互壳，不做真实数据变更。

### 2. Dock 自动高亮

底部 Dock 会根据当前滚动到的场景自动切换高亮：

- Poster
- Pulse
- Repair
- Actions

点击 Dock 的前三个按钮会滚动到对应屏幕。

### 3. GSAP 入场动效

已加入：

- 页面初始 scene stagger 入场
- 每个场景内部 `.motion-item` 进入视口时轻微上移、淡入、去模糊
- reduced motion 下跳过复杂动效

### 4. 触摸反馈

关键元素加入移动端触摸反馈：

- Bento tile active scale
- Action buttons active scale
- Bottom Sheet buttons active scale
- Dock buttons active scale

## 当前构建状态

`pnpm build` 已通过。

## 下一阶段建议

下一阶段可以选：

1. 接入真实 React Bits 组件替换本地 BlurTitle / CountPulse。
2. 接入真实 Shader Gradient 作为 Opening Poster 背景。
3. 继续做 Pickup / Online / Inventory / Resale / Sales 后续场景。
4. 开始做本地数据交互：编辑、确认、撤销、日志、localStorage。
