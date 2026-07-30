import IconActivity from '@iconoir/Activity.mjs'
import IconCash from '@iconoir/Cash.mjs'
import IconDelivery from '@iconoir/DeliveryTruck.mjs'
import IconLabel from '@iconoir/Label.mjs'
import IconShop from '@iconoir/ShopWindow.mjs'
import IconWrench from '@iconoir/Wrench.mjs'

export const LOOK_TOTAL = 6

export const lookbookScenes = [
  {
    id: 'pulse', no: '01', title: 'WORKSHOP KPI', cn: '今日 KPI', label: 'KPI', dock: '总览', NavIcon: IconActivity,
    stageLines: ['WORK', 'SHOP', 'PULSE'],
    stageObject: '/images/ops/stages/pulse-drivetrain.svg',
    stageCurve: 'DAILY WORKSHOP SIGNALS · OPERATIONAL PULSE · ',
    stageTrail: ['MEASURE', 'READ', 'ALIGN', 'DECIDE', 'ACT', 'VERIFY', 'CLOSE']
  },
  {
    id: 'pickup', no: '02', title: 'PICKUP BOARD', cn: '待取车辆', label: 'PICKUP', dock: '待取', NavIcon: IconDelivery,
    stageLines: ['READY', 'FOR', 'PICKUP'],
    stageObject: '/images/ops/stages/pickup-wheel-rack.svg',
    stageCurve: 'READY FOR RELEASE · CUSTOMER HANDOVER · ',
    stageTrail: ['READY', 'CONTACT', 'CONFIRM', 'RELEASE', 'RECORD', 'VERIFY', 'COMPLETE']
  },
  {
    id: 'poster', no: '03', title: 'OTHER HANDOVER', cn: '其它工作交接', label: 'OTHER', dock: '其它', NavIcon: IconShop,
    stageLines: ['OTHER', 'HAND', 'OVER'],
    stageObject: '/images/ops/stages/handover-clipboard.svg',
    stageCurve: 'CONTEXT ACROSS SHIFTS · HANDOVER WITHOUT LOSS · ',
    stageTrail: ['CAPTURE', 'ASSIGN', 'EXPLAIN', 'ALIGN', 'HANDOVER', 'FOLLOW', 'COMPLETE']
  },
  {
    id: 'repair', no: '04', title: 'SERVICE NOTES', cn: '维修交接', label: 'REPAIR', dock: '维修', NavIcon: IconWrench,
    stageLines: ['SERVICE', 'IN', 'MOTION'],
    stageObject: '/images/ops/stages/repair-service-stand.svg',
    stageCurve: 'DIAGNOSE · REPAIR · VERIFY · RETURN TO RIDING · ',
    stageTrail: ['INSPECT', 'DIAGNOSE', 'OPEN', 'REPAIR', 'CHECK', 'NOTIFY', 'RETURN']
  },
  {
    id: 'resale', no: '05', title: 'USED BIKE LOG', cn: '二手车交接', label: 'USED', dock: '二手', NavIcon: IconLabel,
    stageLines: ['SECOND', 'LIFE', 'CYCLE'],
    stageObject: '/images/ops/stages/resale-second-life.svg',
    stageCurve: 'ASSESS · RESTORE · VALUE · BEGIN ANOTHER CYCLE · ',
    stageTrail: ['RECEIVE', 'ASSESS', 'RESTORE', 'VALUE', 'LIST', 'SELL', 'RELEASE']
  },
  {
    id: 'sales', no: '06', title: 'SALES CHECK', cn: '销售核对', label: 'SALES', dock: '销售', NavIcon: IconCash,
    stageLines: ['DAILY', 'SALES', 'CHECK'],
    stageObject: '/images/ops/stages/sales-counter-stack.svg',
    stageCurve: 'COUNT THE DAY · VERIFY THE SIGNAL · CLOSE WITH CONFIDENCE · ',
    stageTrail: ['COUNT', 'COMPARE', 'CHECK', 'CORRECT', 'SAVE', 'VERIFY', 'CLOSE']
  }
]

export function formatLook(no) {
  return `${no} / ${String(LOOK_TOTAL).padStart(2, '0')}`
}

export function sceneById(id) {
  return lookbookScenes.find((scene) => scene.id === id) || lookbookScenes[0]
}
