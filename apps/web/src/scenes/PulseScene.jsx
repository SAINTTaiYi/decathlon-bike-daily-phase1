import IconJournal from '@iconoir/Journal.mjs'
import { sceneById } from '../data/lookbookScenes.js'
import FixedDigits from '../components/lookbook/FixedDigits.jsx'
import { SceneTitle } from '../components/lookbook/LookbookPrimitives.jsx'
import { SIGNAL_ICON_STROKE } from '../design/signalGrid.js'

const overviewModules = ['pickup', 'poster', 'repair', 'resale', 'sales']

export default function PulseScene({ dateKey, kpi, kpiReady, records, closedAt, onJump, onEditKpi, onHistory }) {
  const scene = sceneById('pulse')
  const titleAction = <div className="scene-actions"><button type="button" className="text-action" onClick={onHistory}><IconJournal width={18} height={18} aria-hidden="true" />操作记录</button><button type="button" className="text-action" onClick={onEditKpi} disabled={Boolean(closedAt)}>{kpiReady ? '修改数据' : '填写数据'}</button></div>

  return (
    <section className="look-section kpi-look signal-overview" data-signal-module={scene.signalModule} data-workspace-module="true" id={scene.id} data-look={scene.id} aria-labelledby={`${scene.id}-title`}>
      <SceneTitle scene={scene} note="销售数据是唯一闭店要求。各模块保留原业务流程，Signal Grid 只重新组织入口、状态与信息优先级。" action={titleAction} />
      <div className="signal-overview-grid" data-motion="data" aria-label="当日业务总览">
        <button type="button" className="signal-overview-primary" onClick={onEditKpi} disabled={Boolean(closedAt)} aria-label="填写或修改当日销售数据">
          <span>CORE KPI / SALES VEHICLES</span>
          <time dateTime={dateKey}>{dateKey.replaceAll('-', ' / ')}</time>
          <strong><FixedDigits value={kpi.salesVehicles} /></strong>
          <p>{kpiReady ? '销售数据已保存，可以闭店' : '等待填写销售数据'}</p>
        </button>
        <dl className="signal-overview-metrics">
          <div><dt>安全检查</dt><dd><FixedDigits value={kpi.safetyChecks} /></dd><small>{kpi.safetyModel || 'MODEL 未填写'}</small></div>
          <div><dt>有效评价</dt><dd><FixedDigits value={kpi.validReviews} /></dd><small>VALID REVIEWS</small></div>
          <div><dt>二手售出</dt><dd><FixedDigits value={kpi.usedSold} /></dd><small>USED SOLD</small></div>
          <div><dt>收二手车</dt><dd><FixedDigits value={kpi.usedReceived} /></dd><small>USED RECEIVED</small></div>
        </dl>
      </div>
      <nav className="signal-business-map" aria-label="业务模块地图" data-motion="data">
        <div className="signal-business-map-head"><span>BUSINESS MAP / 业务地图</span><strong>{kpiReady ? 'CLOSE READY' : 'SALES DUE'}</strong></div>
        <ol>
          {overviewModules.map((sceneId) => {
            const module = sceneById(sceneId)
            const count = sceneId === 'sales' ? Number(kpiReady) : records.filter((record) => record.scene === sceneId).length
            const ModuleIcon = module.NavIcon
            return (
              <li key={sceneId}>
                <button type="button" data-signal-module={module.signalModule} data-ready={sceneId === 'sales' && kpiReady ? 'true' : undefined} onClick={() => onJump(sceneId)}>
                  <span className="signal-business-map-no">{module.no}</span>
                  <ModuleIcon width={23} height={23} strokeWidth={SIGNAL_ICON_STROKE} data-signal-icon="outline" aria-hidden="true" />
                  <span className="signal-business-map-copy"><strong>{module.title}</strong><small>{module.cn}</small></span>
                  <em>{sceneId === 'sales' ? (kpiReady ? 'READY' : 'DUE') : `${count} 条`}</em>
                </button>
              </li>
            )
          })}
        </ol>
      </nav>
    </section>
  )
}
