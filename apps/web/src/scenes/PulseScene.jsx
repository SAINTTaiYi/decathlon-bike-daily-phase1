import IconJournal from '@iconoir/Journal.mjs'
import IconCheckCircle from '@iconoir/CheckCircle.mjs'
import IconStar from '@iconoir/Star.mjs'
import IconDollarCircle from '@iconoir/DollarCircle.mjs'
import IconShoppingBag from '@iconoir/ShoppingBag.mjs'
import { sceneById } from '../data/lookbookScenes.js'
import FixedDigits from '../components/lookbook/FixedDigits.jsx'
import { SceneTitle } from '../components/lookbook/LookbookPrimitives.jsx'

const indexConfig = [
  ['pickup', 'PICKUP', '待取车辆'],
  ['poster', 'OTHER', '其它交接'],
  ['repair', 'REPAIR', '维修交接'],
  ['resale', 'USED', '二手车台账']
]

export default function PulseScene({ dateKey, kpi, kpiReady, records, closedAt, onJump, onEditKpi, onHistory }) {
  const scene = sceneById('pulse')
  const titleAction = <div className="scene-actions"><button type="button" className="text-action" onClick={onHistory}><IconJournal width={18} height={18} aria-hidden="true" />操作记录</button></div>

  // 按场景分组记录计数
  const recordCounts = {
    pickup: records.filter((r) => r.scene === 'pickup').length,
    poster: records.filter((r) => r.scene === 'poster').length,
    repair: records.filter((r) => r.scene === 'repair').length,
    resale: records.filter((r) => r.scene === 'resale').length
  }

  // 二手车细分计数
  const resalePending = records.filter((r) => r.scene === 'resale' && r.resaleStage === 'pending').length
  const resaleListed = records.filter((r) => r.scene === 'resale' && r.resaleStage === 'listed').length

  // 次要 KPI 图标配置
  const secondaryKpis = [
    { icon: IconCheckCircle, label: '安全检查', value: kpi.safetyChecks, meta: kpi.safetyModel || '未填写' },
    { icon: IconStar, label: '有效评价', value: kpi.validReviews, meta: 'REVIEWS' },
    { icon: IconDollarCircle, label: '售二手车', value: kpi.usedSold, meta: 'SOLD' },
    { icon: IconShoppingBag, label: '收二手车', value: kpi.usedReceived, meta: 'RECEIVED' }
  ]

  return (
    <section className="look-section kpi-look kpi-fused" data-workspace-module="true" data-depth-section={scene.id} id={scene.id} data-look={scene.id} aria-labelledby={`${scene.id}-title`}>
      <SceneTitle scene={scene} note="销售数据是唯一闭店要求。维修、待取、二手车和其它交接只在实际变化时编辑，未操作事项会跨日延续。" action={titleAction} />
      
      {/* 紧凑主 KPI 头部 */}
      <div className="kpi-compact-header" data-motion="data">
        <button type="button" className="kpi-primary-compact" onClick={onEditKpi} disabled={Boolean(closedAt)} aria-label="填写或修改当日销售数据">
          <time dateTime={dateKey}>{dateKey.replaceAll('-', ' / ')}</time>
          <div className="kpi-primary-value">
            <span className="kpi-label">销售车辆</span>
            <strong className="kpi-number"><FixedDigits value={kpi.salesVehicles} /></strong>
            <span className="kpi-status" data-ready={kpiReady ? 'true' : undefined}>{kpiReady ? 'READY' : 'DUE'}</span>
          </div>
        </button>
      </div>

      {/* 次要 KPI 横向图标栏 */}
      <div className="kpi-secondary-bar" data-motion="data">
        {secondaryKpis.map(({ icon: Icon, label, value, meta }) => (
          <div key={label} className="kpi-secondary-item" title={`${label} ${value} · ${meta}`}>
            <Icon width={16} height={16} aria-hidden="true" />
            <strong><FixedDigits value={value} /></strong>
            <small>{label}</small>
          </div>
        ))}
      </div>

      {/* 融合导航卡片 */}
      <nav className="fused-nav-grid" aria-label="业务台账模块" data-motion="data">
        {indexConfig.map(([sceneId, en, cn]) => {
          const count = recordCounts[sceneId]
          // 关联 KPI 提示
          let kpiHint = ''
          if (sceneId === 'pickup' && kpi.validReviews > 0) kpiHint = `评价 ${kpi.validReviews}`
          if (sceneId === 'repair' && kpi.safetyChecks > 0) kpiHint = `安检 ${kpi.safetyChecks}`
          if (sceneId === 'resale') kpiHint = `收${kpi.usedReceived} 售${kpi.usedSold}`

          return (
            <button key={sceneId} type="button" className="fused-nav-card" data-depth-card="true" onClick={() => onJump(sceneId)}>
              <div className="fused-nav-header">
                <span className="fused-nav-en">{en}</span>
                <span className="fused-nav-cn">{cn}</span>
              </div>
              <div className="fused-nav-count">
                <strong><FixedDigits value={count} /></strong>
                <span>{sceneId === 'resale' ? `待修${resalePending} 在册${resaleListed}` : '条'}</span>
              </div>
              {kpiHint ? <small className="fused-nav-kpi-hint">{kpiHint}</small> : null}
            </button>
          )
        })}

        {/* 销售数据通栏卡片 */}
        <button type="button" className="fused-nav-card fused-nav-sales" data-depth-card="true" data-complete={kpiReady ? 'true' : undefined} onClick={onEditKpi} disabled={Boolean(closedAt)}>
          <div className="fused-nav-header">
            <span className="fused-nav-en">SALES</span>
            <span className="fused-nav-cn">销售数据 · 唯一闭店要求</span>
          </div>
          <div className="fused-nav-count">
            <strong><FixedDigits value={kpi.salesVehicles} /></strong>
            <span className="fused-nav-sales-status">{kpiReady ? 'READY · 可闭店' : 'DUE · 待填写'}</span>
          </div>
        </button>
      </nav>
    </section>
  )
}
