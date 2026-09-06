export const APP_VERSION = "6.6.10"

export const currentRelease = {
  version: APP_VERSION,
  date: "2026.09.06",
  title: "BI 门店数据白名单（越权拉取修复）",
  summary: "BI 同步仅允许凭据所属门店（1299），其他门店不再被拉取；已清理越权数据",
  changes: [
    "新增 BI_SYNC_STORE_CODES 门店白名单：凭据属于谁就只拉谁的门店经营数据",
    "五个 BI 门店数据端点增加门店门禁，白名单外门店优雅返回不可用",
    "定时拉取 fail-closed：未配置白名单时整体禁用",
    "清理已越权拉取的其他门店数据"
  ]
}
