/**
 * 站点分流（2026-09-14 用户定案）。
 *
 * 食品台账独立到 eat.workshop.skin，与 ops 的 workshop.skin 物理分开。
 *
 * 为什么要分：此前食品台账与 ops 共用同一个页面，即使把食品层做成全屏 fixed，
 * ops 的 DOM 依然占据文档流（实测约 1500px 高），手机上一滑动就能把 ops 的
 * 底栏拽出来 —— 这是「ops 界面泄露」的真正根源，靠 z-index 或 inert 遮挡治标不治本。
 *
 * 现在：eat.workshop.skin 的页面上不存在任何 ops 节点，文档高度恒等于视口高度，
 * 结构上不可能滚动泄露。
 */

/** 食品台账独立站点。 */
export const FOOD_SITE_HOST = 'eat.workshop.skin'
/** Ops 正式站点。 */
export const OPS_SITE_HOST = 'workshop.skin'

function readHostname() {
  return typeof window === 'undefined' ? '' : window.location.hostname
}

/** 当前是否运行在食品台账独立站点（eat.*）。 */
export function isFoodOnlySite(hostname = readHostname()) {
  return /^eat\./iu.test(hostname)
}

/**
 * 当前是否运行在「生产双站」环境（workshop.skin / www.workshop.skin）。
 * 只有正式域名才把食品台账当作独立站点跳转；预览站与本地开发仍是单站（就地打开），
 * 否则预览环境无法验证这套界面。
 */
export function isOpsProductionSite(hostname = readHostname()) {
  if (isFoodOnlySite(hostname)) return false
  return /(^|\.)workshop\.skin$/iu.test(hostname)
}

/** 食品台账站点地址。 */
export function foodSiteUrl() {
  return `https://${FOOD_SITE_HOST}/`
}

/** Ops 站点地址。 */
export function opsSiteUrl() {
  return `https://${OPS_SITE_HOST}/`
}
