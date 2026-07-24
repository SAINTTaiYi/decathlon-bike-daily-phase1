export const APP_VERSION = "5.9.1"

export const currentRelease = {
  version: APP_VERSION,
  date: "2026.07.24",
  title: "Endfield 验证修正",
  summary: "修正总览与待取车 Endfield 覆盖层的回归断言，使其对应共享无障碍保障与实际选择器。",
  changes: [
    "更新 Ark Endfield 范围测试，验证原始本地样式、待取确认任务层及 forced-colors 与 reduced-motion 降级链路。",
    "不变更框架、路由、数据契约、业务操作、权限、审计或部署目标。"
  ]
}
