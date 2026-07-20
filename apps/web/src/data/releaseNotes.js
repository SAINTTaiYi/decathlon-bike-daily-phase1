export const APP_VERSION = "5.6.1"

export const currentRelease = {
  version: APP_VERSION,
  date: "2026.07.20",
  title: "工作台空间入场与视差响应",
  summary: "登录成功后，既有首页会以可跳过的空间组装动效进入；常规浏览保留低干扰的滚动、指针与触屏层次响应。",
  changes: [
    "真实登录并完成首页数据水合后，播放一次由现有刊头、闭店摘要、首屏图片和 KPI 组成的 GSAP 空间入场。",
    "支持点击遮罩、跳过按钮和 Escape 即时收束；Reduced Motion 使用短淡入并将焦点交回主内容。",
    "全页采用有限 ScrollTrigger 组级视差与卡片低幅 3D 响应；输入、筛选、菜单和弹窗时自动显著减弱。"
  ]
}
