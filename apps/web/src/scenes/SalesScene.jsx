import IconJournal from '@iconoir/Journal.mjs'
import { sceneById } from '../data/lookbookScenes.js'
import { SceneTitle } from '../components/lookbook/LookbookPrimitives.jsx'
import { BiInsightPanel } from '../components/overview/BiInsightCharts.jsx'
import BiSalesMobile from '../components/overview/BiSalesMobile.jsx'
import { useViewportKind } from '../hooks/useViewportKind.js'

// 2026-09-02：销售数据模块换血——原人工 KPI 摘要清空，模块主体改为 BI 数据。
// 填写/修改当日销售数据（唯一闭店要求）保留在标题操作与主按钮里，不丢闭店流程。
export default function SalesScene({ kpi, kpiReady, savedAt, closedAt, onEditKpi, onHistory }) {
  const scene = sceneById('sales')
  const viewport = useViewportKind()
  const titleAction = <div className="scene-actions"><button type="button" className="text-action" onClick={onHistory}><IconJournal width={18} height={18} aria-hidden="true" />操作记录</button><button type="button" className="text-action" onClick={onEditKpi} disabled={Boolean(closedAt)}>{kpiReady ? '修改数据' : '填写数据'}</button></div>
  return (
    <section className="look-section closing-look" data-depth-section={scene.id} id={scene.id} data-look={scene.id} aria-labelledby={`${scene.id}-title`}>
      <SceneTitle scene={scene} note="BI 自行车+工作室口径数据；当日销售数据仍为唯一闭店要求。" action={titleAction} />
      <div className="sales-bi-slot" data-motion="data">
        {viewport === 'desktop' ? <BiInsightPanel /> : <BiSalesMobile />}
      </div>
    </section>
  )
}
