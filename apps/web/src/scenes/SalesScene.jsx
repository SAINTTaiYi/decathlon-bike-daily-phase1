import IconJournal from '@iconoir/Journal.mjs'
import { sceneById } from '../data/lookbookScenes.js'
import FixedDigits from '../components/lookbook/FixedDigits.jsx'
import { SceneTitle } from '../components/lookbook/LookbookPrimitives.jsx'

export default function SalesScene({ kpi, kpiReady, savedAt, closedAt, onEditKpi, onHistory }) {
  const scene = sceneById('sales')
  const titleAction = <div className="scene-actions"><button type="button" className="text-action" onClick={onHistory}><IconJournal width={18} height={18} aria-hidden="true" />操作记录</button><button type="button" className="text-action" onClick={onEditKpi} disabled={Boolean(closedAt)}>{kpiReady ? '修改数据' : '填写数据'}</button></div>
  return (
    <section className="look-section closing-look" data-signal-module={scene.signalModule} data-depth-section={scene.id} id={scene.id} data-look={scene.id} aria-labelledby={`${scene.id}-title`}>
      <SceneTitle scene={scene} note="每天由同事人工填写销售车辆、安全检查、评价、二手售出与收车数据；保存后即可完成闭店。" action={titleAction} />
      <div className="sales-input-summary" data-ready={kpiReady ? 'true' : 'false'} data-motion="data">
        <div><span>SALES · 销售车辆</span><strong><FixedDigits value={kpi.salesVehicles} /></strong></div>
        <div><span>SAFETY · 安全检查</span><strong><FixedDigits value={kpi.safetyChecks} /></strong></div>
        <div><span>USED SOLD · 二手售出</span><strong><FixedDigits value={kpi.usedSold} /></strong></div>
        <div><span>USED IN · 收二手车</span><strong><FixedDigits value={kpi.usedReceived} /></strong></div>
        <button type="button" className="primary-action" onClick={onEditKpi} disabled={Boolean(closedAt)}>{kpiReady ? '修改当日数据' : '填写当日数据'}</button>
        <p>{kpiReady && savedAt ? `已于 ${new Intl.DateTimeFormat('zh-CN', { hour: '2-digit', minute: '2-digit' }).format(new Date(savedAt))} 已同步至数据库，可以完成闭店。` : '填写并保存当日销售数据后即可闭店；其它业务台账不会阻止闭店。'}</p>
      </div>
    </section>
  )
}
