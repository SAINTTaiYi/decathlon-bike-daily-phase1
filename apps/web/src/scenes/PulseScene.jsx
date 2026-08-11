import IconJournal from '@iconoir/Journal.mjs'
import { sceneById } from '../data/lookbookScenes.js'
import FixedDigits from '../components/lookbook/FixedDigits.jsx'
import { SceneTitle } from '../components/lookbook/LookbookPrimitives.jsx'

const indexConfig = [
  ['pickup', 'PICKUP', '待取车辆'],
  ['poster', 'OTHER', '其它交接'],
  ['repair', 'REPAIR', '维修交接'],
  ['resale', 'USED', '二手车台账'],
  ['sales', 'SALES', '销售数据']
]

export default function PulseScene({ dateKey, kpi, kpiReady, records, closedAt, onJump, onEditKpi, onHistory }) {
  const scene = sceneById('pulse')
  const kpiRows = [
    ['安全检查开单', kpi.safetyChecks, kpi.safetyModel ? `MODEL · ${kpi.safetyModel}` : 'MODEL · 未填写'],
    ['顾客有效评价', kpi.validReviews, 'VALID REVIEWS'],
    ['销售二手车', kpi.usedSold, 'USED SOLD'],
    ['收二手车', kpi.usedReceived, 'USED RECEIVED']
  ]
  const titleAction = <div className="scene-actions"><button type="button" className="text-action" onClick={onHistory}><IconJournal width={18} height={18} aria-hidden="true" />操作记录</button><button type="button" className="text-action" onClick={onEditKpi} disabled={Boolean(closedAt)}>{kpiReady ? '修改数据' : '填写数据'}</button></div>

  return (
    <section className="look-section kpi-look" data-workspace-module="true" data-depth-section={scene.id} id={scene.id} data-look={scene.id} aria-labelledby={`${scene.id}-title`}>
      <SceneTitle scene={scene} note="销售数据是唯一闭店要求。维修、待取、二手车和其它交接只在实际变化时编辑，未操作事项会跨日延续。" action={titleAction} />
      <div className="kpi-sheet" data-motion="data" data-spatial-tilt="true" aria-label="当日 workshop KPI">
        <button type="button" className="kpi-primary" onClick={onEditKpi} disabled={Boolean(closedAt)} aria-label="填写或修改当日销售数据">
          <time dateTime={dateKey}>{dateKey.replaceAll('-', ' / ')}</time>
          <span>SALES VEHICLES</span>
          <strong><FixedDigits value={kpi.salesVehicles} /></strong>
          <p>销售车辆 · {kpiReady ? '今日已保存' : '等待人工填写'}</p>
        </button>
        <dl className="kpi-notes" data-depth-card="true">
          {kpiRows.map(([label, value, meta], index) => (
            <div key={label}><span><FixedDigits value={index + 1} /></span><dt>{label}</dt><dd><FixedDigits value={value} /></dd><small>{meta}</small></div>
          ))}
        </dl>
      </div>
      <nav className="handover-index" aria-label="业务台账模块" data-motion="data">
        <div className="handover-index-head"><span>OPERATIONS INDEX · 业务台账</span><strong>{kpiReady ? '可闭店' : '销售数据待填写'}</strong></div>
        <ol>
          {indexConfig.map(([sceneId, en, cn], index) => {
            const count = sceneId === 'sales' ? Number(kpiReady) : records.filter((record) => record.scene === sceneId).length
            return (
              <li key={sceneId}>
                <button type="button" data-complete={sceneId === 'sales' && kpiReady ? 'true' : undefined} onClick={() => onJump(sceneId)}>
                  <span className="handover-index-no"><FixedDigits value={index + 2} /></span>
                  <span className="handover-index-copy"><strong>{en}</strong><small>{cn}{sceneId === 'sales' ? ' · 唯一闭店要求' : ' · 跨日保留'}</small></span>
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
