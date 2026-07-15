export const APP_VERSION = "5.2.9"

export const currentRelease = {
  version: APP_VERSION,
  date: "2026.07.15",
  title: "Staging 启动门禁加固",
  summary: "修复 Staging 发布身份导出的 Shell 引号错误，并在基础设施尚未 Bootstrap 时安全跳过自动部署。",
  changes: [
    "修复 deploy-staging 的 APP_VERSION 导出命令，避免 Bash 在云端发布前因错误转义提前失败。",
    "新增已提交 staging state 的 readiness gate；未 Bootstrap 时只输出 notice，不读取 Secret、不执行发布或云资源变更。",
    "Staging GitHub Environment 限制为 develop 分支，工作流治理扩展到 43 项策略并新增回归测试。"
  ]
}
