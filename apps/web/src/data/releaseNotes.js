export const APP_VERSION = "6.7.4"

export const currentRelease = {
  version: APP_VERSION,
  date: "2026.09.08",
  title: "per-store 凭据入库修复",
  summary: "修复本店凭据对象直 bind 导致的 D1_TYPE_ERROR，per-store connect 首次真正可用",
  changes: [
    "本店凭据以 ciphertext.nonce blob 字符串入库，修复 connect 持续 503"
  ]
}
