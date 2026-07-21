export const APP_VERSION = "5.7.7"

export const currentRelease = {
  version: APP_VERSION,
  date: "2026.07.22",
  title: "主工作台旧纸材质",
  summary: "登录后的主工作台改为克制的旧纸背景与印刷磨损标题，业务内容、操作流程和其他页面保持不变。",
  changes: [
    "主工作台以 #EFEEEC 为底，固定叠加 4.5% 胶片颗粒、2.6% 纸纤维和 1.6% 极浅灰做旧划痕。",
    "刊头、模块标题、摘要标题、票据车型标题和图片标题增加低对比、不规则的印刷磨损纹理。",
    "纸张与文字材质仅在已登录且工作台就绪时生效，登录、Dialog、表单、日报图和 Forced Colors 保持清晰回退。"
  ]
}
