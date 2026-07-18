import IconEdit from '@iconoir/EditPencil.mjs'
import IconJournal from '@iconoir/Journal.mjs'
import IconPlus from '@iconoir/Plus.mjs'
import IconTrash from '@iconoir/Trash.mjs'
import ProjectSelect from '../ProjectSelect.jsx'
import {
  inferPickupNotificationStatus,
  inferPickupSource,
  PICKUP_NOTIFICATION_STATUSES,
  pickupSourceLabel,
  selfPickupPlatformLabel
} from '../../data/pickupRecord.js'
import { formatTicketNumber, serviceSectionLabel, splitMaintenanceItems } from '../../data/recordPresentation.js'

function Fact({ label, children }) {
  if (children === undefined || children === null || children === '') return null
  return <div><dt>{label}</dt><dd>{children}</dd></div>
}

export default function RecordLedger({
  records = [], config, closedAt, onAdd, onEdit, onRemove, onHistory,
  onHandoverComplete, onPickup, onResaleListing, onResaleSold,
  onRepairComplete, onPickupNotificationChange, pickupErrors = {},
  heading = 'ACTIVE LEDGER / 在册台账', dark = false, showAdd = true
}) {
  return (
    <div className="record-ledger" data-dark={dark ? 'true' : undefined} aria-label={`${config.singular}台账，共 ${records.length} 条`}>
      <div className="record-ledger-head">
        <div><span>{heading}</span><small>WORKSHOP LEDGER</small></div>
        <strong>{String(records.length).padStart(2, '0')}</strong>
        <div className="ledger-head-actions" data-single={!showAdd ? 'true' : undefined}>
          <button type="button" className="ledger-history" onClick={() => onHistory()}><IconJournal width={17} height={17} aria-hidden="true" />操作记录</button>
          {showAdd ? <button type="button" className="ledger-add" onClick={onAdd} disabled={Boolean(closedAt)}><IconPlus width={17} height={17} aria-hidden="true" />{config.addLabel}</button> : null}
        </div>
      </div>
      {records.length ? records.map((record) => {
        const pickedUp = Boolean(record.pickedUpToday)
        const completedToday = Boolean(record.completedToday)
        const resolved = pickedUp || completedToday
        const pickupError = pickupErrors[record.id] || ''
        const pickupRecord = record.scene === 'pickup'
        const repairRecord = record.scene === 'repair'
        const pickupSource = pickupRecord ? inferPickupSource(record) : ''
        const repairPickup = pickupSource === 'repair'
        const serviceTicket = pickupRecord || repairRecord
        const pickupNotificationStatus = pickupRecord ? inferPickupNotificationStatus(record) : null
        const contactValue = String(record.contactValue ?? '').trim()
        const contactLabel = record.contactType === 'member' ? '会员号' : '手机号'
        const detail = String(record.repairProject || record.detail || '').trim()
        const detailItems = splitMaintenanceItems(detail)
        const sectionLabel = serviceSectionLabel({ ...record, pickupSource })
        const ticketNumber = formatTicketNumber(record.ticketNo, record.id)
        const sourceLabel = pickupRecord
          ? `${pickupSourceLabel(record)}${selfPickupPlatformLabel(record) ? ` / ${selfPickupPlatformLabel(record)}` : ''}`
          : repairRecord ? '维修登记' : ''
        const stateLabel = pickedUp ? '已取车' : completedToday ? '已完成' : record.status
        const rowDark = dark || resolved
        const actionButtons = (
          <>
            {record.scene === 'resale' && record.resaleStage === 'pending' ? <button type="button" className="record-primary-action" onClick={() => onResaleListing(record)} disabled={Boolean(closedAt)}>维修完毕</button> : null}
            {record.scene === 'resale' && record.resaleStage === 'listed' ? <button type="button" className="record-primary-action" onClick={() => onResaleSold(record)} disabled={Boolean(closedAt)}>已售出</button> : null}
            {record.scene === 'repair' && !record.completedOn ? <button type="button" className="record-primary-action" onClick={() => onRepairComplete(record)} disabled={Boolean(closedAt)}>维修完毕</button> : null}
            {record.scene === 'poster' && !record.completedOn ? <button type="button" className="record-primary-action" onClick={() => onHandoverComplete(record)} disabled={Boolean(closedAt)}>完成</button> : null}
            {record.scene === 'pickup' && !record.pickedUpOn ? <button type="button" className="record-primary-action" onClick={() => onPickup(record)} disabled={Boolean(closedAt)}>确认取车</button> : null}
            {!resolved ? <button type="button" onClick={() => onEdit(record)} disabled={Boolean(closedAt)} aria-label={`编辑：${record.title}`}><IconEdit width={16} height={16} aria-hidden="true" />编辑</button> : null}
            {!resolved ? <button type="button" className="record-delete" onClick={() => onRemove(record)} disabled={Boolean(closedAt)} aria-label={`删除：${record.title}`}><IconTrash width={16} height={16} aria-hidden="true" />删除</button> : null}
          </>
        )

        return (
          <article className="record-row" key={record.id} data-record-id={record.id} data-service-ticket={serviceTicket ? 'true' : undefined} data-row-dark={rowDark ? 'true' : undefined} data-resolved={resolved ? 'true' : undefined} data-error={pickupError ? 'true' : undefined} data-motion="row">
            <header className="record-row-head">
              <button type="button" className="record-history-mark" onClick={() => onHistory(record)} aria-label={`查看“${record.title}”的操作记录`}><IconJournal width={17} height={17} aria-hidden="true" /></button>
              <div className="record-model-block">
                <strong>{record.title}</strong>
                <span>{ticketNumber}</span>
              </div>
              <div className="record-state-line">
                {pickupRecord && !pickedUp ? (
                  <ProjectSelect value={pickupNotificationStatus} options={PICKUP_NOTIFICATION_STATUSES} onChange={(value) => onPickupNotificationChange(record, value)} disabled={Boolean(closedAt)} ariaLabel={`${record.title}的通知状态`} compact />
                ) : null}
                <span className="record-state">{pickedUp ? 'PICKED UP' : completedToday ? 'COMPLETED' : record.scene === 'resale' && record.resaleStage === 'pending' ? 'PENDING' : 'ACTIVE'}</span>
              </div>
            </header>

            {detailItems.length ? (
              <section className="record-maintenance" aria-label={`${sectionLabel}：${detailItems.join('、')}`}>
                <span>{sectionLabel}</span>
                <ul>{detailItems.map((item, index) => <li key={`${item}-${index}`}>{item}</li>)}</ul>
              </section>
            ) : null}

            <dl className="record-meta-grid">
              <Fact label={contactLabel}>{contactValue}</Fact>
              <Fact label="取车日期">{record.pickupDate ? <time dateTime={record.pickupDate}>{record.pickupDate.replaceAll('-', '.')}</time> : null}</Fact>
              <Fact label="来源">{sourceLabel}</Fact>
              <Fact label={repairRecord || repairPickup ? '支付 / 类型' : '状态'}>{repairRecord || repairPickup ? record.repairType : stateLabel}</Fact>
              {(repairRecord || repairPickup) ? <Fact label="当前状态">{stateLabel}</Fact> : null}
              {!serviceTicket && record.meta ? <Fact label="关联信息">{record.meta}</Fact> : null}
            </dl>

            {pickupError ? <p className="record-inline-error" role="alert">{pickupError}</p> : null}
            {resolved ? <p className="record-resolution-note">{pickedUp ? '本条今日保留，下一业务日自动移除。' : '本条今日保留，下一业务日自动清除。'}</p> : null}
            <footer className="record-actions">{actionButtons}</footer>
          </article>
        )
      }) : <p className="empty-inline">当前没有记录。{showAdd ? `使用“${config.addLabel}”开始录入。` : ''}</p>}
    </div>
  )
}
