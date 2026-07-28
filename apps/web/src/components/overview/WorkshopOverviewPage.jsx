import IconCash from '@iconoir/Cash.mjs'
import IconDelivery from '@iconoir/DeliveryTruck.mjs'
import IconLabel from '@iconoir/Label.mjs'
import IconShop from '@iconoir/ShopWindow.mjs'
import IconWrench from '@iconoir/Wrench.mjs'
import { APP_VERSION, currentRelease } from '../../data/releaseNotes.js'
import { decodePickupContact, pickupNotificationLabel } from '../../data/pickupRecord.js'

const operations = [
  { id: 'pickup', no: '02', en: 'PICKUP', cn: '待取车辆', Icon: IconDelivery },
  { id: 'poster', no: '03', en: 'OTHER', cn: '其它交接', Icon: IconShop },
  { id: 'repair', no: '04', en: 'REPAIR', cn: '维修交接', Icon: IconWrench },
  { id: 'resale', no: '05', en: 'USED', cn: '二手车台账', Icon: IconLabel },
  { id: 'sales', no: '06', en: 'SALES', cn: '销售数据', Icon: IconCash }
]

const kpiItems = [
  { key: 'safetyChecks', no: '01', cn: '安全检查开单', en: 'MODEL' },
  { key: 'validReviews', no: '02', cn: '顾客有效评价', en: 'VALID REVIEWS' },
  { key: 'usedSold', no: '03', cn: '销售二手车', en: 'USED SOLD' },
  { key: 'usedReceived', no: '04', cn: '收二手车', en: 'USED RECEIVED' }
]

function dateParts(dateKey) {
  const source = dateKey ? new Date(`${dateKey}T12:00:00`) : new Date()
  if (Number.isNaN(source.getTime())) return { full: '—', short: '—' }
  const weekday = ['日', '一', '二', '三', '四', '五', '六'][source.getDay()]
  const year = source.getFullYear()
  const month = String(source.getMonth() + 1).padStart(2, '0')
  const day = String(source.getDate()).padStart(2, '0')
  return { full: `${year} / ${month} / ${day} 周${weekday}`, short: `${month} / ${day} 周${weekday}` }
}

function displayMetric(value, available = true) {
  if (!available || value === null || value === undefined || Number.isNaN(Number(value))) return '—'
  return String(Math.max(0, Number(value))).padStart(2, '0')
}

function MenuGlyph() {
  return <span className="ops-menu-glyph" aria-hidden="true"><i /><i /><i /></span>
}

function BellGlyph({ unread }) {
  return <span className="ops-bell-glyph" aria-hidden="true"><i />{unread ? <b /> : null}</span>
}

function ArrowGlyph() { return <span className="ops-arrow" aria-hidden="true">›</span> }

function StatusValue({ value, available }) {
  const progress = available ? Math.max(0, Math.min(100, value)) : null
  return (
    <div className="ops-status-value" aria-label={progress === null ? '闭店准备度暂不可用' : `闭店准备度 ${progress}%`}>
      <strong>{progress === null ? '—' : progress}</strong>{progress === null ? null : <span>%</span>}
    </div>
  )
}

function BrandHeader({ dateKey, onMenu, onNotifications, hasUnread }) {
  const date = dateParts(dateKey)
  return (
    <header className="ops-brand-header">
      <button type="button" className="ops-icon-button" onClick={onMenu} aria-label="打开日报菜单"><MenuGlyph /></button>
      <div className="ops-brand-lockup"><span>WORKSHOP LEDGER</span><div><strong>WORKSHOP OPS</strong><em>V{APP_VERSION}</em></div></div>
      <time dateTime={dateKey || undefined} data-short={date.short}>{date.full}</time>
      <button type="button" className="ops-icon-button" onClick={onNotifications} aria-label="查看当日日志"><BellGlyph unread={hasUnread} /></button>
    </header>
  )
}

function StoreContextCard({ storeName, roleLabel, userName, onMenu }) {
  return (
    <section className="ops-store-context" aria-label="当前门店和用户">
      <span className="ops-store-mark" aria-hidden="true"><IconShop width={24} height={24} strokeWidth={1.75} /></span>
      <div className="ops-store-identity"><span>{storeName || '门店'} · {roleLabel || '成员'}</span><strong>{userName || '—'}</strong></div>
      <button type="button" onClick={onMenu} aria-label="打开菜单"><span className="ops-document-glyph" aria-hidden="true">▤</span><span><strong>菜单</strong><small>MENU</small></span><ArrowGlyph /></button>
    </section>
  )
}

