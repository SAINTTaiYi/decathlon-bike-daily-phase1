import { sceneRecordConfig } from '../data/operationsData.js'
import { sceneById } from '../data/lookbookScenes.js'
import RecordLedger from '../components/lookbook/RecordLedger.jsx'
import { SceneTitle } from '../components/lookbook/LookbookPrimitives.jsx'

export default function RepairScene(props) {
  const scene = sceneById('repair')
  return (
    <section className="look-section signal-repair-prototype" data-signal-module={scene.signalModule} id={scene.id} data-look={scene.id} aria-labelledby={`${scene.id}-title`}>
      <SceneTitle scene={scene} signalHeader note="按结构化维修单登记联系方式、维修类型、项目、取车日期与固定状态；维修完成后沿用同一记录进入待取。" metrics={[{ label: 'ACTIVE / 在修', value: props.records.filter((record) => !record.completedToday).length }, { label: 'PARTS / 等待配件', value: props.records.filter((record) => record.status === '等待配件').length }, { label: 'DUE / 有取车日', value: props.records.filter((record) => record.pickupDate).length }]} />
      <RecordLedger {...props} config={sceneRecordConfig.repair} variant="glitch-archive" />
    </section>
  )
}
