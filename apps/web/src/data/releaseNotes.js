export const APP_VERSION = "6.1.5"

export const currentRelease = {
  version: APP_VERSION,
  date: "2026.08.20",
  title: "定位脚本安装引导适配油猴 MV3 安装流程",
  summary: "TM 5.3.2 起（MV3）点击 .user.js 链接默认不再自动弹出安装确认，原引导文案误导门店；现改为拖拽到油猴管理面板或把「用户脚本 URL 检测」改为传统模式，并补充 Chrome 138+「允许用户脚本」开关说明。",
  changes: [
    "安装引导文案适配油猴 MV3：TM 5.3.2 起点击 .user.js 链接不再自动弹安装确认，提示改为「把下载的文件拖到油猴管理面板，或在油猴设置里把『用户脚本 URL 检测』改为传统模式」",
    "引导文案补充 Chrome 138+ 替代开关：除 chrome://extensions 开发者模式外，可在油猴扩展详情开启「允许用户脚本」"
  ]
}
