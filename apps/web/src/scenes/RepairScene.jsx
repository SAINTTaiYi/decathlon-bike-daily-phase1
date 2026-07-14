import { sceneRecordConfig } from '../data/operationsData.js'
import { sceneById } from '../data/lookbookScenes.js'
import RecordLedger from '../components/lookbook/RecordLedger.jsx'
import { SceneTitle } from '../components/lookbook/LookbookPrimitives.jsx'

export default function RepairScene(props) {
  const scene = sceneById('repair')
  return (
    <section className="look-section" id={scene.id} data-look={scene.id} aria-labelledby={`${scene.id}-title`}>
      <SceneTitle scene={scene} note="按结构化维修单登记联系方式、维修类型、项目、取车日期与固定状态；付费、质保与免费维修完成后保留同一记录进入待取，免费维修无需先变更状态即可取车。" />
      <RecordLedger {...props} config={sceneRecordConfig.repair} />
    </section>
  )
}
