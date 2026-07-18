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

export default function RecordLedger({
  records = [],
  config,
  closedAt,
  onAdd,
  onEdit,
  onRemove,
  onHistory,
  onHandoverComplete,
  onPickup,
  onResaleListing,
  onResaleSold,
  onRepairComplete,
  onPickupNotificationChange,
  pickupErrors = {},
  heading = 'ACTIVE LEDGER · 在册台账',
  dark = false,
  showAdd = true
}) {
  return (
    <div className="record-ledger" data-dark={dark ? 'true' : undefined} aria-label={`${config.singular}台账，共 ${records.length} 条`}>
      <div className="record-ledger-head">
        <span>{heading}</span>
        <strong>{records.length} 条</strong>
        <div className="ledger-head-actions" data-single={!showAdd ? 'true' : undefined}>
          <button type="button" className="ledger-history" onClick={() => onHistory()}><IconJournal width={18} height={18} aria-hidden="true" />操作记录</button>
          {showAdd ? <button type="button" className="ledger-add" onClick={onAdd} disabled={Boolean(closedAt)}><IconPlus width={18} height={18} aria-hidden="true" />{config.addLabel}</button> : null}
        </div>
      </div>
      {records.length ? records.map((record) => {
        const pickedUp = Boolean(record.pickedUpToday)
        const completedToday = Boolean(record.completedToday)
        const resolved = pickedUp || completedToday
        const pickupError = pickupErrors[record.id] || ''
        const pickupRecord = record.scene === 'pickup'
        const repairRecord = record.scene === 'repair'
        const repairPickup = pickupRecord && inferPickupSource(record) === 'repair'
        const serviceTicket = pickupRecord || repairRecord
        const pickupNotificationStatus = pickupRecord ? inferPickupNotificationStatus(record) : null
        const contactValue = String(record.contactValue ?? '').trim()
        const contactLabel = record.contactType === 'member' ? '会员号' : '手机号'
        const contactHeading = contactLabel
        const normalizedMeta = String(record.meta || '')
          .replace(/\s*·\s*取车[：:]\s*\d{4}-\d{2}-\d{2}/u, '')
          .replace(/^\s*(手机号|会员号)[：:][^·]*(?:\s*·\s*)?/u, '')
          .trim()
        const displayMeta = normalizedMeta === record.repairType ? '' : normalizedMeta
        const rowDark = dark || resolved
        const actionButtons = (
          <>
            {record.scene === 'resale' && record.resaleStage === 'pending' ? <button type="button" className="record-primary-action" onClick={() => onResaleListing(record)} disabled={Boolean(closedAt)}>维修完毕</button> : null}
            {record.scene === 'resale' && record.resaleStage === 'listed' ? <button type="button" className="record-primary-action" onClick={() => onResaleSold(record)} disabled={Boolean(closedAt)}>已售出</button> : null}
            {record.scene === 'repair' && !record.completedOn ? <button type="button" className="record-primary-action" onClick={() => onRepairComplete(record)} disabled={Boolean(closedAt)}>维修完毕</button> : null}
            {record.scene === 'poster' && !record.completedOn ? <button type="button" className="record-primary-action" onClick={() => onHandoverComplete(record)} disabled={Boolean(closedAt)}>完成</button> : null}
            {record.scene === 'pickup' && !record.pickedUpOn ? <button type="button" className="record-primary-action" onClick={() => onPickup(record)} disabled={Boolean(closedAt)}>确认取车</button> : null}
            {!resolved ? <button type="button" onClick={() => onEdit(record)} disabled={Boolean(closedAt)} aria-label={`编辑：${record.title}`}><IconEdit width={17} height={17} aria-hidden="true" />编辑</button> : null}
            {!resolved ? <button type="button" className="record-delete" onClick={() => onRemove(record)} disabled={Boolean(closedAt)} aria-label={`删除：${record.title}`}><IconTrash width={17} height={17} aria-hidden="true" />删除</button> : null}
          </>
        )
        return (
          <article className="record-row" key={record.id} data-record-id={record.id} data-service-ticket={serviceTicket ? 'true' : undefined} data-row-dark={rowDark ? 'true' : undefined} data-resolved={resolved ? 'true' : undefined} data-error={pickupError ? 'true' : undefined} data-motion="row">
            <div className="record-row-head">
              <button type="button" className="record-history-mark" onClick={() => onHistory(record)} aria-label={`查看“${record.title}”的操作记录`}><IconJournal width={18} height={18} aria-hidden="true" /></button>
              <div className="record-title-line">
                <strong>{record.title}</strong>
                {!serviceTicket ? <span>{record.status}</span> : null}
              </div>
              <div className="record-state-line">
                {pickupRecord && !pickedUp ? (
                  <ProjectSelect
                    value={pickupNotificationStatus}
                    options={PICKUP_NOTIFICATION_STATUSES}
                    onChange={(value) => onPickupNotificationChange(record, value)}
                    disabled={Boolean(closedAt)}
                    ariaLabel={`${record.title}的通知状态`}
                    compact
                  />
                ) : null}
                <div className="record-state">{pickedUp ? 'PICKED UP · 已取车' : completedToday ? 'COMPLETED · 已完成' : record.scene === 'resale' && record.resaleStage === 'pending' ? 'PENDING · 待上架' : 'ACTIVE · 在册'}</div>
              </div>
            </div>
            <div className="record-copy">
              {record.detail ? <p>{record.detail}</p> : null}
              {displayMeta ? <small>{displayMeta}</small> : null}
              {pickupError ? <p className="record-inline-error" role="alert">{pickupError}</p> : null}
              {pickedUp ? <blockquote><span>PICKED UP · 今日已取车</span>本条今天保留，进入下一日期后自动移除。</blockquote> : null}
              {completedToday ? <blockquote><span>COMPLETED · 今日已完成</span>本条今天保留，进入下一日期后自动清除。</blockquote> : null}
            </div>
            {serviceTicket ? (
              <>
                <div className="record-bottom-row">
                  <div className="record-bottom-facts">
                    <div className="record-fact-pair">
                      {contactValue ? <div className="contact-callout"><span>{contactHeading}</span><strong>{contactValue}</strong></div> : <span aria-hidden="true" />}
                      {record.pickupDate ? <time className="pickup-date-callout" dateTime={record.pickupDate}><span>取车时间</span><strong>{record.pickupDate.replaceAll('-', ' / ')}</strong></time> : null}
                    </div>
                    <div className="record-identity">
                      {pickupRecord ? <small className="pickup-source-label">SOURCE · {pickupSourceLabel(record)}{selfPickupPlatformLabel(record) ? ` · ${selfPickupPlatformLabel(record)}` : ''}</small> : null}
                      {repairRecord && record.repairType ? <small className="pickup-source-label">TYPE · {record.repairType}</small> : null}
                      {repairPickup || repairRecord ? <small className="pickup-service-status">CURRENT · {record.status}</small> : null}
                    </div>
                  </div>
                  <div className="record-actions">{actionButtons}</div>
                </div>
              </>
            ) : (
              <>
                {contactValue || record.pickupDate ? (
                  <div className="record-facts">
                    {contactValue ? <div className="contact-callout"><span>{contactHeading}</span><strong>{contactValue}</strong></div> : <span aria-hidden="true" />}
                    {record.pickupDate ? <time className="pickup-date-callout" dateTime={record.pickupDate}><span>取车时间</span><strong>{record.pickupDate.replaceAll('-', ' / ')}</strong></time> : null}
                  </div>
                ) : null}
                <div className="record-actions">{actionButtons}</div>
              </>
            )}
          </article>
        )
      }) : <p className="empty-inline">当前没有记录。{showAdd ? `可以使用“${config.addLabel}”开始录入。` : ''}</p>}
    </div>
  )
}