function ClosingStatusCard({ workflow, online, onEditKpi, onCompleteClosing, onHistory, onRefresh }) {
  const available = workflow.hydrated && workflow.hasSnapshot
  const closed = Boolean(workflow.closedAt)
  const error = Boolean(workflow.storageError)
  const ready = workflow.kpiReady
  const progress = ready ? 100 : 0
  let nextLabel = 'NEXT / 唯一要求'
  let nextTitle = '填写当日销售数据'
  let nextCopy = '这是唯一的闭店要求'
  let action = '填写数据'
  let onAction = onEditKpi
  if (!available || error) {
    nextLabel = 'ERROR / 需要处理'
    nextTitle = '检查数据库同步'
    nextCopy = online ? '请重新同步后再操作' : '恢复网络后重试'
    action = '处理异常'
    onAction = onRefresh
  } else if (closed) {
    const time = new Intl.DateTimeFormat('zh-CN', { hour: '2-digit', minute: '2-digit' }).format(new Date(workflow.closedAt))
    nextLabel = 'DONE / 已闭店'
    nextTitle = '当日闭店已完成'
    nextCopy = `${time} 已同步`
    action = '查看记录'
    onAction = onHistory
  } else if (ready) {
    nextLabel = 'READY / 可以闭店'
    nextTitle = '当日销售数据已保存'
    nextCopy = '完成前请再次核对'
    action = '检查闭店'
    onAction = onCompleteClosing
  }
  return (
    <section className="ops-closing-card" aria-labelledby="ops-closing-title">
      <div className="ops-closing-main">
        <div className="ops-closing-title"><span>Daily closing</span><h2 id="ops-closing-title">今日闭店进度</h2><small>销售数据是唯一闭店要求</small></div>
        <StatusValue value={progress} available={available && !error} />
      </div>
      <div className="ops-closing-next">
        <span className="ops-clock-glyph" aria-hidden="true">◷</span>
        <span><small>{nextLabel}</small><strong>{nextTitle}</strong><em>{nextCopy}</em></span>
        <button type="button" onClick={onAction} disabled={!online && !closed}>{action}<ArrowGlyph /></button>
      </div>
    </section>
  )
}

function SalesVehiclesPanel({ dateKey, kpi, available, onEditKpi }) {
  const date = dateParts(dateKey)
  const salesValue = displayMetric(kpi?.salesVehicles, available)
  return (
    <section className="ops-sales-panel" aria-labelledby="ops-sales-title">
      <button type="button" className="ops-sales-primary" onClick={onEditKpi} aria-label="填写或修改当日销售数据">
        <span className="ops-sales-label"><i /><strong id="ops-sales-title">SALES VEHICLES</strong></span>
        <time dateTime={dateKey || undefined}>{date.full.replace(/ 周.$/u, '')}</time>
        <small>销售车辆 · {available ? '读取真实业务数据' : '数据暂不可用'}</small>
        <b data-digits={salesValue === '—' ? 'unavailable' : String(salesValue.length)}>{salesValue}</b>
        <span className="ops-blueprint" aria-hidden="true"><img src="/images/ops/bicycle-workshop-blueprint.svg" alt="" /><em>UNIT</em></span>
      </button>
      <div className="ops-kpi-grid">
        {kpiItems.map((item) => {
          const value = displayMetric(kpi?.[item.key], available)
          return <button type="button" key={item.key} onClick={onEditKpi}><small>{item.no}</small><span><strong>{item.cn}</strong></span><em>{item.key === 'safetyChecks' && kpi?.safetyModel ? `MODEL · ${kpi.safetyModel}` : item.en}</em><b data-digits={value === '—' ? 'unavailable' : String(value.length)}>{value}</b></button>
        })}
      </div>
    </section>
  )
}

function operationSummary(workflow) {
  if (workflow.storageError) return '同步异常'
  if (!workflow.hydrated || !workflow.hasSnapshot) return '业务数据加载中'
  if (workflow.closedAt) return '今日已闭店'
  if (!workflow.kpiReady) return '销售数据待填写'
  return '销售数据已保存 · 可闭店'
}

