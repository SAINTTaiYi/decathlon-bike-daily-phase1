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
  // M332 Omni Fulfillment 周报 · 门店级商品销售榜（周 2026-08-23→08-29，来自『本期 vs 上期 Date Range』）。
  // 两路提取合并，各取精度最高的一列：
  //   share/wow ← 2026-09-01 17:01 zone 解码（格式化串，一位小数）
  //   qty/to/yoy ← 2026-09-01 18:33 getSummaryDataAsync DataTable 直读
  //     （workbook OmniFulfillment-WeeklySummarybyZone_City_Store，sheet 'Weekly Summary by Zone/City/Store'，
  //      worksheet 本期Top Model / 本期Flop Model，列 Qty/TO/TO YOY/TO 环比/TO Share%；
  //      门店过滤 '1299 Nanning Wuxiang'，Top10 按 TO 降序与已验证过滤提取逐码一致）
  // 口径纠错（本轮定案）：上轮误标为「同比」的那列实为 **环比**（TO 环比，周环比），
  //   真同比是 TO YOY 列（多数为 Null=去年同期无该型号记录）。
  // qty = 该渠道（全渠道履约：线上订单门店发货/自提）周销量，单位台/件；to = 周销售额，单位元。
  // ⚠️ 这是 Omni 履约渠道口径，不是门店全渠道总销量。
  models: {
    report: 'M332 · Omni Fulfillment 周报',
    week: '2026-08-23 → 08-29',
    basis: { top: '条长 = 占门店 TO 份额 · 右侧 = 周销量与金额', flop: '条长 = 环比变化幅度 · 右侧 = 周销量与金额', allChannel: '条长 = 周销量（台）· 各渠道榜里的自行车聚合 · 每渠道仅前 5' },
    top: [
      { rank: 1, model: '26\" EXPL 500 CN YELLOW', code: '8927179', share: 4.5, qty: 1, to: 1479.90, yoy: null, wow: null },
      { rank: 2, model: 'RC100 V3 CN Silver', code: '9010483', share: 4.5, qty: 1, to: 1469.90, yoy: null, wow: -2.0 },
      { rank: 3, model: "16'' 900 GREEN SHINY CN", code: '8944122', share: 2.8, qty: 1, to: 922.38, yoy: null, wow: null },
      { rank: 4, model: '24\" MOVE 100 CN', code: '8932670', share: 2.7, qty: 1, to: 869.90, yoy: null, wow: null },
      { rank: 5, model: '20\" EXPL 120 CN', code: '8797823', share: 2.3, qty: 1, to: 769.90, yoy: null, wow: null },
      { rank: 6, model: '20\" MOVE 100 CN', code: '8618643', share: 2.1, qty: 1, to: 673.65, yoy: null, wow: null },
      { rank: 7, model: '16\" BIKE 500 RED CN', code: '8871303', share: 2.0, qty: 1, to: 649.90, yoy: -3.0, wow: -53.6 },
      { rank: 8, model: 'JACKET MH500 M CN BLACK', code: '8930219', share: 1.8, qty: 1, to: 599.90, yoy: null, wow: null },
      { rank: 9, model: 'CN COMBI SWIM 100 UV SPACE NAVY', code: '8798188', share: 1.6, qty: 4, to: 510.14, yoy: null, wow: 292.7 },
      { rank: 10, model: 'SET PLAY 2R+2B', code: '8969343', share: 1.5, qty: 2, to: 493.80, yoy: null, wow: null }
    ],
    flop: [
      { rank: 1, model: 'MINERAL WATER 500ML*', code: '8363990', share: 0.0, qty: 1, to: 2.85, yoy: -80.1, wow: -66.7 },
      { rank: 2, model: 'GLOVE MT 500 STRETCH NAVY', code: '8655827', share: 0.0, qty: 0, to: 3.89, yoy: null, wow: null },
      { rank: 3, model: 'SPORTS DRINK Grapefruit CN', code: '8915968', share: 0.0, qty: 1, to: 4.90, yoy: null, wow: 0.0 },
      { rank: 4, model: 'CEREAL BAR COATED CHOCO CN X1', code: '8584436', share: 0.0, qty: 1, to: 5.53, yoy: -53.1, wow: null },
      { rank: 5, model: 'SPARKLING WATER 330ml Calamansi CN', code: '8772179', share: 0.0, qty: 1, to: 5.68, yoy: null, wow: 2.3 },
      { rank: 6, model: 'NUTS Pumpkin Seed Hazelnut Pistachio CN', code: '8871136', share: 0.0, qty: 1, to: 5.80, yoy: null, wow: -47.7 },
      { rank: 7, model: 'TTB 100* 40+ X6 CN Orange', code: '8773562', share: 0.0, qty: 1, to: 9.44, yoy: null, wow: 1.4 },
      { rank: 8, model: 'FRUIT & VEGE PUREE Kale Rasp Hawthorn CN', code: '8901950', share: 0.0, qty: 1, to: 9.90, yoy: null, wow: null },
      { rank: 9, model: 'FIRST KICK CN VERSION S3', code: '8968893', share: 0.0, qty: 1, to: 9.90, yoy: null, wow: null },
      { rank: 10, model: 'CEREAL BAR Chocolate 23g x 4', code: '8495330', share: 0.0, qty: 1, to: 14.34, yoy: null, wow: null }
    ],
    // M218 All Channel Top Sales · 门店 1299 · 各渠道（到店/天猫/小程序/京东/抖音/官网）各取前 5 名，
    // 2026-09-01 getSummaryDataAsync 直读（~/bi_probe/cdp_cap/v32_explore.json）。
    // 把各渠道榜里的自行车按车型聚合 → 全渠道周销量（台/元）。
    // ⚠️ 每渠道只展示前 5：到店（Offline）实际卖出的车型可能比这更多——这是报表口径上限。
    // 自行车合计 48 台 / ¥59,952.04（第一版 26 台系单渠道错读，已按跨渠道聚合修正）。
    // 名称未知的行以商品码显示。
    allChannel: {
      total: { qty: 48, to: 59952.04 },
      rows: [
        { rank: 1, model: '16\" BIKE 500 RED CN', code: '8871303', qty: 13, to: 8943.61, channels: '到店 13' },
        { rank: 2, model: 'RC100 V3 CN Silver', code: '9010483', qty: 12, to: 17844.35, channels: 'Tmall 7 · JD 2 · 抖音 2 · 小程序 1' },
        { rank: 3, model: 'RC100 V2 CN', code: '8882002', qty: 7, to: 10212.91, channels: 'Tmall 5 · JD 2' },
        { rank: 4, model: '8984795', code: '8984795', qty: 6, to: 10869.58, channels: '到店 5 · JD 1' },
        { rank: 5, model: "16'' 900 GREEN SHINY CN", code: '8944122', qty: 4, to: 3802.19, channels: 'Tmall 4' },
        { rank: 6, model: '26\" EXPL 500 CN YELLOW', code: '8927179', qty: 3, to: 4429.70, channels: 'JD 2 · 抖音 1' },
        { rank: 7, model: '8984793', code: '8984793', qty: 1, to: 1969.90, channels: 'JD 1' },
        { rank: 8, model: '8585071', code: '8585071', qty: 1, to: 999.90, channels: '小程序 1' },
        { rank: 9, model: 'TILT 100 折叠车', code: '8480236', qty: 1, to: 879.90, channels: '抖音 1' }
      ]
    }
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
