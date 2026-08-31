// BI Portal（TableauRest）五象店（1299）数据快照 —— 2026-08-31 链路实测值。
// 链路：登录 → Token2 ticket → /views（XSRF）→ startSession → bootstrapSession
//       → add-manual-items-to-filter（filter 命令响应即 1299 过滤后数据）。
// 协议与字段溯源见 ~/integrations/bi-ops-visualization.md。
// 后续 Worker biClient 定时拉取落 D1 后，本模块替换为 /api/v1/bi/* 读取；
// 组件侧只认 BI_SNAPSHOT 的形状（report → metric 映射已按字段语义固化）。
export const BI_SNAPSHOT = {
  capturedAt: '2026-08-31',
  source: 'BI Portal · TableauRest',
  store: { code: '1299', name: '南宁五象' },
  // M216 经济表现（过滤值 1299-Nanning Wuxiang 五象）
  economic: {
    to: 427916,          // 本周期门店 TO（TO Calendar · Rows (copy)_955607582751952897）
    toYoy: -0.1044,      // TO 同比（Calculation_955607582751854592）
    monthlyTo: 1912284,  // 月度累计 Daily TO（Is Workday）
    dis: {
      total: 118623,     // DIS Sales 合计（Calculation_1119144546183405569）
      omni: 61299,       // 全渠道 omni_def_2024
      offline: 56503     // 线下轨迹 Traj_Off (copy)_1214564576828821505
    }
  },
  // M214 门店汇总（过滤值 1299-Nanning Wuxiang）
  storeSummary: {
    weeklyTo: 309252,    // 周 TO（YW Trend · Calculation_2654590530342019091）
    onlineShare: 0.318   // 线上 TO 占比（Online TO Icon：31.82%）
  }
  // M330 回收 weekly 1,503 / M219 线上 TO 54,553 等字段↔值配对尚未精修，暂不上屏。
}

// DIS 两个已捕捉分项的 100 点分配：份额对 DIS 合计取整，
// 51.68% → 52、47.63% → 48，恰合 100；剩余约 0.7% 为未捕捉的其它 DIS 类型（图内注明）。
export const BI_DIS_DOTS = {
  omni: Math.round((BI_SNAPSHOT.economic.dis.omni / BI_SNAPSHOT.economic.dis.total) * 100),
  offline: Math.round((BI_SNAPSHOT.economic.dis.offline / BI_SNAPSHOT.economic.dis.total) * 100)
}

export default BI_SNAPSHOT
