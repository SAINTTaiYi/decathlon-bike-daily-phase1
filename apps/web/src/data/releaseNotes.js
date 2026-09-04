export const APP_VERSION = "6.6.2"

export const currentRelease = {
  version: APP_VERSION,
  date: "2026.09.04",
  title: "修复 GLOBBER 滑板车混入整车计数",
  summary: "family 10338 实为滑板车族（OXELO MOVE 900/GT 100/GLOBBER），已从整车白名单移除；整车判定改为按 family 现算，新增滑板车品牌硬排除。闭店 KPI 与销售榜不再把滑板车计为新车。",
  changes: [
    "修复：GLOBBER/OXELO 滑板车不再混入闭店 KPI 新车计数与整车销售榜（family 10338 从白名单移除）",
    "整车判定改为按 family+label 现算，白名单演进即时生效，无需刷库",
    "滑板车品牌（GLOBBER/OXELO）硬排除防御层"
  ]
}
