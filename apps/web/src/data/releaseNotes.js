export const APP_VERSION = "6.6.0"

export const currentRelease = {
  version: APP_VERSION,
  date: "2026.09.04",
  title: "perfeco 整车换源：闭店 KPI 自动同步与 BI×CIS 双源对比",
  summary: "闭店弹窗自动同步当日新车/二手车实销；销售榜按全渠道/线上/线下展示 perfeco 整车周实销（含 W 周期与数据源标注）；Shiphub 日报改用官方车型名并剔除非整车，标识与手动自提同构（渠道名+在途）；新增门店 TO/DIS 的 BI 与 CIS 双源周对比。",
  changes: [
    "闭店「填写数据」自动同步当日新车/二手车台数（perfeco 实销），未保存字段自动填入",
    "销售榜换源 CIS perfeco：全渠道/线上/线下三视图，数据源与 W 周期显式标注",
    "整车口径：families 白名单服务端过滤，轮滑鞋/头盔/手套等配件不再混入车型榜",
    "Shiphub 日报：标题显示官方车型名而非颜色尺码；非整车整条剔除；右侧标识改为渠道名（在途加后缀）；JDDJ/Meituan 翻译补齐",
    "门店 TO/DIS 新增 BI×CIS 双源周对比卡（口径差异如实披露）",
    "BI 接口读行与登录预算收敛：D1 全点查、惰性 IdP 登录、多级缓存"
  ]
}
