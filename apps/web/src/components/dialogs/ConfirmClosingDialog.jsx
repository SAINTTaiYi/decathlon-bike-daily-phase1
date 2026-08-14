import { useEffect, useMemo, useState } from 'react'
import IconCheck from '@iconoir/Check.mjs'
import IconWarning from '@iconoir/WarningTriangle.mjs'
import IconCheckCircle from '@iconoir/CheckCircle.mjs'
import IconBicycle from '@iconoir/Bicycle.mjs'
import IconUser from '@iconoir/User.mjs'
import IconTools from '@iconoir/Tools.mjs'
import '../../styles/closing-dialog.css'
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
    poster: IconUser,
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
      {/* 黄色警告大卡片 */}
      <section className="closing-warning-card" data-tone={inStore.tone}>
        <div className="closing-warning-icon">
          <IconWarning width={32} height={32} strokeWidth={2.5} aria-hidden="true" />
        </div>
        
        <div className="closing-warning-content">
          <span className="closing-warning-eyebrow">IN STORE · 台账上还在店里的车</span>
          <h3 className="closing-warning-headline">{inStore.headline}</h3>
          <p className="closing-warning-detail">{inStore.detail}</p>
          
          <p className="closing-warning-metrics">
            今天已确认取车 <strong>{inStore.pickedUpTodayCount}</strong> 台 · 仍在店里 <strong>{inStore.waitingCount}</strong> 台
            {inStore.awaitingNotice ? ` · 未通知顾客 ${inStore.awaitingNotice} 台` : ''}
            {inStore.staleCount ? ` · 挂账偏久 ${inStore.staleCount} 台` : ''}
          </p>
          
          {inStore.reconcileLabel ? (
            <p className="closing-warning-reconcile">{inStore.reconcileLabel}</p>
          ) : null}
          
          {/* 自提订单车辆列表 */}
          {inStore.groups.map((group) => (
            <div key={group.source} className="closing-vehicle-group">
              <h4 className="closing-vehicle-group-title">
                {group.label} <span className="closing-vehicle-group-count">{group.count} 台{group.awaitingNotice ? ` · ${group.awaitingNotice} 台未通知` : ''}</span>
              </h4>
              <ul className="closing-vehicle-list">
                {group.items.slice(0, VISIBLE_PER_GROUP).map((item) => (
                  <li key={item.id} className="closing-vehicle-item">
                    <span className="closing-vehicle-emoji">{getSourceEmoji(group.source)}</span>
                    <div className="closing-vehicle-info">
                      <strong className="closing-vehicle-title">{item.title}</strong>
                      <span className="closing-vehicle-meta">
                        {[item.platform, item.ageLabel, item.notified === null ? '' : item.notified ? '已通知' : '未通知']
                          .filter(Boolean)
                          .join(' · ')}
                      </span>
                    </div>
                  </li>
                ))}
                {group.items.length > VISIBLE_PER_GROUP ? (
                  <li className="closing-vehicle-more">另有 {group.items.length - VISIBLE_PER_GROUP} 台，请到待取台账逐台核对</li>
                ) : null}
              </ul>
            </div>
          ))}
        </div>

        {/* 插图占位（右侧） */}
        <div className="closing-warning-illustration" aria-hidden="true">
          <svg width="140" height="140" viewBox="0 0 140 140" fill="none">
            <rect x="30" y="20" width="80" height="95" rx="6" fill="#FFF9E6" stroke="#F5C842" strokeWidth="2.5"/>
            <circle cx="45" cy="40" r="5" fill="#F5C842"/>
            <rect x="54" y="36" width="45" height="8" rx="4" fill="#F5C842" opacity="0.35"/>
            <circle cx="45" cy="60" r="5" fill="#F5C842"/>
            <rect x="54" y="56" width="45" height="8" rx="4" fill="#F5C842" opacity="0.35"/>
            <circle cx="45" cy="80" r="5" fill="#F5C842"/>
            <rect x="54" y="76" width="45" height="8" rx="4" fill="#F5C842" opacity="0.35"/>
            <rect x="65" y="100" width="38" height="22" rx="4" fill="#F5C842"/>
            <circle cx="70" cy="130" r="6" fill="#2D2D2D"/>
            <circle cx="98" cy="130" r="6" fill="#2D2D2D"/>
            <rect x="68" y="105" width="32" height="16" rx="3" fill="#FFF"/>
          </svg>
        </div>
      </section>

      {/* 顾客暂存提示（如果适用） */}
      {usedCar.applicable ? (
        <p className="closing-usedcar-notice" data-tone={usedCar.tone}>{usedCar.message}</p>
      ) : null}

      {/* 三个模块确认卡片 */}
      <div className="closing-modules-grid">
        {modules.map((module) => {
          const isConfirmed = isModuleConfirmed(module, confirmed)
          const ModuleIcon = moduleIcons[module.id] || IconBicycle
          
          return (
            <article key={module.id} className="closing-module-card" data-confirmed={isConfirmed ? 'true' : 'false'}>
              <div className="closing-module-header">
                <span className="closing-module-number">{module.no}</span>
                <div className="closing-module-icon-box">
                  <ModuleIcon width={22} height={22} strokeWidth={2} aria-hidden="true" />
                </div>
                <div className="closing-module-title-group">
                  <h3 className="closing-module-title">{module.title}</h3>
                  <p className="closing-module-meta">
                    {module.code} · {module.changed ? `今天有 ${module.count} 项变动` : '今天没有变动'}
                    {module.backlog.openCount ? ` · 未完成 ${module.backlog.openCount} 项` : ''}
                  </p>
                </div>
              </div>

              {module.changed ? (
                <div className="closing-module-body">
                  <p className="closing-module-tally">{formatChangeTally(module.tally)}</p>
                  <ul className="closing-module-changes">
                    {module.entries.slice(0, VISIBLE_CHANGES).map((entry) => (
                      <li key={entry.id} className="closing-module-change-item">
                        <span className="closing-module-change-action">{entry.actionLabel}</span>
                        <span className="closing-module-change-label">{entry.label}</span>
                      </li>
                    ))}
                    {module.entries.length > VISIBLE_CHANGES ? (
                      <li className="closing-module-change-more">另有 {module.entries.length - VISIBLE_CHANGES} 项变动，可在当日日志查看</li>
                    ) : null}
                  </ul>
                </div>
              ) : (
                <div className="closing-module-body">
                  <p className="closing-module-carry">{module.carryMessage}</p>
                </div>
              )}

              <button
                type="button"
                className="closing-module-confirm-btn"
                onClick={() => toggle(module)}
                aria-pressed={isConfirmed}
                disabled={submitting}
              >
                {isConfirmed ? <><IconCheck width={16} height={16} aria-hidden="true" />已确认</> : '确认'}
              </button>
            </article>
          )
        })}
      </div>

      {/* 底部状态提示 */}
      <p className="closing-gate-message" data-ready={gateOpen ? 'true' : 'false'}>
        {gateMessage}
      </p>

      {/* 底部按钮 */}
      <div className="closing-dialog-footer">
        <button 
          type="button" 
          className="closing-btn-back" 
          onClick={onClose} 
          disabled={submitting}
        >
          返回检查
        </button>
        <button
          type="button"
          className="closing-btn-confirm"
          onClick={confirm}
          disabled={submitting || !gateOpen}
          aria-busy={submitting || undefined}
        >
          {submitting ? '确认中…' : '确认闭店'}
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
