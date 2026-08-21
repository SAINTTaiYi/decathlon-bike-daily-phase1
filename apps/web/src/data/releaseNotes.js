export const APP_VERSION = "6.2.1"

export const currentRelease = {
  version: APP_VERSION,
  date: "2026.08.21",
  title: "ShipHub 每店独立账号与连接权限",
  summary: "每个门店使用自己的 ShipHub 账号与门店编号，凭据由门店管理员加密设置（AES-256-GCM），仅本店可用；操作员可凭已存凭据一键重连；同一上游账号不可连接多家门店；连续同步失败自动邮件告警（可配置）。",
  changes: [
    "每店独立 ShipHub 账号：门店管理员在「Shiphub 连接」弹窗设置本店账号与 location_num，加密存储，仅本店可用",
    "连接权限：添加/更换账号仅限门店管理员；普通操作员可凭已存凭据一键重连",
    "同一上游账号只允许连接一家门店（防止共享账号互相挤占 token 族）",
    "同步连续失败 3 次自动邮件告警（SHIPHUB_ALERT_EMAIL 配置后生效）"
  ]
}
