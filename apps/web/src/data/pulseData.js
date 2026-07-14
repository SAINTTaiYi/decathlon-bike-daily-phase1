export const workshopKpis = {
  salesVehicles: 4,
  safetyChecks: 1,
  safetyModel: '8538631',
  validReviews: 0,
  usedSold: 0,
  usedReceived: 1
}

export const repairQueue = [
  {
    code: 'REP-0824',
    model: 'Riverside 500',
    problem: 'Brake cable waiting',
    cnProblem: '变速异响 · 等待刹车线',
    urgency: 'Overdue 45m',
    owner: 'Mia',
    bay: 'Bench 01',
    status: 'needs part',
  },
  {
    code: 'REP-0819',
    model: 'Van Rysel EDR',
    problem: 'Rear wheel true',
    cnProblem: '后轮偏摆 · 等待复检',
    urgency: 'Next 30m',
    owner: 'Leo',
    bay: 'Bench 02',
    status: 'review',
  },
  {
    code: 'REP-0807',
    model: 'Rockrider 520',
    problem: 'Hydraulic brake bleed',
    cnProblem: '油压刹车 · 排气未完成',
    urgency: 'Today close',
    owner: 'Chen',
    bay: 'Stand 04',
    status: 'workshop',
  },
  {
    code: 'REP-0798',
    model: 'Elops Speed 900',
    problem: 'Light cable check',
    cnProblem: '灯线接触 · 待确认',
    urgency: 'Tomorrow AM',
    owner: 'Nora',
    bay: 'Rack 03',
    status: 'queued',
  }
]

export const pickupOnline = {
  pickup: [
    { time: '01', code: 'PICKUP-01', model: '周宁章之车', state: '维修单已开', note: '碗组、牙盘、链条已开维修单；顾客不着急取车，先确保维修时长', notification: '待确认' },
    { time: '02', code: 'PICKUP-02', model: 'ST 520 山地车', state: '保养完成', note: '299 保养已完成，付款单在车上', notification: '待确认' },
    { time: '03', code: 'PICKUP-03', model: 'ST 500 童车', state: '维修完成', note: '刹车已修好，交接班确认顾客通知状态', notification: '待确认' },
    { time: '04', code: 'PICKUP-04', model: 'RC 100', state: '调试完成', note: '车轮偏摆已调好，付款单在车上', notification: '待确认' }
  ],
  online: []
}

export const resaleBikes = [
  {
    id: 'rcr-f-aero',
    model: 'Van Rysel RCR-F',
    condition: 'Condition A',
    price: '¥18,999',
    stage: 'Aero resale / verified photo',
    tag: 'USED / CARBON / A',
    note: '这不是普通二手车，而是一台被重新策展的空气动力学机器。'
  },
  {
    id: 'riverside-500-bplus',
    model: 'Riverside 500',
    condition: 'Condition B+',
    price: '¥1,799',
    stage: 'Hybrid resale / tuned',
    tag: 'CITY / HYBRID / B+',
    note: '通勤混合车，变速、刹车与轮组已完成闭店前复核。'
  },
  {
    id: 'rockrider-st540-b',
    model: 'Rockrider ST 540',
    condition: 'Condition B',
    price: '¥2,399',
    stage: 'Trail resale / service done',
    tag: 'TRAIL / MTB / B',
    note: '山地车整备完成，前叉和油压刹车状态可进入顾客说明。'
  },
  {
    id: 'elops-speed-a-minus',
    model: 'Elops Speed 900',
    condition: 'Condition A-',
    price: '¥2,899',
    stage: 'City speed / light check',
    tag: 'URBAN / SPEED / A-',
    note: '城市速度车，灯线与车架外观已确认，适合作为高信任展示车。'
  },
  {
    id: 'triban-rc500-bplus',
    model: 'Triban RC 500',
    condition: 'Condition B+',
    price: '¥3,299',
    stage: 'Road resale / handover note',
    tag: 'ROAD / ENDURANCE / B+',
    note: '耐力公路车，传动清洁完成，交付前需要补一条保养备注。'
  }
]
