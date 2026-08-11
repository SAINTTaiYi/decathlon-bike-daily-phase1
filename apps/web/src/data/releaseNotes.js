export const APP_VERSION = "5.9.2"

export const currentRelease = {
  version: APP_VERSION,
  date: "2026.08.11",
  title: "广西多门店内测就绪：闭店防漏 + 自助注册上线",
  summary: "自 V5.9.1 后合并 3 组改动：闭店前逐模块确认并逐台盘点在店车辆（PR #191/#192），Production 自助注册开通且注册审计邮箱脱敏。覆盖广西四店（南宁 1299/1670、桂林 994、柳州 1249）。",
  changes: [
    "闭店弹窗新增待取/维修/交接三模块确认，三项确认后才能最终确认闭店；有变动显示变动项，无变动提示与昨日一致",
    "闭店前逐台核对在店车辆，覆盖全部四个待取来源，防止漏清车辆",
    "Production 自助注册开通：REGISTRATION_SECRET/Resend 三密钥上线，1670/994/1249 员工可自助建号",
    "注册审计邮箱脱敏：完整邮箱改为 a***@domain 格式，不再永久留存明文"
  ]
}
