export const APP_VERSION = "6.2.4"

export const currentRelease = {
  version: APP_VERSION,
  date: "2026.08.27",
  title: "磨砂导航与新主色 #ffde59",
  summary: "页头与底部导航改为渐变透明磨砂并取消硬边线，收紧页头间隔；主色统一为 #ffde59（按下态近黑、展开卡实心主色）；新增仅 Preview 可见的调色盘编辑器；修复 CI gitSha 取值优先级与调色盘覆盖缺口。",
  changes: [
    "页头/底部导航改渐变透明磨砂（backdrop blur + 渐变 + 遮罩羽化），取消导航顶部硬边线",
    "收紧页头与待取内容之间过大的间隔",
    "主色统一为 #ffde59：pressed #14161a、展开台账卡实心主色，75 处兜底值同步",
    "新增 PaletteLab 调色盘（仅 Preview/localhost 可见），展开卡与增加待取按钮随主色联动",
    "修正构建元数据 gitSha 优先级：RELEASE_SHA 优先于 GITHUB_SHA，CI 缺 RELEASE_SHA 或脏树直接拒绝"
  ]
}
