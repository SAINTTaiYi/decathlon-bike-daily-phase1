// BI Portal（TableauRest）五象店（1299）数据快照 —— 2026-09-02 复核重提。
// 口径：自行车 + 工作室 = BI Universe 维度 ['Cycling And Urban Gliding','Workshop']。
// M332 车型榜 / M218 全渠道 / M348 维修均已按该口径在源端过滤（不能多也不能少）；
// M216/M214 经济表 2026-09-02 实测七路（JS API/raw VizQL/iframe DOM/OCR/参数/控件/alt）
// 均未开放自行车维度且服务器渲染变更，保留全店口径并显式标注 caliber:'store'。
// 评价明细（M243 Data Download Review Detail）同日被门户 tab 切换限制阻断，aggregate 保留。
export const BI_SNAPSHOT = {
  capturedAt: '2026-09-02',
  source: 'BI Portal · TableauRest',
  store: { code: '1299', name: '南宁五象' },
  scope: {
    label: '自行车 + 工作室',
    universes: ['Cycling And Urban Gliding', 'Workshop'],
    note: '车型/维修已按 Universe 源端过滤；经济表 BI 暂不开放该维度，全店口径显式标注'
  },
  // M216/M214 · 全店口径（caliber 标注，周 2026-08-23→08-29）
  economic: {
    caliber: 'store',
    // BI × CIS 对比用：BI 快照固定周（M216 W35 实证 = 08-23→08-29），CIS 按同期查询。
    // 命名用 weekFrom/weekTo：economic.to 是 TO 数值（427916），日期字段绝不与它撞名。
    weekFrom: '2026-08-23',
    weekTo: '2026-08-29',
    weekLabel: 'W35',
    to: 427916,
    toYoy: -0.1044,
    monthlyTo: 1912284,
    dis: { total: 118623, omni: 61299, offline: 56503 }
  },
  storeSummary: { caliber: 'store', weeklyTo: 309252, onlineShare: 0.318 },
  // M348 · 自行车+工作室口径（Universe 过滤后 W01–W35 完整周）
  repair: {
    caliber: 'cycling+workshop',
    unit: '元 / 周',
    total: 55731,
    avg: 1592,
    recentAvg: 1410,
    peak: { week: 'W01', value: 4462 },
    trough: { week: 'W34', value: 927 },
    latest: { week: 'W35', value: 1057 },
    weeks: [
    {"week": "W01", "value": 4462},
    {"week": "W02", "value": 1548},
    {"week": "W03", "value": 1201},
    {"week": "W04", "value": 1459},
    {"week": "W05", "value": 1124},
    {"week": "W06", "value": 1112},
    {"week": "W07", "value": 1763},
    {"week": "W08", "value": 1494},
    {"week": "W09", "value": 1683},
    {"week": "W10", "value": 1523},
    {"week": "W11", "value": 1556},
    {"week": "W12", "value": 1932},
    {"week": "W13", "value": 1720},
    {"week": "W14", "value": 1267},
    {"week": "W15", "value": 1723},
    {"week": "W16", "value": 1131},
    {"week": "W17", "value": 1226},
    {"week": "W18", "value": 1839},
    {"week": "W19", "value": 2060},
    {"week": "W20", "value": 1202},
    {"week": "W21", "value": 1169},
    {"week": "W22", "value": 1285},
    {"week": "W23", "value": 2824},
    {"week": "W24", "value": 1790},
    {"week": "W25", "value": 1605},
    {"week": "W26", "value": 1261},
    {"week": "W27", "value": 1495},
    {"week": "W28", "value": 1115},
    {"week": "W29", "value": 1711},
    {"week": "W30", "value": 1703},
    {"week": "W31", "value": 1714},
    {"week": "W32", "value": 1690},
    {"week": "W33", "value": 1360},
    {"week": "W34", "value": 927},
    {"week": "W35", "value": 1057}
    ]
  },
  // M332 / M218 · 自行车+工作室口径（周 2026-08-23→08-29）
  models: {
    caliber: 'cycling+workshop',
    report: 'M332 · Omni Fulfillment 周报',
    week: '2026-08-23 → 08-29',
    basis: {
      top: '条长 = 占自行车+工作室 Omni TO 份额 · 右侧 = 周销量与金额',
      flop: '条长 = 环比变化幅度 · 右侧 = 周销量与金额',
      allChannel: '条长 = 周销量（台）· 各渠道榜按 Sports Sales=Cycling+Workshop 源端过滤 · 每渠道仅前 5'
    },
    top: [
      {"rank": 1, "model": "26\" EXPL 500 CN YELLOW", "code": "8927179", "share": 18.0, "qty": 1, "to": 1479.9, "yoy": null, "wow": null},
      {"rank": 2, "model": "RC100 V3 CN Silver", "code": "9010483", "share": 18.0, "qty": 1, "to": 1469.9, "yoy": null, "wow": -2.0},
      {"rank": 3, "model": "16'' 900 GREEN SHINY CN", "code": "8944122", "share": 11.0, "qty": 1, "to": 922.38, "yoy": null, "wow": null},
      {"rank": 4, "model": "24\" MOVE 100 CN", "code": "8932670", "share": 11.0, "qty": 1, "to": 869.9, "yoy": null, "wow": null},
      {"rank": 6, "model": "20\" EXPL 120 CN", "code": "8797823", "share": 10.0, "qty": 1, "to": 769.9, "yoy": null, "wow": null},
      {"rank": 7, "model": "20\" MOVE 100 CN", "code": "8618643", "share": 8.0, "qty": 1, "to": 673.65, "yoy": null, "wow": null},
      {"rank": 9, "model": "16\" BIKE 500 RED CN", "code": "8871303", "share": 8.0, "qty": 1, "to": 649.9, "yoy": -3.0, "wow": -54.0},
      {"rank": 10, "model": "14\" BIKE 100 CN", "code": "8946821", "share": 6.0, "qty": 1, "to": 479.9, "yoy": null, "wow": null},
      {"rank": 11, "model": "KEY 120 2025", "code": "8903325", "share": 2.0, "qty": 3, "to": 149.7, "yoy": null, "wow": null},
      {"rank": 12, "model": "KID HELMET MOVE 500 White CN", "code": "8967120", "share": 2.0, "qty": 1, "to": 129.9, "yoy": null, "wow": null}
    ],
    flop: [
      {"rank": 1, "model": "TUC 520 ELOPS LF CN dark blue", "code": "8583724", "share": 0.0, "qty": 0, "to": 16.92, "yoy": null, "wow": -99.0},
      {"rank": 2, "model": "KIDS BIKE KICKSTAND 14\"", "code": "8872192", "share": 0.0, "qty": 1, "to": 29.9, "yoy": null, "wow": null},
      {"rank": 3, "model": "BOTTLE CAGE SIDE ENTRY", "code": "8640163", "share": 0.0, "qty": 1, "to": 38.4, "yoy": null, "wow": null},
      {"rank": 4, "model": "SADDLE COVER L", "code": "8381709", "share": 1.0, "qty": 1, "to": 49.9, "yoy": null, "wow": 8.0},
      {"rank": 5, "model": "Mudguard 20\"-24\" CN NON SUSPENSION", "code": "8736087", "share": 1.0, "qty": 1, "to": 57.65, "yoy": null, "wow": null},
      {"rank": 6, "model": "Handlbar bag CN", "code": "8936255", "share": 1.0, "qty": 1, "to": 69.9, "yoy": null, "wow": null},
      {"rank": 7, "model": "Training wheels 500 14-16\" CN", "code": "8871211", "share": 1.0, "qty": 1, "to": 87.43, "yoy": 0.0, "wow": -3.0},
      {"rank": 8, "model": "MTB UNDERSHORT 500 M BLACK", "code": "8915980", "share": 2.0, "qty": 1, "to": 125.7, "yoy": null, "wow": null},
      {"rank": 9, "model": "KID HELMET MOVE 500 White CN", "code": "8967120", "share": 2.0, "qty": 1, "to": 129.9, "yoy": null, "wow": null},
      {"rank": 10, "model": "KEY 120 2025", "code": "8903325", "share": 2.0, "qty": 3, "to": 149.7, "yoy": null, "wow": null}
    ],
    allChannel: {
      total: { qty: 107, to: 89258.42 },
      rows: [
        {"rank": 1, "model": "8640568", "code": "8640568", "qty": 26, "to": 7321.05, "channels": "Offline 26"},
        {"rank": 2, "model": "16\" BIKE 500 RED CN", "code": "8871303", "qty": 17, "to": 11693.21, "channels": "Offline 13 · Tmall 4"},
        {"rank": 3, "model": "14\" BIKE 100 CN", "code": "8946821", "qty": 15, "to": 7321.65, "channels": "Offline 15"},
        {"rank": 4, "model": "RC100 V3 CN Silver", "code": "9010483", "qty": 12, "to": 17844.35, "channels": "Tmall 7 · JD 2 · Douyin 2 · mpm 1"},
        {"rank": 5, "model": "RC 100 NEW Silver CN", "code": "8882002", "qty": 7, "to": 10212.91, "channels": "Tmall 5 · JD 2"},
        {"rank": 6, "model": "8984795", "code": "8984795", "qty": 6, "to": 10869.58, "channels": "Offline 5 · JD 1"},
        {"rank": 7, "model": "9002783", "code": "9002783", "qty": 5, "to": 7234.98, "channels": "Offline 5"},
        {"rank": 8, "model": "16'' 900 GREEN SHINY CN", "code": "8944122", "qty": 4, "to": 3802.19, "channels": "Tmall 4"},
        {"rank": 9, "model": "20\" EXPL 120 CN", "code": "8797823", "qty": 4, "to": 3059.6, "channels": "Tmall 4"},
        {"rank": 10, "model": "26\" EXPL 500 CN YELLOW", "code": "8927179", "qty": 3, "to": 4429.7, "channels": "JD 2 · Douyin 1"},
        {"rank": 11, "model": "8949264", "code": "8949264", "qty": 2, "to": 399.8, "channels": "mpm 2"},
        {"rank": 12, "model": "8585071", "code": "8585071", "qty": 1, "to": 999.9, "channels": "mpm 1"},
        {"rank": 13, "model": "8733846", "code": "8733846", "qty": 1, "to": 599.9, "channels": "mpm 1"},
        {"rank": 14, "model": "8987064", "code": "8987064", "qty": 1, "to": 599.9, "channels": "mpm 1"},
        {"rank": 15, "model": "8984793", "code": "8984793", "qty": 1, "to": 1969.9, "channels": "JD 1"},
        {"rank": 16, "model": "8480236", "code": "8480236", "qty": 1, "to": 879.9, "channels": "Douyin 1"},
        {"rank": 17, "model": "8528147", "code": "8528147", "qty": 1, "to": 19.9, "channels": "Douyin 1"}
      ]
    }
  },
  // M243 I Listen · 门店服务满意度（工作台服务口径，周 2026-08-22→08-29）
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
    newReviews: { store: 0, workshop: 0, dianping: 0, note: '本周无新增评论（各渠道均为 Null）' },
    detail: { available: false, note: '明细表接口 2026-09-02 被门户限制阻断，待恢复后补拉' }
  }
}

// DIS 两个已捕捉分项的 100 点分配（全店口径，随 economic 标注）
export const BI_DIS_DOTS = {
  omni: Math.round((BI_SNAPSHOT.economic.dis.omni / BI_SNAPSHOT.economic.dis.total) * 100),
  offline: Math.round((BI_SNAPSHOT.economic.dis.offline / BI_SNAPSHOT.economic.dis.total) * 100)
}

export default BI_SNAPSHOT
