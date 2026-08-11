import IconBell from '@iconoir/Bell.mjs'
import IconMenu from '@iconoir/Menu.mjs'
import IconNavArrowDown from '@iconoir/NavArrowDown.mjs'
import IconSearch from '@iconoir/Search.mjs'
import IconUser from '@iconoir/User.mjs'
import { APP_VERSION } from '../../data/releaseNotes.js'
import { sceneById } from '../../data/lookbookScenes.js'

function formatDate(dateKey) {
  if (!dateKey) return 'DATE —'
  const date = new Date(`${dateKey}T12:00:00`)
  if (Number.isNaN(date.getTime())) return dateKey
  return new Intl.DateTimeFormat('zh-CN', { month: '2-digit', day: '2-digit', weekday: 'short' }).format(date)
}

export default function WorkshopShellHeader({ activeScene, dateKey, storeName, roleLabel, userName, onMenu, onLog, onSearch, hasUnread, pendingBadge = 0 }) {
  const scene = sceneById(activeScene)
  const Icon = scene.NavIcon
  return (
    <header className="workshop-shell-header" data-active-module={scene.id}>
      <div className="workshop-global-header">
        <button type="button" className="workshop-header-action workshop-header-menu" onClick={onMenu} aria-label="打开日报菜单"><IconMenu width={28} height={28} aria-hidden="true" />{pendingBadge > 0 ? <span className="workshop-pending-badge" aria-label={`${pendingBadge} 项待审批`}>{pendingBadge > 99 ? '99+' : pendingBadge}</span> : null}</button>
        <div className="workshop-header-brand"><span>WORKSHOP LEDGER</span><strong>WORKSHOP OPS</strong><small>V{APP_VERSION}</small></div>
        <div className="workshop-header-desktop-tools">
          <button type="button" className="workshop-header-action" onClick={onSearch} aria-label="搜索待办记录"><IconSearch width={25} height={25} aria-hidden="true" /></button>
          <button type="button" className="workshop-header-action" onClick={onLog} aria-label="查看当日日志"><IconBell width={25} height={25} aria-hidden="true" />{hasUnread ? <i aria-hidden="true" /> : null}</button>
          <button type="button" className="workshop-user-context" onClick={onMenu} aria-label="打开当前用户菜单">
            <span className="workshop-user-avatar"><IconUser width={23} height={23} aria-hidden="true" /></span>
            <span><strong>{userName || storeName || 'Workshop Admin'}</strong><small>{roleLabel || '成员'}</small></span>
            <IconNavArrowDown width={16} height={16} aria-hidden="true" />
          </button>
        </div>
        <div className="workshop-header-context"><time dateTime={dateKey || undefined}>{formatDate(dateKey)}</time><span>{storeName || '门店'} · {roleLabel || '成员'}</span><strong>{userName || '—'}</strong></div>
        <button type="button" className="workshop-header-action workshop-header-mobile-log" onClick={onLog} aria-label="查看当日日志"><IconBell width={21} height={21} aria-hidden="true" />{hasUnread ? <i aria-hidden="true" /> : null}</button>
      </div>
      <div className="workshop-module-header" aria-live="polite">
        <Icon width={26} height={26} strokeWidth={1.7} aria-hidden="true" />
        <span>{scene.no} / 06</span>
        <strong>{scene.cn}</strong>
        <small>{scene.title}</small>
      </div>
    </header>
  )
}
