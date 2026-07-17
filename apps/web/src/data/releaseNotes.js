export const APP_VERSION = "5.3.2"

export const currentRelease = {
  version: APP_VERSION,
  date: "2026.07.17",
  title: "EdgeOne 安装兼容修复",
  summary: "修复 EdgeOne 只读构建环境中的 Corepack 安装失败，并同步部署治理测试。",
  changes: [
    "EdgeOne 安装与构建改用固定版本的 corepack pnpm，不再向 /usr/local/bin 写入 shim。",
    "同步 Workflow 治理验证器和部署测试，确保配置与 CI 期望一致。"
  ]
}
