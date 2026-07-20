import IconCalendar from '@iconoir/Calendar.mjs'
import IconCheck from '@iconoir/Check.mjs'
import IconEdit from '@iconoir/EditPencil.mjs'
import IconJournal from '@iconoir/Journal.mjs'
import IconPhone from '@iconoir/Phone.mjs'
import IconPlus from '@iconoir/Plus.mjs'
import IconTrash from '@iconoir/Trash.mjs'
import ProjectSelect from '../ProjectSelect.jsx'
import {
  decodePickupContact,
  inferPickupNotificationStatus,
  inferPickupSource,
  PICKUP_NOTIFICATION_STATUSES,
  pickupContactLabel,
  pickupSourceLabel,
  selfPickupPlatformLabel
} from '../../data/pickupRecord.js'
import {
  formatScanDate,
  formatTicketNumber,
  joinMaintenanceLine,
  displayContactValue
} from '../../data/recordPresentation.js'

function Badge({ children }) {
  if (!children) return null
  return <span className="record-badge">{children}</span>
}

export default function RecordLedger({
  records = [], config, closedAt, onAdd, onEdit, onRemove, onHistory,
  onHandoverComplete, onPickup, onResaleListing, onResaleSold,
  onRepairComplete, onPickupNotificationChange, pickupErrors = {},
  heading = 'ACTIVE LEDGER / 在册台账', dark = false, showAdd = true
}) {
  return (
    <div className="record-ledger" data-reveal-group="records" data-dark={dark ? 'true' : undefined} aria-label={`${config.singular}台账，共 ${records.length} 条`}>
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
        const manualContact = pickupRecord && !repairPickup ? decodePickupContact(record) : null
        const contactType = repairPickup || repairRecord
          ? (record.contactType === 'member' ? 'member' : 'phone')
          : (manualContact?.contactType || 'phone')
        const contactValue = String(
          repairPickup || repairRecord
            ? (record.contactValue ?? '')
            : (manualContact?.contactValue ?? '')
        ).trim()
        const contactLabel = pickupContactLabel(contactType)
        const contactDisplay = contactValue || '无'
        const showContact = repairRecord || pickupRecord
        const detail = String(record.repairProject || record.detail || '').trim()
        const detailLine = joinMaintenanceLine(detail)
        const ticketNumber = formatTicketNumber(record.ticketNo, record.id)
        const sourceLabel = pickupRecord
          ? `${pickupSourceLabel(record)}${selfPickupPlatformLabel(record) ? ` / ${selfPickupPlatformLabel(record)}` : ''}`
          : repairRecord ? '维修登记' : ''
        const stateLabel = pickedUp ? '已取车' : completedToday ? '已完成' : record.status
        const paymentOrType = repairRecord || repairPickup ? record.repairType : ''
        const rowDark = dark || resolved
        const englishState = pickedUp ? 'PICKED UP' : completedToday ? 'COMPLETED' : record.scene === 'resale' && record.resaleStage === 'pending' ? 'PENDING' : 'ACTIVE'
        const actionButtons = (
          <>
            {record.scene === 'resale' && record.resaleStage === 'pending' ? <button type="button" className="record-primary-action" onClick={() => onResaleListing(record)} disabled={Boolean(closedAt)}><IconCheck width={15} height={15} aria-hidden="true" />维修完毕</button> : null}
            {record.scene === 'resale' && record.resaleStage === 'listed' ? <button type="button" className="record-primary-action" onClick={() => onResaleSold(record)} disabled={Boolean(closedAt)}><IconCheck width={15} height={15} aria-hidden="true" />已售出</button> : null}
            {record.scene === 'repair' && !record.completedOn ? <button type="button" className="record-primary-action" onClick={() => onRepairComplete(record)} disabled={Boolean(closedAt)}><IconCheck width={15} height={15} aria-hidden="true" />维修完毕</button> : null}
            {record.scene === 'poster' && !record.completedOn ? <button type="button" className="record-primary-action" onClick={() => onHandoverComplete(record)} disabled={Boolean(closedAt)}><IconCheck width={15} height={15} aria-hidden="true" />完成</button> : null}
            {record.scene === 'pickup' && !pickedUp ? <button type="button" className="record-primary-action" onClick={() => onPickup(record)} disabled={Boolean(closedAt)}><IconCheck width={15} height={15} aria-hidden="true" />确认取车</button> : null}
            {!resolved ? <button type="button" onClick={() => onEdit(record)} disabled={Boolean(closedAt)} aria-label={`编辑：${record.title}`}><IconEdit width={15} height={15} aria-hidden="true" />编辑</button> : null}
            {!resolved ? <button type="button" className="record-delete" onClick={() => onRemove(record)} disabled={Boolean(closedAt)} aria-label={`删除：${record.title}`}><IconTrash width={15} height={15} aria-hidden="true" />删除</button> : null}
          </>
        )

        return (
          <article className="record-row" data-spatial-tilt="true" key={record.id} data-record-id={record.id} data-service-ticket={serviceTicket ? 'true' : undefined} data-row-dark={rowDark ? 'true' : undefined} data-resolved={resolved ? 'true' : undefined} data-error={pickupError ? 'true' : undefined} data-motion="row">
            <header className="record-row-head">
              <button type="button" className="record-history-mark" onClick={() => onHistory(record)} aria-label={`查看“${record.title}”的操作记录`}><IconJournal width={16} height={16} aria-hidden="true" /></button>
              <div className="record-model-block">
                <strong>{record.title}</strong>
                <span>{ticketNumber}</span>
                {pickupRecord && !pickedUp ? (
                  <div className="record-notify-line">
                    <ProjectSelect value={pickupNotificationStatus} options={PICKUP_NOTIFICATION_STATUSES} onChange={(value) => onPickupNotificationChange(record, value)} disabled={Boolean(closedAt)} ariaLabel={`${record.title}的通知状态`} compact />
                  </div>
                ) : null}
              </div>
              <div className="record-head-meta" aria-label="来源、支付与状态">
                <span className="record-state">{englishState}</span>
                <div className="record-badge-row">
                  <Badge>{sourceLabel}</Badge>
                  <Badge>{paymentOrType}</Badge>
                  <Badge>{stateLabel}</Badge>
                  {!serviceTicket && record.meta ? <Badge>{record.meta}</Badge> : null}
                </div>
              </div>
            </header>

            <div className="record-body">
              {detailLine ? (
                <p className="record-detail-line" aria-label={`维修内容：${detail}`}>
                  {detailLine}
                </p>
              ) : null}

              <div className="record-scan-line">
                {showContact ? (
                  <span className="record-scan-item" title={`${contactLabel} ${contactDisplay}`}>
                    <IconPhone width={14} height={14} aria-hidden="true" />
                    <span>{contactValue ? displayContactValue(contactValue) : '无'}</span>
                  </span>
                ) : null}
                {record.pickupDate ? (
                  <span className="record-scan-item" title={`取车日期 ${record.pickupDate}`}>
                    <IconCalendar width={14} height={14} aria-hidden="true" />
                    <time dateTime={record.pickupDate}>{formatScanDate(record.pickupDate)}</time>
                  </span>
                ) : null}
              </div>

              {pickupError ? <p className="record-inline-error" role="alert">{pickupError}</p> : null}
              {resolved ? <p className="record-resolution-note">{pickedUp ? '本条今日保留，下一业务日自动移除。' : '本条今日保留，下一业务日自动清除。'}</p> : null}
              <footer className="record-actions">{actionButtons}</footer>
            </div>
          </article>
        )
      }) : <p className="empty-inline">当前没有记录。{showAdd ? `使用“${config.addLabel}”开始录入。` : ''}</p>}
    </div>
  )
}
