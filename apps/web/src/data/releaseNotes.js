export const APP_VERSION = "5.3.4"

export const currentRelease = {
  version: APP_VERSION,
  date: "2026.07.17",
  title: "管理员可添加用户",
  summary: "在日报菜单中为管理员提供添加同事账号的能力，并补齐 Worker 与 API 的创建用户接口。",
  changes: [
    "管理员可在日报菜单中添加当前门店用户，并生成首次登录临时密码。",
    "Worker 与 API 新增仅管理员可用的创建用户接口，新账号首次登录必须改密。",
    "新增账号创建对话框与角色选择，避免继续依赖助手手工改库。"
  ]
}
