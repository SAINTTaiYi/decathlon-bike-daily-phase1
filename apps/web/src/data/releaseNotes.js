export const APP_VERSION = "6.4.2"

export const currentRelease = {
  version: APP_VERSION,
  date: "2026.08.31",
  title: "修复 Shiphub 同步假成功",
  summary: "修复待取车同步显示已连接却持续失败、且点同步无任何提示的问题；失败现在会明确报错并引导重新授权。",
  changes: [
    "修复自愈流程写入 refresh token 时用错密钥，导致同步始终解密失败",
    "同步失败不再显示为已连接，界面会降级提示并引导重新授权",
    "手动同步改为返回真实结果，失败时明确显示错误原因与失败分类",
    "自愈写入前回验凭据可用性，避免再次出现看似已连接实际失效的状态"
  ]
}
