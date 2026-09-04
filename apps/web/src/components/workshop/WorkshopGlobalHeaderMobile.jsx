import IconBell from '@iconoir/Bell.mjs'
import IconMenu from '@iconoir/Menu.mjs'
import { APP_VERSION } from '../../data/releaseNotes.js'

export default function WorkshopGlobalHeaderMobile({ userName, onMenu, onLog, hasUnread, pendingBadge, badgeRef, unreadRef }) {
  return (
    <div className="workshop-global-header workshop-global-header-mobile">
      <button type="button" className="workshop-header-action workshop-header-menu" onClick={onMenu} aria-label="打开日报菜单"><IconMenu width={28} height={28} aria-hidden="true" />{pendingBadge > 0 ? <span ref={badgeRef} className="workshop-pending-badge" aria-label={`${pendingBadge} 项待审批`}>{pendingBadge > 99 ? '99+' : pendingBadge}</span> : null}</button>
      <div className="workshop-header-brand"><span>WORKSHOP LEDGER</span><strong>WORKSHOP OPS</strong><small>V{APP_VERSION}</small></div>
      <span className="workshop-mobile-user" aria-label="当前登录用户名">{userName || '—'}</span>
      <button type="button" className="workshop-header-action workshop-header-mobile-log" onClick={onLog} aria-label="查看当日日志"><IconBell width={21} height={21} aria-hidden="true" />{hasUnread ? <i ref={unreadRef} aria-hidden="true" /> : null}</button>
    </div>
  )
}
