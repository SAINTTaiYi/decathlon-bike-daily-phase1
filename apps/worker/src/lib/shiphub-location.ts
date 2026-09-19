/**
 * Shiphub 门店位置标识规范化（2026-09-19 事故修复）。
 *
 * 背景：Shiphub 的 location_num 必须是门店的 **partyNumber（13 位）**，
 * 如五象店 0070129901299；而门店日常口径是 4 位门店号（如 1299）。
 * 2026-09-19 事故：1670 门店在连接表单里填了短码「1670」，上游 pick / ship
 * 端点在解析门店时调用其位置服务失败（500 / 417），导致这两个分类自接入起
 * 持续失败；hand / receive 恰好不经过该链路而看起来正常。
 *
 * 规则（由三家门店样本反推并逐条验证：五象 0070129901299 / 钟村 0070129701297 /
 * 潭西 0070129801298）：partyNumber = `0070{门店号}0{门店号}`。
 *
 * 因此：4 位纯数字 = 门店短码 → 自动展开；已是长码或无法识别的输入原样透传
 * （不猜测、不拦截，交给上游判定）。
 */
export function normalizeShipHubLocationNum(value: string | null | undefined): string | null {
  const trimmed = value?.trim()
  if (!trimmed) return null
  if (/^\d{4}$/u.test(trimmed)) return `0070${trimmed}0${trimmed}`
  return trimmed
}
