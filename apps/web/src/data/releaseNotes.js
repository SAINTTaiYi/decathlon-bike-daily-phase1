export const APP_VERSION = "6.2.3"

export const currentRelease = {
  version: APP_VERSION,
  date: "2026.08.22",
  title: "Shiphub 定位脚本安装引导优化",
  summary: "修复 Chrome 138+/油猴 5.3+ 下点击 .user.js 直链不再自动弹出安装确认框、导致店内电脑无法拖入安装的问题。改为引导页指向油猴官方一键安装中间页（script_installation.php#url=），已装油猴的浏览器点「一键去油猴安装」即直接弹出安装确认框；同步更新提示文案与按钮样式。",
  changes: [
    "定位脚本引导改为「一键去油猴安装」：指向油猴官方安装中间页，绕开 Chrome 138+ 对 .user.js 直链不再弹框的限制",
    "同步更新引导提示文案与按钮样式"
  ]
}
