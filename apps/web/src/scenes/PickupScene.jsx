import { sceneRecordConfig } from '../data/operationsData.js'
import { sceneById } from '../data/lookbookScenes.js'
import RecordLedger from '../components/lookbook/RecordLedger.jsx'
import { SceneTitle } from '../components/lookbook/LookbookPrimitives.jsx'

export default function PickupScene(props) {
  const scene = sceneById('pickup')
  const pickedUp = props.records.filter((record) => record.pickedUpToday).length
  const waiting = props.records.length - pickedUp
  return (
    <section className="look-section pickup-look" id={scene.id} data-look={scene.id} aria-labelledby={`${scene.id}-title`}>
      <SceneTitle scene={scene} note="票据标明来源并突出维修取车日期；点按通知状态可选择“已通知”。自提需核对取货码；非免费维修须已开付款单或质保单，免费维修可直接取车。" />
      <p className="pickup-folio" data-motion="data"><span>{String(waiting).padStart(2, '0')} VEHICLES · 等待取车</span><strong>{pickedUp ? `${String(pickedUp).padStart(2, '0')} 台今日已取` : '今天暂无取车记录'}</strong></p>
      <RecordLedger {...props} config={sceneRecordConfig.pickup} />
    </section>
  )
}
