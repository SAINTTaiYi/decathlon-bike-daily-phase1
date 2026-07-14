# Mobile Portfolio Shell

## 已执行

当前项目已进入 Vite + React + Tailwind 版本，保留旧静态版本备份：

```text
archive-static-v1/
```

## 当前视觉壳包含

1. **Opening Poster**
   - 暗黑移动端封面
   - Shader Gradient 风格 CSS fallback
   - BIKE / DAILY / CLOSE 超大标题
   - 86% closing readiness
   - blue liquid wheel 视觉符号

2. **Daily Pulse Bento**
   - 将每日状态变成 Bento 信息海报
   - Repair / Pickup / Online / Stock / New / Used 六个状态块
   - 大数字优先，功能说明弱化

3. **Repair Feature Scene**
   - 把待维修车辆模块转成作品集式场景
   - Riverside 500 作为视觉主角
   - 库存信号与维修状态结合
   - 操作入口隐藏化

4. **Action Dock**
   - 移动端底部悬浮操作入口
   - 后续可扩展为 21st.dev / shadcn 风格 Sheet

## 当前资源接入状态

- Shader Gradient：当前使用 CSS fallback 模拟流体光影；已在 package scripts 中预留安装脚本。
- React Bits：当前使用本地 BlurTitle / CountPulse 作为替代；已预留 React Bits CLI 脚本。
- GSAP：已作为依赖并在 App 中用于场景初始入场动画。
- Bento Grids：已用于第二屏信息构图。
- MotionSites：用于整体暗黑 Hero / cinematic concept。
- 21st.dev：将在下一阶段用于 Bottom Sheet / Action Drawer。

## 注意

当前沙盒环境执行 npm install 时出现 npm cache rename ENOENT 问题，项目文件本身已准备好；在正常 Node 环境中运行 `npm install && npm run dev` 即可预览。
