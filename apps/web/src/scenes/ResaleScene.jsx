import { sceneRecordConfig } from '../data/operationsData.js'
import { sceneById } from '../data/lookbookScenes.js'
import RecordLedger from '../components/lookbook/RecordLedger.jsx'
import { SceneTitle } from '../components/lookbook/LookbookPrimitives.jsx'

const listedConfig = { ...sceneRecordConfig.resale, singular: '已上架二手车' }

export default function ResaleScene(props) {
  const scene = sceneById('resale')
  const pending = props.records.filter((record) => record.resaleStage === 'pending')
  const listed = props.records.filter((record) => record.resaleStage !== 'pending')

  return (
    <section className="look-section" data-depth-section={scene.id} id={scene.id} data-look={scene.id} aria-labelledby={`${scene.id}-title`}>
      <SceneTitle scene={scene} note="新增二手车先进入黑色待上架区；维修整备完成后进入已上架在册。已上架车辆售出后从在册移除，历史继续保留。" />
      <RecordLedger {...props} records={pending} config={sceneRecordConfig.resale} heading="PENDING LISTING · 待上架" dark />
      <RecordLedger {...props} records={listed} config={listedConfig} heading="LISTED INVENTORY · 已上架在册" showAdd={false} />
    </section>
  )
}
