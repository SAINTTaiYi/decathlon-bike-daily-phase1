export const APP_VERSION = "5.8.0"

export const currentRelease = {
  version: APP_VERSION,
  date: "2026.07.23",
  title: "Signal Grid 字体基础",
  summary: "完成下一代视觉系统的开源字体自托管与资产替换。",
  changes: [
    "加入经来源、OFL 许可与 SHA-256 校验的 Barlow Condensed 自托管字重。",
    "加入 Noto Sans SC Variable Unicode 分片并接入中文 UI 与显示字体栈。",
    "移除停用的 Noto Serif SC 资源，降低无效发布体积。"
  ]
}
