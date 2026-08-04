import IconActivity from '@iconoir/Activity.mjs'
import IconCash from '@iconoir/Cash.mjs'
import IconDelivery from '@iconoir/DeliveryTruck.mjs'
import IconShop from '@iconoir/ShopWindow.mjs'
import IconWrench from '@iconoir/Wrench.mjs'

export const LOOK_TOTAL = 6

export const lookbookScenes = [
  { id: 'pulse', no: '01', title: 'WORKSHOP KPI', cn: '今日 KPI', label: 'KPI', dock: '总览', NavIcon: IconActivity },
  { id: 'pickup', no: '02', title: 'PICKUP BOARD', cn: '待取车辆', label: 'PICKUP', dock: '待取', NavIcon: IconDelivery },
  { id: 'poster', no: '03', title: 'OTHER HANDOVER', cn: '其它工作交接', label: 'OTHER', dock: '其它', NavIcon: IconShop },
  { id: 'repair', no: '04', title: 'SERVICE NOTES', cn: '维修交接', label: 'REPAIR', dock: '维修', NavIcon: IconWrench },
  { id: 'sales', no: '06', title: 'SALES CHECK', cn: '销售核对', label: 'SALES', dock: '销售', NavIcon: IconCash }
]

export function formatLook(no) {
  return `${no} / ${String(LOOK_TOTAL).padStart(2, '0')}`
}

export function sceneById(id) {
  return lookbookScenes.find((scene) => scene.id === id) || lookbookScenes[0]
}
