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
  },
  // M332 Omni Fulfillment 周报 · 门店级商品销售榜（2026-09-01 实测，17:01 抓取）。
  // 链路：浏览器 JS API applyFilterAsync('Store Name and ID', ['1299 Nanning Wuxiang'], 'replace')
  //       → bootstrap 池(seg0) + 过滤响应池(seg1) 按 dataType 合并全局索引 → zone 解码。
  // workbook/view：OmniFulfillment-WeeklySummarybyZone_City_Store / WeeklySummarybyZoneCityStore，
  // sheet 'Weekly Summary by Zone/City/Store'，zone 本期Top Model(1727) / 本期Flop Model(1729)。
  // 口径定案的两列：占比 = usr:Calculation_179468447342958592（占门店 TO 份额），
  //                同比 = usr:TO YOY (copy)_8587801778889113。
  // ⚠️ 其余三列度量（sum:TO (copy)_2621939430226640898 等）中文口径未对上、
  //    绝对销售额被格式化成 1K/0K，未采用；统计周次未对照 Date Range zone。
  //    后续走 Worker biClient 定时拉取落 D1。
  models: {
    report: 'M332 · Omni Fulfillment 周报',
    basis: { top: '占比 = 该商品占门店 TO 份额', flop: '条长 = 同比变化幅度（占比均≈0）' },
    top: [
      { rank: 1, model: '26\" EXPL 500 CN YELLOW', code: '8927179', share: 4.5, yoy: null },
      { rank: 2, model: 'RC100 V3 CN Silver', code: '9010483', share: 4.5, yoy: -2.0 },
      { rank: 3, model: "16'' 900 GREEN SHINY CN", code: '8944122', share: 2.8, yoy: null },
      { rank: 4, model: '24\" MOVE 100 CN', code: '8932670', share: 2.7, yoy: null },
      { rank: 5, model: '20\" EXPL 120 CN', code: '8797823', share: 2.3, yoy: null },
      { rank: 6, model: '20\" MOVE 100 CN', code: '8618643', share: 2.1, yoy: null },
      { rank: 7, model: '16\" BIKE 500 RED CN', code: '8871303', share: 2.0, yoy: -53.6 },
      { rank: 8, model: 'JACKET MH500 M CN BLACK', code: '8930219', share: 1.8, yoy: null },
      { rank: 9, model: 'CN COMBI SWIM 100 UV SPACE NAVY', code: '8798188', share: 1.6, yoy: 292.7 },
      { rank: 10, model: 'SET PLAY 2R+2B', code: '8969343', share: 1.5, yoy: null }
    ],
    flop: [
      { rank: 1, model: 'MINERAL WATER 500ML*', code: '8363990', share: 0.0, yoy: -66.7 },
      { rank: 2, model: 'GLOVE MT 500 STRETCH NAVY', code: '8655827', share: 0.0, yoy: null },
      { rank: 3, model: 'SPORTS DRINK Grapefruit CN', code: '8915968', share: 0.0, yoy: 0.0 },
      { rank: 4, model: 'CEREAL BAR COATED CHOCO CN X1', code: '8584436', share: 0.0, yoy: null },
      { rank: 5, model: 'SPARKLING WATER 330ml Calamansi CN', code: '8772179', share: 0.0, yoy: 2.3 },
      { rank: 6, model: 'NUTS Pumpkin Seed Hazelnut Pistachio CN', code: '8871136', share: 0.0, yoy: -47.7 },
      { rank: 7, model: 'TTB 100* 40+ X6 CN Orange', code: '8773562', share: 0.0, yoy: 1.4 },
      { rank: 8, model: 'FRUIT & VEGE PUREE Kale Rasp Hawthorn CN', code: '8901950', share: 0.0, yoy: null },
      { rank: 9, model: 'FIRST KICK CN VERSION S3', code: '8968893', share: 0.0, yoy: null },
      { rank: 10, model: 'CEREAL BAR Chocolate 23g x 4', code: '8495330', share: 0.0, yoy: null }
    ]
  },
  // M243 I Listen 门店满意度 · 门店级周数据（2026-09-01 实测，getSummaryDataAsync DataTable 直读，
  // 数据周 2026-08-22→08-29，来自 Report Info 工作表）。
  // 工作簿 IListen-StoreSatisfaction-PC_16100904156950，dashboard 'Store Satisfaction - Store'。
  // 字段溯源：
  //   score360/rank ← worksheet 'Main 360 Score (Store)' + 'My Store Rank Zone'（行 1299）
  //   benchmark     ← 'Main 360 Score (China)' 65.8949 / '(Zone)' 66.2944
  //   till          ← 'Till Review (Store)' 99.2832 + 'Till Review Detail (Store)' 覆盖率 0.68、
  //                    订单 2,466；上期对比取 '(vs) (Store)' 2,904
  //   newReviews    ← 'Store Review (Store)' / 'Workshop Review (Store)' / 'Dianping (Store)'
  //                    本周全部 Null = 无新增（不是 0 分，是无评价事件）
  // 注：360 分为综合分（含评论量/差评/渠道加权），不是百分制满意度；收银满意度 99.28% 是独立口径。
  review: {
    report: 'M243 · I Listen 门店满意度',
    week: '2026-08-22 → 08-29',
    score360: 33.09,
    wowPoints: 0.0,
    rankChina: 189,
    rankZone: 48,
    zoneName: 'South',
    benchmark: { china: 65.89, zone: 66.29 },
    till: { satisfaction: 99.28, coverage: 68, orders: 2466, prevOrders: 2904 },
    newReviews: { store: 0, workshop: 0, dianping: 0, note: '本周无新增评论（各渠道均为 Null）' }
  },
  // M330 回收 weekly 1,503 / M219 线上 TO 54,553 等字段↔值配对尚未精修，暂不上屏。
}

// DIS 两个已捕捉分项的 100 点分配：份额对 DIS 合计取整，
// 51.68% → 52、47.63% → 48，恰合 100；剩余约 0.7% 为未捕捉的其它 DIS 类型（图内注明）。
export const BI_DIS_DOTS = {
  omni: Math.round((BI_SNAPSHOT.economic.dis.omni / BI_SNAPSHOT.economic.dis.total) * 100),
  offline: Math.round((BI_SNAPSHOT.economic.dis.offline / BI_SNAPSHOT.economic.dis.total) * 100)
}

export default BI_SNAPSHOT
