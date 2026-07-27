import { sceneRecordConfig } from '../data/operationsData.js'
import { sceneById } from '../data/lookbookScenes.js'
import RecordLedger from '../components/lookbook/RecordLedger.jsx'
import { SceneTitle } from '../components/lookbook/LookbookPrimitives.jsx'

export default function RepairScene(props) {
  const scene = sceneById('repair')
  return (
    <section className="look-section" data-depth-section={scene.id} id={scene.id} data-look={scene.id} aria-labelledby={`${scene.id}-title`}>
      <SceneTitle scene={scene} note="按结构化维修单登记联系方式、维修类型、项目、取车日期与固定状态；顾客维修需先选择五种开单状态之一；维修完毕后保留对应语义并进入待取，完成状态仍可编辑或从操作记录撤回。" />
      <RecordLedger {...props} config={sceneRecordConfig.repair} />
    </section>
  )
}
