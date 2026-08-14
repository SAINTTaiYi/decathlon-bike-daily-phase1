import { useEffect, useMemo, useState } from 'react'
import IconArchive from '@iconoir/Archive.mjs'
import IconBicycle from '@iconoir/Bicycle.mjs'
import IconBox from '@iconoir/Box.mjs'
import IconCheck from '@iconoir/Check.mjs'
import IconCheckCircle from '@iconoir/CheckCircle.mjs'
import IconUser from '@iconoir/User.mjs'
import IconWarning from '@iconoir/WarningTriangle.mjs'
import IconWrench from '@iconoir/Wrench.mjs'
import AppDialog from './AppDialog.jsx'
import {
  buildClosingChecklist,
  closingGateState,
  formatChangeTally,
  isModuleConfirmed,
  toggleModuleConfirmation
} from '../../data/closingChecklist.js'

const VISIBLE_CHANGES = 3
const VISIBLE_PER_GROUP = 6

const MODULE_ICONS = {
  pickup: IconBicycle,
  poster: IconUser,
  repair: IconWrench
}

const SOURCE_ICONS = {
  'self-pickup': IconBox,
  'used-car': IconBicycle,
  'customer-storage': IconUser,
  repair: IconWrench
}

export default function ConfirmClosingDialog({ open, onClose, onConfirm, events = [], records = [], dateKey = '', kpi = {} }) {
  const [submitting, setSubmitting] = useState(false)
  const [confirmed, setConfirmed] = useState({})

  // Each closing is its own review. Reopening the dialog must never inherit a previous
  // session's acknowledgements, otherwise the gate stops meaning "checked just now".
  useEffect(() => {
    if (open) setConfirmed({})
  }, [open, dateKey])

  const checklist = useMemo(() => buildClosingChecklist({ events, records, dateKey, kpi }), [events, records, dateKey, kpi])
  const { modules, inStore, usedCar } = checklist
  const { pending, gateOpen, message: gateMessage } = closingGateState(modules, confirmed)

  const toggle = (module) => setConfirmed((current) => toggleModuleConfirmation(module, current))

  const confirm = async () => {
    if (!gateOpen) return
    setSubmitting(true)
    await onConfirm()
    setSubmitting(false)
  }

  return (
    <AppDialog
      open={open}
      onClose={onClose}
      className="confirm-closing-dialog"
      title="确认完成闭店"
      eyebrow="FINAL CHECK · 最终确认"
      description="销售数据已填写。请逐个核对待取、其它交接和维修三个台账，三项都确认后才能完成闭店。"
    >
      <section className="closing-check-focus" data-tone={inStore.tone} aria-labelledby="closing-check-focus-title">
        <div className="closing-check-focus-main">
          <div className="closing-check-focus-heading">
            <span className="closing-check-focus-sign" aria-hidden="true">
              {inStore.tone === 'warn'
                ? <IconWarning width={27} height={27} aria-hidden="true" />
                : <IconCheckCircle width={27} height={27} aria-hidden="true" />}
            </span>
            <div className="closing-check-focus-text">
              <span>IN STORE · 台账上还在店里的车</span>
              <strong id="closing-check-focus-title">{inStore.headline}</strong>
            </div>
          </div>
          <p className="closing-check-focus-detail">{inStore.detail}</p>
          <p className="closing-check-focus-metrics">
            今天已确认取车 {inStore.pickedUpTodayCount} 台 · 仍在店里 {inStore.waitingCount} 台
            {inStore.awaitingNotice ? ' · 未通知顾客 ' + inStore.awaitingNotice + ' 台' : ''}
            {inStore.staleCount ? ' · 挂账偏久 ' + inStore.staleCount + ' 台' : ''}
          </p>
          {inStore.reconcileLabel
            ? <p className="closing-check-reconcile" role="status">{inStore.reconcileLabel}</p>
            : null}
          <div className="closing-check-groups">
            {inStore.groups.map((group) => {
              const GroupIcon = SOURCE_ICONS[group.source] || IconArchive
              return (
                <section key={group.source} className="closing-check-group" data-source={group.source}>
                  <h4>
                    {group.label}
                    <small>{group.count} 台{group.awaitingNotice ? ' · ' + group.awaitingNotice + ' 台未通知' : ''}</small>
                  </h4>
                  <ul className="closing-check-focus-list">
                    {group.items.slice(0, VISIBLE_PER_GROUP).map((item) => {
                      const ItemIcon = SOURCE_ICONS[item.source] || GroupIcon
                      return (
                        <li key={item.id} data-stale={item.stale ? 'true' : 'false'}>
                          <span className="closing-check-focus-item-icon" aria-hidden="true"><ItemIcon width={18} height={18} /></span>
                          <strong>{item.title}</strong>
                          <small>
                            {[item.platform, item.ageLabel, item.notified === null ? '' : item.notified ? '已通知' : '未通知']
                              .filter(Boolean)
                              .join(' · ')}
                          </small>
                        </li>
                      )
                    })}
                    {group.items.length > VISIBLE_PER_GROUP
                      ? <li className="closing-check-more">另有 {group.items.length - VISIBLE_PER_GROUP} 台，请到待取台账逐台核对</li>
                      : null}
                  </ul>
                </section>
              )
            })}
          </div>
        </div>
        <div className="closing-rollcall-illustration" aria-hidden="true">
          <div className="closing-rollcall-sun" />
          <div className="closing-rollcall-clipboard">
            <i className="closing-rollcall-clip" />
            <i className="closing-rollcall-check check-one">✓</i><i className="closing-rollcall-line line-one" />
            <i className="closing-rollcall-check check-two">✓</i><i className="closing-rollcall-line line-two" />
            <i className="closing-rollcall-check check-three">✓</i><i className="closing-rollcall-line line-three" />
          </div>
          <div className="closing-rollcall-bike"><i /><b /><em /></div>
          <div className="closing-rollcall-ground" />
        </div>
      </section>

      {usedCar.applicable ? (
        <p className="closing-check-crosscheck" data-tone={usedCar.tone} role="status">{usedCar.message}</p>
      ) : null}

      <ol className="closing-check-list">
        {modules.map((module) => {
          const isConfirmed = isModuleConfirmed(module, confirmed)
          const ModuleIcon = MODULE_ICONS[module.id] || IconArchive
          return (
            <li key={module.id} className="closing-check-row" data-module={module.id} data-confirmed={isConfirmed ? 'true' : 'false'} data-changed={module.changed ? 'true' : 'false'}>
              <div className="closing-check-head">
                <span className="closing-check-no" aria-hidden="true">{module.no}</span>
                <span className="closing-check-module-icon" aria-hidden="true"><ModuleIcon width={25} height={25} /></span>
                <span className="closing-check-title">
                  <strong>{module.title}</strong>
                  <small>
                    {module.code} · {module.changed ? `今天有 ${module.count} 项变动` : '今天没有变动'}
                    {module.backlog.openCount ? ` · 未完成 ${module.backlog.openCount} 项` : ''}
                  </small>
                  {module.changed ? (
                    <span className="closing-check-title-detail">
                      {formatChangeTally(module.tally)} · {module.entries[0]?.label || '已记录变动'}
                    </span>
                  ) : null}
                </span>
                <button
                  type="button"
                  className="closing-check-action"
                  onClick={() => toggle(module)}
                  aria-pressed={isConfirmed}
                  aria-label={`确认已核对${module.title}`}
                  disabled={submitting}
                >
                  {isConfirmed ? <><IconCheck width={15} height={15} aria-hidden="true" />已确认</> : '确认'}
                </button>
              </div>
              {module.changed ? (
                <>
                  <p className="closing-check-tally">{formatChangeTally(module.tally)}</p>
                  <ul className="closing-check-changes">
                    {module.entries.slice(0, VISIBLE_CHANGES).map((entry) => (
                      <li key={entry.id}><span>{entry.actionLabel}</span><small>{entry.label}</small></li>
                    ))}
                    {module.entries.length > VISIBLE_CHANGES
                      ? <li className="closing-check-more">另有 {module.entries.length - VISIBLE_CHANGES} 项变动，可在当日日志查看</li>
                      : null}
                  </ul>
                </>
              ) : (
                <p className="closing-check-carry" data-stale={module.backlog.staleCount ? 'true' : 'false'}>{module.carryMessage}</p>
              )}
            </li>
          )
        })}
      </ol>

      <p className="closing-check-gate" role="status" data-ready={gateOpen ? 'true' : 'false'} data-pending={pending.length}>
        {gateMessage}
      </p>

      <div className="dialog-footer">
        <button type="button" className="secondary-action" onClick={onClose} disabled={submitting}>返回检查</button>
        <button
          type="button"
          className="primary-action"
          onClick={confirm}
          disabled={submitting || !gateOpen}
          data-processing={submitting ? 'true' : undefined}
          aria-busy={submitting || undefined}
        >
          {submitting ? <><IconCheck width={15} height={15} aria-hidden="true" />确认中…</> : '确认闭店'}
        </button>
      </div>
    </AppDialog>
  )
}
