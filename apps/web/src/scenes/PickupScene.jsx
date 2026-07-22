import { sceneRecordConfig } from '../data/operationsData.js'
import { inferPickupNotificationStatus } from '../data/pickupRecord.js'
import { sceneById } from '../data/lookbookScenes.js'
import RecordLedger from '../components/lookbook/RecordLedger.jsx'
import { SceneTitle } from '../components/lookbook/LookbookPrimitives.jsx'

export default function PickupScene(props) {
  const scene = sceneById('pickup')
  const pickedUp = props.records.filter((record) => record.pickedUpToday).length
  const waiting = props.records.length - pickedUp
  return (
    <section className="look-section pickup-look" data-signal-module={scene.signalModule} id={scene.id} data-look={scene.id} aria-labelledby={`${scene.id}-title`}>
      <SceneTitle scene={scene} signalHeader note="票据优先显示来源、通知和取车日期。自提核对取货码；维修取车沿用原付款或质保校验。" metrics={[{ label: 'WAITING / 待取', value: waiting }, { label: 'PICKED / 今日已取', value: pickedUp }, { label: 'NOTIFIED / 已通知', value: props.records.filter((record) => inferPickupNotificationStatus(record) === 'notified').length }]} />
      <p className="pickup-folio" data-motion="data"><span>{String(waiting).padStart(2, '0')} VEHICLES · 等待取车</span><strong>{pickedUp ? `${String(pickedUp).padStart(2, '0')} 台今日已取` : '今天暂无取车记录'}</strong></p>
      <RecordLedger {...props} config={sceneRecordConfig.pickup} />
    </section>
  )
}
