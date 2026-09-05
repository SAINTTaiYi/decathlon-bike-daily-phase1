export const APP_VERSION = "6.6.8"

export const currentRelease = {
  version: APP_VERSION,
  date: "2026.09.05",
  title: "账号安全：存量账号强制绑定邮箱",
  summary: "除 admin 与平台管理员外，早期创建的未绑定邮箱账号下次登录将强制绑定公司邮箱并重设密码（可与旧密码一致），绑定后支持邮箱自助找回密码。",
  changes: [
    "存量无邮箱账号登录后强制绑定公司邮箱并重设密码（允许与旧密码一致），完成后可用邮箱自助找回密码；admin 与平台管理员豁免",
    "绑定验证码含单挑战 5 次锁定与每小时错误次数上限，重发冷却不再返回已作废的验证码"
  ]
}
