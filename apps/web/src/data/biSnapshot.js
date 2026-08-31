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
  },
  // M348 维修（过滤响应 repair.bin · zone 192 'TO' 趋势区 ·
  // fn Calculation_7473160664074379287，valueIndices 0..34 → 列池 col1）。
  // 周序按全国同构结构对齐（谷值同位 W05=春节；2026-08-31 为 W36 周一，最新完整周 = W35）。
  // ⚠️ 1,299,657 / +5.0% 出自全国上下文（列池中不存在该值），未采用。
  repair: {
    unit: '元 / 周',
    total: 114267,       // 35 周累计
    avg: 3265,           // 周均
    recentAvg: 4205,     // 近 8 周周均（站稳 4 千周线的依据）
    peak: { week: 'W01', value: 7665 },    // 春节前保养高峰
    trough: { week: 'W05', value: 551 },   // 春节假期
    weeks: [
    { week: 'W01', value: 7665 },
    { week: 'W02', value: 1353 },
    { week: 'W03', value: 647 },
    { week: 'W04', value: 2311 },
    { week: 'W05', value: 551 },
    { week: 'W06', value: 1660 },
    { week: 'W07', value: 2220 },
    { week: 'W08', value: 2808 },
    { week: 'W09', value: 1681 },
    { week: 'W10', value: 2735 },
    { week: 'W11', value: 3860 },
    { week: 'W12', value: 3632 },
    { week: 'W13', value: 3323 },
    { week: 'W14', value: 2867 },
    { week: 'W15', value: 2451 },
    { week: 'W16', value: 3412 },
    { week: 'W17', value: 2086 },
    { week: 'W18', value: 4434 },
    { week: 'W19', value: 3745 },
    { week: 'W20', value: 2641 },
    { week: 'W21', value: 3130 },
    { week: 'W22', value: 2608 },
    { week: 'W23', value: 3866 },
    { week: 'W24', value: 3169 },
    { week: 'W25', value: 3623 },
    { week: 'W26', value: 3644 },
    { week: 'W27', value: 4509 },
    { week: 'W28', value: 4464 },
    { week: 'W29', value: 4361 },
    { week: 'W30', value: 4613 },
    { week: 'W31', value: 4933 },
    { week: 'W32', value: 3465 },
    { week: 'W33', value: 3872 },
    { week: 'W34', value: 3382 },
    { week: 'W35', value: 4546 }
    ]
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
