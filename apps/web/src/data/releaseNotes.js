export const APP_VERSION = "5.3.6"

export const currentRelease = {
  version: APP_VERSION,
  date: "2026.07.18",
  title: "修复私有仓库 Staging 发布校验",
  summary: "修复 GitHub Actions 在 persist-credentials=false 时无法读取远程分支头的问题。",
  changes: [
    "Staging 发布校验仅临时使用 github.token 做只读 fetch。",
    "继续保持 Cloudflare Free Staging 直连 Wrangler 发布路径。"
  ]
}
