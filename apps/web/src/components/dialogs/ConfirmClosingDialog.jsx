import { useEffect, useMemo, useState } from 'react'
import IconCheck from '@iconoir/Check.mjs'
import IconCheckCircle from '@iconoir/CheckCircle.mjs'
import IconWarning from '@iconoir/WarningTriangle.mjs'
import AppDialog from './AppDialog.jsx'
import {
  buildClosingChecklist,
  closingGateState,
  formatChangeTally,
  isModuleConfirmed,
  toggleModuleConfirmation
} from '../../data/closingChecklist.js'

const VISIBLE_CHANGES = 3
const VISIBLE_WAITING = 4

export default function ConfirmClosingDialog({ open, onClose, onConfirm, events = [], records = [], dateKey = '' }) {
  const [submitting, setSubmitting] = useState(false)
  const [confirmed, setConfirmed] = useState({})

  // Each closing is its own review. Reopening the dialog must never inherit a previous
  // session's acknowledgements, otherwise the gate stops meaning "checked just now".
  useEffect(() => {
    if (open) setConfirmed({})
  }, [open, dateKey])

  const checklist = useMemo(() => buildClosingChecklist({ events, records, dateKey }), [events, records, dateKey])
  const { modules, selfPickup } = checklist
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
      title="确认完成闭店"
      eyebrow="FINAL CHECK · 最终确认"
      description="销售数据已填写。请逐个核对待取、其它交接和维修三个台账，三项都确认后才能完成闭店。"
    >
      <section className="closing-check-focus" data-tone={selfPickup.tone} aria-labelledby="closing-check-focus-title">
        {selfPickup.tone === 'warn'
          ? <IconWarning width={22} height={22} aria-hidden="true" />
          : <IconCheckCircle width={22} height={22} aria-hidden="true" />}
        <div>
          <span>SELF PICKUP · 今日自提车辆</span>
          <strong id="closing-check-focus-title">{selfPickup.headline}</strong>
          <p>{selfPickup.detail}</p>
          <p className="closing-check-focus-metrics">
            今天已确认取车 {selfPickup.pickedUpTodayCount} 台 · 等待取车 {selfPickup.waitingCount} 台 · 自提在册 {selfPickup.total} 台
          </p>
          {selfPickup.waiting.length ? (
            <ul className="closing-check-focus-list">
              {selfPickup.waiting.slice(0, VISIBLE_WAITING).map((item) => (
                <li key={item.id}>
                  <strong>{item.title}</strong>
                  <small>{[item.platform, item.notified ? '已通知' : '未通知'].filter(Boolean).join(' · ')}</small>
                </li>
              ))}
              {selfPickup.waiting.length > VISIBLE_WAITING
                ? <li className="closing-check-more">另有 {selfPickup.waiting.length - VISIBLE_WAITING} 台，请到待取台账逐台核对</li>
                : null}
            </ul>
          ) : null}
        </div>
      </section>

      <ol className="closing-check-list">
        {modules.map((module) => {
          const isConfirmed = isModuleConfirmed(module, confirmed)
          return (
            <li key={module.id} className="closing-check-row" data-confirmed={isConfirmed ? 'true' : 'false'} data-changed={module.changed ? 'true' : 'false'}>
              <div className="closing-check-head">
                <span className="closing-check-no" aria-hidden="true">{module.no}</span>
                <span className="closing-check-title">
                  <strong>{module.title}</strong>
                  <small>{module.code} · {module.changed ? `今天有 ${module.count} 项变动` : '与昨日相同，没有变动'}</small>
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
                <p className="closing-check-carry">没有变动的记录会原样延续到明天。请确认这就是今天的真实情况。</p>
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
