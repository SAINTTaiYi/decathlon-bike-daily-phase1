import { useEffect, useRef } from 'react'
import { gsap } from 'gsap'
import IconBell from '@iconoir/Bell.mjs'

const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches || false
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

export default function WorkshopShellHeader({ activeScene, dateKey, storeName, roleLabel, userName, onMenu, onLog, onSearch, hasUnread, pendingBadge = 0, mobileLayout = false }) {
  const scene = sceneById(activeScene)
  // 日志未读点：出现时脉冲（小圆点 opacity 循环，GPU 便宜）
  const unreadRef = useRef(null)
  const pulseRef = useRef(null)
  useEffect(() => {
    const dot = unreadRef.current
    if (!dot) return undefined
    if (!hasUnread || reducedMotion()) {
      pulseRef.current?.kill()
      pulseRef.current = null
      gsap.set(dot, { clearProps: 'opacity' })
      return undefined
    }
    pulseRef.current?.kill()
    pulseRef.current = gsap.to(dot, { opacity: .25, duration: .72, ease: 'sine.inOut', repeat: -1, yoyo: true })
    return () => { pulseRef.current?.kill(); pulseRef.current = null; gsap.set(dot, { clearProps: 'opacity' }) }
  }, [hasUnread])
  // 待审批徽章：数值出现/变化时 y-pop
  const badgeRef = useRef(null)
  const badgePrevRef = useRef(pendingBadge)
  useEffect(() => {
    if (badgePrevRef.current === pendingBadge) return
    badgePrevRef.current = pendingBadge
    const badge = badgeRef.current
    if (!badge || reducedMotion()) return
    gsap.fromTo(badge, { y: -5, autoAlpha: .4 }, { y: 0, autoAlpha: 1, duration: .4, ease: 'back.out(2)', clearProps: 'transform,opacity,visibility' })
  }, [pendingBadge])
  const Icon = scene.NavIcon
  return (
    <>
    <header className="workshop-shell-header" data-active-module={scene.id}>
      <div className="workshop-global-header">
        <button type="button" className="workshop-header-action workshop-header-menu" onClick={onMenu} aria-label="打开日报菜单"><IconMenu width={28} height={28} aria-hidden="true" />{pendingBadge > 0 ? <span ref={badgeRef} className="workshop-pending-badge" aria-label={`${pendingBadge} 项待审批`}>{pendingBadge > 99 ? '99+' : pendingBadge}</span> : null}</button>
        <div className="workshop-header-brand"><span>WORKSHOP LEDGER</span><strong>WORKSHOP OPS</strong><small>V{APP_VERSION}</small></div>
        <div className="workshop-header-desktop-tools">
          <button type="button" className="workshop-header-action" onClick={onSearch} aria-label="搜索待办记录"><IconSearch width={25} height={25} aria-hidden="true" /></button>
          <button type="button" className="workshop-header-action" onClick={onLog} aria-label="查看当日日志"><IconBell width={25} height={25} aria-hidden="true" />{hasUnread ? <i ref={unreadRef} aria-hidden="true" /> : null}</button>
          <button type="button" className="workshop-user-context" onClick={onMenu} aria-label="打开当前用户菜单">
            <span className="workshop-user-avatar"><IconUser width={23} height={23} aria-hidden="true" /></span>
            <span><strong>{userName || storeName || 'Workshop Admin'}</strong><small>{roleLabel || '成员'}</small></span>
            <IconNavArrowDown width={16} height={16} aria-hidden="true" />
          </button>
        </div>
        <div className="workshop-header-context"><time dateTime={dateKey || undefined}>{formatDate(dateKey)}</time><span>{storeName || '门店'} · {roleLabel || '成员'}</span><strong>{userName || '—'}</strong></div>
        <button type="button" className="workshop-header-action workshop-header-mobile-log" onClick={onLog} aria-label="查看当日日志"><IconBell width={21} height={21} aria-hidden="true" />{hasUnread ? <i ref={unreadRef} aria-hidden="true" /> : null}</button>
      </div>
      <div className="workshop-module-header" aria-live="polite">
        <Icon width={26} height={26} strokeWidth={1.7} aria-hidden="true" />
        <span>{scene.no} / 06</span>
        <strong>{scene.cn}</strong>
        <small className="workshop-module-en">{scene.title}</small>
        {mobileLayout ? (
          <div className="workshop-module-search-slot">
            <div className="workshop-module-search" data-scene="pickup" />
            <div className="workshop-module-search" data-scene="poster" />
            <div className="workshop-module-search" data-scene="repair" />
          </div>
        ) : null}
      </div>
    </header>
    {mobileLayout ? (
      <>
        <div className="workshop-mobile-module-tools" data-scene="pickup" />
        <div className="workshop-mobile-module-tools" data-scene="poster" />
        <div className="workshop-mobile-module-tools" data-scene="repair" />
      </>
    ) : null}
    </>
  )
}
