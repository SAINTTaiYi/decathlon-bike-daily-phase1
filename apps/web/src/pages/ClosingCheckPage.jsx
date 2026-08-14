import { useEffect, useMemo, useState } from 'react'
import IconCheck from '@iconoir/Check.mjs'
import IconCheckCircle from '@iconoir/CheckCircle.mjs'
import IconWarning from '@iconoir/WarningTriangle.mjs'
import IconClose from '@iconoir/Xmark.mjs'
import IconUser from '@iconoir/User.mjs'
import IconShoppingCart from '@iconoir/ShoppingCart.mjs'
import IconWarningCircle from '@iconoir/WarningCircle.mjs'
import IconTools from '@iconoir/Tools.mjs'
import {
  buildClosingChecklist,
  closingGateState,
  formatChangeTally,
  isModuleConfirmed,
  toggleModuleConfirmation
} from '../data/closingChecklist.js'

const VISIBLE_CHANGES = 3
const VISIBLE_PER_GROUP = 6

export default function ClosingCheckPage({ onClose, onConfirm, events = [], records = [], dateKey = '', kpi = {}, submitting: externalSubmitting = false }) {
  const [submitting, setSubmitting] = useState(false)
  const [confirmed, setConfirmed] = useState({})

  useEffect(() => {
    setConfirmed({})
  }, [dateKey])

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

  const isSubmitting = submitting || externalSubmitting

  const getModuleIcon = (moduleId) => {
    switch (moduleId) {
      case 'pickup': return IconShoppingCart
      case 'poster': return IconUser
      case 'repair': return IconTools
      default: return IconWarningCircle
    }
  }

  return (
    <div className="closing-check-page">
      <div className="closing-check-page-scroll">
        <header className="closing-check-page-header">
          <div>
            <span className="closing-check-page-eyebrow">FINAL CHECK · 最终确认</span>
            <h1 className="closing-check-page-title">确认完成闭店</h1>
          </div>
          <button
            type="button"
            className="closing-check-page-close"
            onClick={onClose}
            aria-label="关闭"
          >
            <IconClose width={24} height={24} aria-hidden="true" />
          </button>
        </header>

        <p className="closing-check-page-description">
          销售数据已填写。请逐个核对待取、其它交接和维修三个台账,三项都确认后才能完成闭店。
        </p>

        <section className="closing-check-focus" data-tone={inStore.tone} aria-labelledby="closing-check-focus-title">
          {inStore.tone === 'warn'
            ? <IconWarning width={22} height={22} aria-hidden="true" />
            : <IconCheckCircle width={22} height={22} aria-hidden="true" />}
          <div>
            <span>IN STORE · 台账上还在店里的车</span>
            <strong id="closing-check-focus-title">{inStore.headline}</strong>
            <p>{inStore.detail}</p>
            <p className="closing-check-focus-metrics">
              今天已确认取车 {inStore.pickedUpTodayCount} 台 · 仍在店里 {inStore.waitingCount} 台
              {inStore.awaitingNotice ? ` · 未通知顾客 ${inStore.awaitingNotice} 台` : ''}
              {inStore.staleCount ? ` · 挂账偏久 ${inStore.staleCount} 台` : ''}
            </p>
            {inStore.reconcileLabel
              ? <p className="closing-check-reconcile" role="status">{inStore.reconcileLabel}</p>
              : null}
            {inStore.groups.map((group) => (
              <section key={group.source} className="closing-check-group" data-source={group.source}>
                <h4>
                  {group.label}
                  <small>{group.count} 台{group.awaitingNotice ? ` · ${group.awaitingNotice} 台未通知` : ''}</small>
                </h4>
                <ul className="closing-check-focus-list">
                  {group.items.slice(0, VISIBLE_PER_GROUP).map((item) => (
                    <li key={item.id} data-stale={item.stale ? 'true' : 'false'}>
                      <strong>{item.title}</strong>
                      <small>
                        {[item.platform, item.ageLabel, item.notified === null ? '' : item.notified ? '已通知' : '未通知']
                          .filter(Boolean)
                          .join(' · ')}
                      </small>
                    </li>
                  ))}
                  {group.items.length > VISIBLE_PER_GROUP
                    ? <li className="closing-check-more">另有 {group.items.length - VISIBLE_PER_GROUP} 台,请到待取台账逐台核对</li>
                    : null}
                </ul>
              </section>
            ))}
          </div>
        </section>

        {usedCar.applicable ? (
          <p className="closing-check-crosscheck" data-tone={usedCar.tone} role="status">{usedCar.message}</p>
        ) : null}

        <ol className="closing-check-list">
          {modules.map((module) => {
            const isConfirmed = isModuleConfirmed(module, confirmed)
            const ModuleIcon = getModuleIcon(module.id)
            return (
              <li key={module.id} className="closing-check-row" data-confirmed={isConfirmed ? 'true' : 'false'} data-changed={module.changed ? 'true' : 'false'}>
                <div className="closing-check-head">
                  <span className="closing-check-no" aria-hidden="true">
                    <ModuleIcon width={22} height={22} />
                  </span>
                  <span className="closing-check-title">
                    <strong>{module.title}</strong>
                    <small>
                      {module.code} · {module.changed ? `今天有 ${module.count} 项变动` : '今天没有变动'}
                      {module.backlog.openCount ? ` · 未完成 ${module.backlog.openCount} 项` : ''}
                    </small>
                  </span>
                  <button
                    type="button"
                    className="closing-check-action"
                    onClick={() => toggle(module)}
                    aria-pressed={isConfirmed}
                    aria-label={`确认已核对${module.title}`}
                    disabled={isSubmitting}
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
                        ? <li className="closing-check-more">另有 {module.entries.length - VISIBLE_CHANGES} 项变动,可在当日日志查看</li>
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
      </div>

      <div className="closing-check-page-footer">
        <button type="button" className="closing-check-page-secondary" onClick={onClose} disabled={isSubmitting}>返回检查</button>
        <button
          type="button"
          className="closing-check-page-primary"
          onClick={confirm}
          disabled={isSubmitting || !gateOpen}
          data-processing={isSubmitting ? 'true' : undefined}
          aria-busy={isSubmitting || undefined}
        >
          {isSubmitting ? <><IconCheck width={15} height={15} aria-hidden="true" />确认中…</> : '确认闭店'}
        </button>
      </div>
    </div>
  )
}