function OperationsIndex({ workflow, onJump }) {
  const available = workflow.hydrated && workflow.hasSnapshot && !workflow.storageError
  return (
    <nav className="ops-index" aria-label="业务台账模块">
      <div className="ops-index-head"><span className="ops-index-label"><span>OPERATIONS INDEX ·</span><span className="ops-index-label-cn">业务台账</span></span><strong>{operationSummary(workflow)}</strong></div>
      <ol>{operations.map(({ id, no, en, cn, Icon }) => {
        const count = workflow.recordsByScene[id]?.length ?? 0
        let value = displayMetric(count, available)
        if (id === 'sales') {
          value = !available ? '—' : workflow.closedAt ? 'DONE' : workflow.kpiReady ? 'READY' : 'DUE'
        }
        return <li key={id}><button type="button" onClick={() => onJump(id)}><small>{no}</small><span><Icon width={18} height={18} strokeWidth={1.7} aria-hidden="true" /><strong>{en}</strong></span><em>{cn}</em><b data-value={String(value).toLowerCase()}>{value}</b><ArrowGlyph /></button></li>
      })}</ol>
    </nav>
  )
}

function compactContact(record) {
  const { contactValue } = decodePickupContact(record)
  return contactValue || record.detail || record.meta || '未填写联系人'
}

function compactDate(record) {
  if (record.pickupDate) return record.pickupDate.slice(5).replace('-', '.')
  if (record.updatedAt) return new Intl.DateTimeFormat('zh-CN', { month: '2-digit', day: '2-digit' }).format(new Date(record.updatedAt))
  return '日期未填写'
}

function PickupBoard({ records, canCreate, onViewAll, onAdd, onEdit }) {
  const items = records.filter((record) => !record.pickedUpToday).slice(0, 3)
  return (
    <section className="ops-pickup-board" aria-labelledby="ops-pickup-title">
      <header><span>02</span><strong id="ops-pickup-title">PICKUP BOARD</strong><small>待取车辆 · 跨日保留</small><button type="button" onClick={onViewAll}>VIEW ALL <ArrowGlyph /></button></header>
      <div className="ops-pickup-grid">
        {items.map((record) => <button type="button" className="ops-pickup-card" key={record.id} onClick={() => onEdit(record)} aria-label={`查看或编辑 ${record.title}`}><strong>{record.title}</strong><span>{compactContact(record)}</span><small>◷ {compactDate(record)}</small><em>{pickupNotificationLabel(record)}</em></button>)}
        {items.length === 0 ? <button type="button" className="ops-pickup-empty" onClick={onViewAll}><strong>当前无待取车辆</strong><span>查看完整待取台账</span></button> : null}
        <button type="button" className="ops-pickup-add" onClick={onAdd} disabled={!canCreate}><b aria-hidden="true">＋</b><span>{canCreate ? '新增取车' : '当前不可新增'}</span></button>
      </div>
    </section>
  )
}

function ReleaseStrip() {
  return (
    <details className="ops-release-strip">
      <summary aria-label="查看更新说明"><strong>V{APP_VERSION}</strong><span>{currentRelease.title}</span><time>{currentRelease.date}</time><b aria-hidden="true">＋</b></summary>
      <div><p>{currentRelease.summary}</p><ul>{currentRelease.changes.map((change) => <li key={change}>{change}</li>)}</ul></div>
    </details>
  )
}

export default function WorkshopOverviewPage({ workflow, currentStore, roleLabel, currentUser, online, writeLocked, onMenu, onLog, onEditKpi, onCompleteClosing, onHistory, onRefresh, onJump, onAddPickup, onEditPickup }) {
  const pickupRecords = workflow.recordsByScene.pickup || []
  const available = workflow.hydrated && workflow.hasSnapshot
  return (
    <div className="ops-mobile-overview" data-workspace-module="true" aria-label="Workshop 业务总览">
      <BrandHeader dateKey={workflow.dateKey} onMenu={onMenu} onNotifications={onLog} hasUnread={Boolean(workflow.events?.length)} />
      <StoreContextCard storeName={currentStore?.storeName} roleLabel={roleLabel} userName={currentUser} onMenu={onMenu} />
      {!online ? <p className="ops-inline-alert" role="status">OFFLINE · 当前仅可查看最近成功加载的数据</p> : null}
      <ClosingStatusCard workflow={workflow} online={online} onEditKpi={onEditKpi} onCompleteClosing={onCompleteClosing} onHistory={onHistory} onRefresh={onRefresh} />
      <SalesVehiclesPanel dateKey={workflow.dateKey} kpi={workflow.kpi} available={available} onEditKpi={onEditKpi} />
      <OperationsIndex workflow={workflow} onJump={onJump} />
      <PickupBoard records={pickupRecords} canCreate={!writeLocked} onViewAll={() => onJump('pickup')} onAdd={onAddPickup} onEdit={onEditPickup} />
      <ReleaseStrip />
      <div className="ops-first-screen-spacer" aria-hidden="true" />
    </div>
  )
}
