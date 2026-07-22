import { sceneRecordConfig } from '../data/operationsData.js'
import { sceneById } from '../data/lookbookScenes.js'
import RecordLedger from '../components/lookbook/RecordLedger.jsx'
import { SceneTitle } from '../components/lookbook/LookbookPrimitives.jsx'

export default function OpeningScene(props) {
  const scene = sceneById('poster')
  return (
    <section className="look-section handover-look" data-signal-module={scene.signalModule} id={scene.id} data-look={scene.id} aria-labelledby={`${scene.id}-title`}>
      <SceneTitle scene={scene} note="调货、顾客预留和其它事项按实际变化编辑；处理完成后点按“完成”，当天标黑保留，进入下一日期后自动清除。" />
      <RecordLedger {...props} config={sceneRecordConfig.poster} />
    </section>
  )
}
