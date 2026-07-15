export const APP_VERSION = "5.2.8"

export const currentRelease = {
  version: APP_VERSION,
  date: "2026.07.15",
  title: "CI 全历史 Secret 扫描加固",
  summary: "修复首次推送时 Gitleaks 根提交范围失效的问题，并将 GitHub Actions 升级到 Node 24 运行时与固定提交 SHA。",
  changes: [
    "Gitleaks 固定为 8.30.1，下载后校验官方 SHA-256，并扫描包含根提交在内的完整 Git 历史。",
    "GitHub Actions checkout、setup-node 与 upload-artifact 固定到已审计的 Node 24 提交 SHA，消除 Node 20 弃用风险。",
    "工作流静态治理新增外部 Action 完整 SHA、Gitleaks 版本、二进制摘要、完整历史和无持久凭证约束。"
  ]
}
