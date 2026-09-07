export const APP_VERSION = "6.7.2"

export const currentRelease = {
  version: APP_VERSION,
  date: "2026.09.08",
  title: "门店数据身份自助接入",
  summary: "门店提交本店 ShipHub 账密后自动派生三链路身份：Shiphub 同步、Cube BI 销量与周报、KPI 自动填写，凭据属于谁就只拉谁",
  changes: [
    "门店提交本店 ShipHub 账密后，同一凭据自动登录 BI 系统完成销量/周报/安全检查数据接入",
    "连接卡新增数据身份状态（可用/探测中/未开通），未开通不影响 Shiphub 使用",
    "重连优先复用本店已存凭据；换账号自动作废旧数据身份",
    "修复本店凭据加密密钥与自愈解密密钥不一致的隐患"
  ]
}
