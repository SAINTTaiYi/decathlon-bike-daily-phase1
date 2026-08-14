import { useEffect, useMemo, useState } from 'react'
import IconCheck from '@iconoir/Check.mjs'
import IconWarning from '@iconoir/WarningTriangle.mjs'
import IconCheckCircle from '@iconoir/CheckCircle.mjs'
import IconBicycle from '@iconoir/Bicycle.mjs'
import IconUserCard from '@iconoir/UserCard.mjs'
import IconTools from '@iconoir/Tools.mjs'
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

export default function ConfirmClosingDialog({ open, onClose, onConfirm, events = [], records = [], dateKey = '', kpi = {} }) {
  const [submitting, setSubmitting] = useState(false)
  const [confirmed, setConfirmed] = useState({})

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

  const moduleIcons = {
    pickup: IconBicycle,
    poster: IconUserCard,
    repair: IconTools
  }

  return (
    <AppDialog
      open={open}
      onClose={onClose}
      title="确认完成闭店"
      eyebrow="FINAL CHECK · 最终确认"
      description="销售数据已填写。请逐个核对待取，其它交接和维修三个台账，三项都确认后才能完成闭店。"
    >
      <section className="closing-focus-card" data-tone={inStore.tone}>
        <div className="closing-focus-icon">
          {inStore.tone === 'warn'
            ? <IconWarning width={28} height={28} aria-hidden="true" />
            : <IconCheckCircle width={28} height={28} aria-hidden="true" />}
        </div>
        <div className="closing-focus-content">
          <span className="closing-focus-eyebrow">IN STORE · 台账上还在店里的车</span>
          <h3 className="closing-focus-headline">{inStore.headline}</h3>
          <p className="closing-focus-detail">{inStore.detail}</p>
          <p className="closing-focus-metrics">
            今天已确认取车 <b>{inStore.pickedUpTodayCount}</b> 台 · 仍在店里 <b>{inStore.waitingCount}</b> 台
            {inStore.awaitingNotice ? ` · 未通知顾客 ${inStore.awaitingNotice} 台` : ''}
            {inStore.staleCount ? ` · 挂账偏久 ${inStore.staleCount} 台` : ''}
          </p>
          {inStore.reconcileLabel ? (
            <p className="closing-check-reconcile">{inStore.reconcileLabel}</p>
          ) : null}
          
          {inStore.groups.map((group) => (
            <div key={group.source} className="closing-vehicle-group">
              <h4 className="closing-group-title">
                {group.label} <span>{group.count} 台{group.awaitingNotice ? ` · ${group.awaitingNotice} 台未通知` : ''}</span>
              </h4>
              <ul className="closing-vehicle-list">
                {group.items.slice(0, VISIBLE_PER_GROUP).map((item) => (
                  <li key={item.id} className="closing-vehicle-item" data-stale={item.stale ? 'true' : 'false'}>
                    <span className="closing-vehicle-icon">{getSourceEmoji(group.source)}</span>
                    <div className="closing-vehicle-info">
                      <strong>{item.title}</strong>
                      <small>
                        {[item.platform, item.ageLabel, item.notified === null ? '' : item.notified ? '已通知' : '未通知']
                          .filter(Boolean)
                          .join(' · ')}
                      </small>
                    </div>
                  </li>
                ))}
                {group.items.length > VISIBLE_PER_GROUP ? (
                  <li className="closing-check-more">另有 {group.items.length - VISIBLE_PER_GROUP} 台，请到待取台账逐台核对</li>
                ) : null}
              </ul>
            </div>
          ))}
        </div>
        <div className="closing-focus-illustration" aria-hidden="true">
          <svg width="120" height="120" viewBox="0 0 120 120" fill="none">
            <rect x="20" y="15" width="70" height="85" rx="4" fill="#FFF9E6" stroke="#F5C842" strokeWidth="2"/>
            <circle cx="35" cy="35" r="4" fill="#F5C842"/>
            <rect x="42" y="32" width="40" height="6" rx="3" fill="#F5C842" opacity="0.3"/>
            <circle cx="35" cy="50" r="4" fill="#F5C842"/>
            <rect x="42" y="47" width="40" height="6" rx="3" fill="#F5C842" opacity="0.3"/>
            <circle cx="35" cy="65" r="4" fill="#F5C842"/>
            <rect x="42" y="62" width="40" height="6" rx="3" fill="#F5C842" opacity="0.3"/>
            <rect x="55" y="85" width="35" height="20" rx="3" fill="#F5C842"/>
            <circle cx="60" cy="110" r="5" fill="#2D2D2D"/>
            <circle cx="85" cy="110" r="5" fill="#2D2D2D"/>
            <rect x="58" y="90" width="30" height="15" rx="2" fill="#FFF"/>
          </svg>
        </div>
      </section>

      {usedCar.applicable ? (
        <p className="closing-check-crosscheck" data-tone={usedCar.tone}>{usedCar.message}</p>
      ) : null}

      <ol className="closing-module-list">
        {modules.map((module) => {
          const isConfirmed = isModuleConfirmed(module, confirmed)
          const ModuleIcon = moduleIcons[module.id] || IconBicycle
          return (
            <li key={module.id} className="closing-module-row" data-confirmed={isConfirmed ? 'true' : 'false'} data-changed={module.changed ? 'true' : 'false'}>
              <span className="closing-module-number">{module.no}</span>
              <span className="closing-module-icon">
                <ModuleIcon width={20} height={20} aria-hidden="true" />
              </span>
              <div className="closing-module-info">
                <strong>{module.title}</strong>
                <small>
                  {module.code} · {module.changed ? `今天有 ${module.count} 项变动` : '今天没有变动'}
                  {module.backlog.openCount ? ` · 未完成 ${module.backlog.openCount} 项` : ''}
                </small>
                {module.changed ? (
                  <>
                    <p className="closing-module-tally">{formatChangeTally(module.tally)}</p>
                    <ul className="closing-module-changes">
                      {module.entries.slice(0, VISIBLE_CHANGES).map((entry) => (
                        <li key={entry.id}><span>{entry.actionLabel}</span><small>{entry.label}</small></li>
                      ))}
                      {module.entries.length > VISIBLE_CHANGES ? (
                        <li className="closing-check-more">另有 {module.entries.length - VISIBLE_CHANGES} 项变动，可在当日日志查看</li>
                      ) : null}
                    </ul>
                  </>
                ) : (
                  <p className="closing-check-carry" data-stale={module.backlog.staleCount ? 'true' : 'false'}>{module.carryMessage}</p>
                )}
              </div>
              <button
                type="button"
                className="closing-module-confirm"
                onClick={() => toggle(module)}
                aria-pressed={isConfirmed}
                disabled={submitting}
                data-processing={submitting ? 'true' : undefined}
              >
                {isConfirmed ? <><IconCheck width={15} height={15} aria-hidden="true" />已确认</> : '确认'}
              </button>
            </li>
          )
        })}
      </ol>

      <p className="closing-gate-status" data-ready={gateOpen ? 'true' : 'false'}>{gateMessage}</p>

      <div className="dialog-footer">
        <button type="button" className="closing-btn-secondary" onClick={onClose} disabled={submitting}>
          返回检查
        </button>
        <button
          type="button"
          className="closing-btn-primary"
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

function getSourceEmoji(source) {
  const map = {
    'self-pickup': '🚲',
    'used-car': '🚗',
    'customer-storage': '📦',
    'repair': '🔧'
  }
  return map[source] || '📋'
}
