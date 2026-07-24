export const OPERATIONS_STORAGE_VERSION = 5
export const OPERATIONS_LEDGER_KEY = 'decathlon-bike-operations-ledger:v5'
export const OPERATIONS_DAY_PREFIX = 'decathlon-bike-closing-v5'

export const emptyKpi = {
  salesVehicles: 0,
  safetyChecks: 0,
  safetyModel: '',
  validReviews: 0,
  usedSold: 0,
  usedReceived: 0
}

export const legacyKpiSeed = { ...emptyKpi }
export const initialRecords = []

export const sceneRecordConfig = {
  pickup: {
    singular: '待取车辆',
    addLabel: '增加待取车辆',
    formKind: 'pickup'
  },
  poster: {
    singular: '交接事项',
    addLabel: '增加交接事项',
    titleLabel: '事项名称',
    detailLabel: '交接说明',
    metaLabel: '分类、位置或关联信息',
    statusLabel: '当前状态',
    statusPlaceholder: '例如：继续跟进 / 等待顾客 / 已处理'
  },
  repair: {
    singular: '维修车辆',
    addLabel: '增加维修车辆',
    formKind: 'repair'
  },
  resale: {
    singular: '待上架二手车',
    addLabel: '增加待上架二手车',
    titleLabel: '车辆型号',
    detailLabel: '成色、价格与交付说明',
    metaLabel: '标签、整备或来源信息',
    statusLabel: '当前状态',
    statusPlaceholder: '例如：等待整备 / 维修中 / 等待质检'
  }
}
