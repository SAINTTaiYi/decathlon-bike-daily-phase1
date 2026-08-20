export const APP_VERSION = "6.1.4"

export const currentRelease = {
  version: APP_VERSION,
  date: "2026.08.20",
  title: "定位脚本安装引导修复：不再依赖油猴页面全局检测",
  summary: "修复店内电脑装完 Tampermonkey 后 ops 仍提示「未检测到 Tampermonkey」的检测失效问题；安装引导改为两步合一卡片（装油猴可跳过 + 下载脚本），新增 Chrome 开发者模式提示与「重新检测」按钮；定位脚本升级 v0.2.1，双标记检测在任何执行世界均可靠。",
  changes: [
    "修复定位脚本安装检测失效：原实现依赖 window.Tampermonkey 页面全局判断油猴是否安装，该全局在页面中并不存在（油猴页面通信走 window.external.Tampermonkey，Chrome 上 5.3.2+ 还需开启开发者模式），导致装完油猴后引导仍显示「未检测到 Tampermonkey」",
    "安装引导改为两步合一卡片：安装油猴扩展（工具栏已有油猴图标可跳过）+ 一键下载定位脚本，新增「重新检测」按钮实时刷新识别状态",
    "引导文案补充 Chrome 开发者模式提示：Tampermonkey 5.3+ 需在 chrome://extensions 开启「开发者模式」后才会运行用户脚本",
    "定位脚本升级 v0.2.1：除 window.__shiphubLocatorInstalled 标记外，额外写入 <html data-shiphub-locator> DOM 属性，主世界/隔离沙箱等任意执行世界均可检测到"
  ]
}
