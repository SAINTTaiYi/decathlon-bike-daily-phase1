import IconJournal from '@iconoir/Journal.mjs'
import { sceneById } from '../data/lookbookScenes.js'
import FixedDigits from '../components/lookbook/FixedDigits.jsx'
import MainHeadImage from '../components/lookbook/MainHeadImage.jsx'
import { SceneTitle } from '../components/lookbook/LookbookPrimitives.jsx'

const overviewModules = ['pickup', 'poster', 'repair', 'resale', 'sales']

export default function PulseScene({ dateKey, kpi, kpiReady, records, closedAt, onJump, onEditKpi, onHistory }) {
  const scene = sceneById('pulse')
  const overviewEntries = overviewModules
    .map((sceneId, sourceIndex) => {
      const module = sceneById(sceneId)
      const count = sceneId === 'sales' ? Number(kpiReady) : records.filter((record) => record.scene === sceneId).length
      const priorityScore = sceneId === 'sales' && !kpiReady ? 10000 : (count * 100) - sourceIndex
      return { sceneId, module, count, priorityScore }
    })
    .sort((left, right) => right.priorityScore - left.priorityScore)
  const titleAction = <div className="scene-actions"><button type="button" className="text-action" onClick={onHistory}><IconJournal width={16} height={16} aria-hidden="true" />操作记录</button><button type="button" className="text-action" onClick={onEditKpi} disabled={Boolean(closedAt)}>{kpiReady ? '修改数据' : '填写数据'}</button></div>

  return (
    <section className="look-section kpi-look signal-overview signal-overview-prototype" data-signal-module={scene.signalModule} data-workspace-module="true" id={scene.id} data-look={scene.id} aria-labelledby={`${scene.id}-title`}>
      <SceneTitle scene={scene} note="销售数据是唯一闭店要求。销售数据是唯一闭店要求。模块面积与顺序按当日待处理业务量动态组织。" action={titleAction} />
      <div className="signal-overview-grid" data-motion="data" aria-label="当日业务总览">
        <button type="button" className="signal-overview-primary" onClick={onEditKpi} disabled={Boolean(closedAt)} aria-label="填写或修改当日销售数据">
          <span>CORE KPI / SALES VEHICLES</span>
          <time dateTime={dateKey}>{dateKey.replaceAll('-', ' / ')}</time>
          <strong data-glitch-motion data-glitch-scan><FixedDigits value={kpi.salesVehicles} /></strong>
          <p>{kpiReady ? '销售数据已保存，可以闭店' : '等待填写销售数据'}</p>
        </button>
        <MainHeadImage />
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
          {overviewEntries.map(({ sceneId, module, count }, index) => (
            <li key={sceneId} data-business-scene={sceneId} data-business-rank={index + 1}>
              <button type="button" data-signal-module={module.signalModule} data-business-module={module.signalModule} data-ready={sceneId === 'sales' && kpiReady ? 'true' : undefined} onClick={() => onJump(sceneId)}>
                <span className="signal-business-map-no">{module.no}</span>
                <span className="signal-business-map-code">{module.label}</span>
                <span className="signal-business-map-copy"><strong>{module.title}</strong><small>{module.cn}</small></span>
                <em>{sceneId === 'sales' ? (kpiReady ? 'READY' : 'DUE') : `${count} 条`}</em>
                <i className="signal-business-map-trace" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ol>
      </nav>
    </section>
  )
}
