export const APP_VERSION = "5.4.7"

export const currentRelease = {
  version: APP_VERSION,
  date: "2026.07.18",
  title: "手机号不溢出 + 分区标题间距",
  summary: "中栏手机号自适应字号并裁剪，避免盖住取车时间；REPAIR/PICKUP 等英文眉题与中文标题拉开间距。",
  changes: [
    "手机号在中栏内自适应缩小，必要时分组显示，硬裁剪不越界。",
    "中栏加宽，右栏取车时间面板仍在卡内。",
    "分区英文与中文标题、标题与卡片之间加大间距。"
  ]
}
