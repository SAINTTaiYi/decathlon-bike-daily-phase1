import { signalGridModules } from '../design/signalGrid.js'

export const LOOK_TOTAL = 6

export const lookbookScenes = [
  { id: 'pulse', signalModule: 'overview', no: '01', title: 'WORKSHOP KPI', cn: '今日 KPI', label: 'KPI', dock: '总览', NavIcon: signalGridModules.overview.icon, ActiveNavIcon: signalGridModules.overview.activeIcon },
  { id: 'pickup', signalModule: 'pickup', no: '02', title: 'PICKUP BOARD', cn: '待取车辆', label: 'PICKUP', dock: '待取', NavIcon: signalGridModules.pickup.icon, ActiveNavIcon: signalGridModules.pickup.activeIcon },
  { id: 'poster', signalModule: 'other', no: '03', title: 'OTHER HANDOVER', cn: '其它工作交接', label: 'OTHER', dock: '其它', NavIcon: signalGridModules.other.icon, ActiveNavIcon: signalGridModules.other.activeIcon },
  { id: 'repair', signalModule: 'repair', no: '04', title: 'SERVICE NOTES', cn: '维修交接', label: 'REPAIR', dock: '维修', NavIcon: signalGridModules.repair.icon, ActiveNavIcon: signalGridModules.repair.activeIcon },
  { id: 'resale', signalModule: 'resale', no: '05', title: 'USED BIKE LOG', cn: '二手车交接', label: 'USED', dock: '二手', NavIcon: signalGridModules.resale.icon, ActiveNavIcon: signalGridModules.resale.activeIcon },
  { id: 'sales', signalModule: 'sales', no: '06', title: 'SALES CHECK', cn: '销售核对', label: 'SALES', dock: '销售', NavIcon: signalGridModules.sales.icon, ActiveNavIcon: signalGridModules.sales.activeIcon }
]

export function formatLook(no) {
  return `${no} / ${String(LOOK_TOTAL).padStart(2, '0')}`
}

export function sceneById(id) {
  return lookbookScenes.find((scene) => scene.id === id) || lookbookScenes[0]
}
