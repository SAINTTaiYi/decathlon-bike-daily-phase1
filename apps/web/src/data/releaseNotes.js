export const APP_VERSION = "6.1.3"

export const currentRelease = {
  version: APP_VERSION,
  date: "2026.08.19",
  title: "Shiphub 自动重连修复：PKCE code_verifier",
  summary: "修复一键自动重连在 token 交换阶段失败的问题（授权请求发送 PKCE challenge 但交换时未携带 verifier，IdP 校验失败）。",
  changes: [
    "修复自动重连 503：token 交换现在正确携带 PKCE code_verifier",
    "SSO 浏览器回调路径同样补齐 verifier 传递，消除潜在同类缺陷"
  ]
}
