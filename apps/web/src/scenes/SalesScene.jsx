import IconJournal from '@iconoir/Journal.mjs'
import { sceneById } from '../data/lookbookScenes.js'
import FixedDigits from '../components/lookbook/FixedDigits.jsx'
import { SceneTitle } from '../components/lookbook/LookbookPrimitives.jsx'
import SignalStateMark from '../components/lookbook/SignalStateMark.jsx'

export default function SalesScene({ kpi, kpiReady, savedAt, closedAt, onEditKpi, onHistory }) {
  const scene = sceneById('sales')
  const titleAction = <div className="scene-actions"><button type="button" className="text-action" onClick={onHistory}><IconJournal width={18} height={18} aria-hidden="true" />操作记录</button><button type="button" className="text-action" onClick={onEditKpi} disabled={Boolean(closedAt)}>{kpiReady ? '修改数据' : '填写数据'}</button></div>
  return (
    <section className="look-section closing-look" data-signal-module={scene.signalModule} id={scene.id} data-look={scene.id} aria-labelledby={`${scene.id}-title`}>
      <SceneTitle scene={scene} signalHeader note="每天填写销售车辆、安全检查、评价和二手车数据。保存后即可完成闭店。" action={titleAction} metrics={[{ label: 'STATUS / 数据状态', value: kpiReady ? 'READY' : 'DUE' }, { label: 'REVIEWS / 有效评价', value: kpi.validReviews }]} />
      <div className="sales-input-summary signal-sales-kpi" data-ready={kpiReady ? 'true' : 'false'} data-motion="data">
        <div className="signal-sales-primary"><span>SALES VEHICLES / 销售车辆</span><strong><FixedDigits value={kpi.salesVehicles} /></strong><SignalStateMark tone={kpiReady ? 'complete' : 'pending'}>{kpiReady ? 'READY TO CLOSE' : 'DATA DUE'}</SignalStateMark></div>
        <dl className="signal-sales-metrics">
          <div><dt>SAFETY / 安全检查</dt><dd><FixedDigits value={kpi.safetyChecks} /></dd><small>{kpi.safetyModel || 'MODEL 未填写'}</small></div>
          <div><dt>REVIEWS / 有效评价</dt><dd><FixedDigits value={kpi.validReviews} /></dd><small>VALID REVIEWS</small></div>
          <div><dt>USED SOLD / 二手售出</dt><dd><FixedDigits value={kpi.usedSold} /></dd><small>USED SOLD</small></div>
          <div><dt>USED IN / 收二手车</dt><dd><FixedDigits value={kpi.usedReceived} /></dd><small>USED RECEIVED</small></div>
        </dl>
        <button type="button" className="primary-action signal-sales-action" onClick={onEditKpi} disabled={Boolean(closedAt)}>{kpiReady ? '修改当日数据' : '填写当日数据'}</button>
        <p>{kpiReady && savedAt ? `已于 ${new Intl.DateTimeFormat('zh-CN', { hour: '2-digit', minute: '2-digit' }).format(new Date(savedAt))} 同步到数据库，可以完成闭店。` : '填写并保存当日销售数据后即可闭店。其它业务台账不会阻止闭店。'}</p>
      </div>
    </section>
  )
}
