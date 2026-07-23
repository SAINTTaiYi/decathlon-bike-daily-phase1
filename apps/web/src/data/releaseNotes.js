export const APP_VERSION = "5.8.8"

export const currentRelease = {
  version: APP_VERSION,
  date: "2026.07.24",
  title: "外部印刷材质原型",
  summary: "将已核验的公共领域与 CC0 扫描材质接入总览和维修原型。",
  changes: [
    "总览、信号场与维修档案台账采用自托管 WebP 派生材质，提供真实纸纤维、复印碳粉、工程线稿和破损边缘。",
    "每项素材均记录来源、许可、原文件与派生文件 SHA-256、精确用途；部署包不含原始文件。",
    "材质仅进入非交互展示层，表单控件、标签、输入值与辅助文本继续保持干净且可访问。"
  ]
}
