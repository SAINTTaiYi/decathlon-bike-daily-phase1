export const APP_VERSION = "5.6.2"

export const currentRelease = {
  version: APP_VERSION,
  date: "2026.07.20",
  title: "修复移动端空间视差与连续滑动",
  summary: "移除滚动容器的动画变换，改为独立景深平面与局部视觉层响应；手机端强化可见空间感，同时保留原生连续滑动。",
  changes: [
    "不再对页面滚动壳或内容平面执行滚动 tween，触屏下可连续原生滑动。",
    "新增远近固定景深平面、导航和区块层差，手机端提升到肉眼明显的空间强度。",
    "保留登录入场、跳过、Reduced Motion 和编辑/筛选/弹窗降噪规则。"
  ]
}
