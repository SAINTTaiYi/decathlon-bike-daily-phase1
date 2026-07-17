export const APP_VERSION = "5.3.3"

export const currentRelease = {
  version: APP_VERSION,
  date: "2026.07.17",
  title: "Cloudflare 登录兼容修复",
  summary: "修复 Cloudflare Workers 对 PBKDF2 迭代次数的运行时限制，并加固 Worker 构建与测试链。",
  changes: [
    "密码哈希统一使用 Cloudflare WebCrypto 支持的 100000 次 PBKDF2，并对不兼容哈希安全失败。",
    "新增 Worker 密码哈希回归测试，并纳入仓库完整测试流程。",
    "Cloudflare 部署每次从源码生成 minified Worker，不再依赖可能过期的临时制品。"
  ]
}
