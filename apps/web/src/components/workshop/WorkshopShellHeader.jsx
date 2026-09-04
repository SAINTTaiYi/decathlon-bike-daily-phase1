import { useEffect, useRef } from 'react'
import { gsap } from 'gsap'
import { sceneById } from '../../data/lookbookScenes.js'
import WorkshopGlobalHeaderMobile from './WorkshopGlobalHeaderMobile.jsx'
import WorkshopGlobalHeaderDesktop from './WorkshopGlobalHeaderDesktop.jsx'

const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches || false

export default function WorkshopShellHeader({ activeScene, storeName, roleLabel, userName, onMenu, onLog, onSearch, hasUnread, pendingBadge = 0, mobileLayout = false }) {
  const scene = sceneById(activeScene)
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
  }, [hasUnread, mobileLayout])
  const badgeRef = useRef(null)
  const badgePrevRef = useRef(pendingBadge)
  useEffect(() => {
    if (badgePrevRef.current === pendingBadge) return
    badgePrevRef.current = pendingBadge
    const badge = badgeRef.current
    if (!badge || reducedMotion()) return
    gsap.fromTo(badge, { y: -5, autoAlpha: .4 }, { y: 0, autoAlpha: 1, duration: .4, ease: 'back.out(2)', clearProps: 'transform,opacity,visibility' })
  }, [pendingBadge, mobileLayout])
  const Icon = scene.NavIcon
  const globalHeaderProps = { storeName, roleLabel, userName, onMenu, onLog, onSearch, hasUnread, pendingBadge, badgeRef, unreadRef }
  return (
    <>
      <header className="workshop-shell-header" data-active-module={scene.id}>
        {mobileLayout
          ? <WorkshopGlobalHeaderMobile {...globalHeaderProps} />
          : <WorkshopGlobalHeaderDesktop {...globalHeaderProps} />}
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
