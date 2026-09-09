export const APP_VERSION = "6.7.6"

export const currentRelease = {
  version: APP_VERSION,
  date: "2026.09.09",
  title: "CubeInStore 26.09.01.01 接口契约适配",
  summary: "适配迪卡侬 CubeInStore 26.09.01.01 新版本的后端契约变更：perfeco 日期参数改为紧凑格式并轮换 API 凭据，恢复销售数据自动同步",
  changes: [
    "perfeco 日期参数契约变更：上游从 yyyy-MM-dd 改为 yyyyMMdd（LocalDateTime 解析），旧格式返回 400，内部缓存键与业务日期仍保持 ISO 不变",
    "perfeco 与 SPD 的 API 凭据轮换，两个 key 独立配置、互不混用",
    "SPD 日期格式经核实未变（仍为 yyyy-MM-dd），仅 perfeco 变更，避免两者一起改导致折扣数据静默归零",
    "新增 apps/worker/test/perfeco-contract.test.ts 6 例契约回归（日期转换、请求 URL 格式、SPD 不受影响、缓存键不变）",
    "全套 759 例零失败（web 504 / worker 207 / api 21 / database 20 / domain 7）"
  ]
}
