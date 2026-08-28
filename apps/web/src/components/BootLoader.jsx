import { useCallback, useEffect, useRef } from 'react'
import { gsap } from 'gsap'
import { useViewportKind } from '../hooks/useViewportKind.js'
import { useBootLoginForm } from '../hooks/useBootLoginForm.js'
import { useBootAuthPanel } from '../hooks/useBootAuthPanel.js'
import { BootLoaderMobile } from './boot/BootLoaderMobile.jsx'
import { BootLoaderDesktop } from './boot/BootLoaderDesktop.jsx'

/**
 * 登录页入口 —— 判定视口、持有共用业务逻辑、播退场动画。
 *
 * 项目规则（2026-08-28）：桌面端与移动端 UI 是两套彼此独立的实现，
 * 不用单套 DOM + @media 硬凑双端。这里按运行时视口挂载其中一套，
 * 另一套连 DOM 都不进文档；样式分别住在 boot-mobile.css / boot-desktop.css。
 *
 * 注册与找回密码不再跳页：它们是这张登录卡的另外两种形态，
 * 由 useBootAuthPanel 管状态机、useAuthPanelMorph 播变形动效。
 */
export default function BootLoader({
  initialError = '',
  onLogin,
  onComplete,
  onRegistered,
  onRecovered
}) {
  const viewport = useViewportKind()

  const rootRef = useRef(null)
  const cardRef = useRef(null)
  const exitTlRef = useRef(null)
  const reduceMotionRef = useRef(false)

  // 退场动画由外壳统一负责：两端 DOM 不同，但退场语义一致
  const runExit = useCallback((done) => {
    if (reduceMotionRef.current || !cardRef.current || !rootRef.current) return false

    exitTlRef.current?.kill()
    exitTlRef.current = gsap.timeline({
      defaults: { ease: 'expo.inOut' },
      onComplete: done
    })

    exitTlRef.current
      .set(rootRef.current, { pointerEvents: 'none' }, 0)
      .to(cardRef.current, { autoAlpha: 0, y: -22, duration: 0.46, ease: 'power3.in' }, 0)
      .to(rootRef.current, { autoAlpha: 0, duration: 0.34, ease: 'power2.out' }, 0.18)

    return true
  }, [])

  const form = useBootLoginForm({ initialError, onLogin, onComplete, onExit: runExit })

  // 注册 / 重设密码完成后，同样借用登录卡的退场动画收尾，视觉连续
  const finishWith = useCallback((handler) => (payload) => {
    const handled = runExit(() => {
      form.completeLogin()
      handler?.(payload)
    })
    if (!handled) {
      form.completeLogin()
      handler?.(payload)
    }
  }, [runExit, form])

  const panel = useBootAuthPanel({
    onRegistered: finishWith(onRegistered),
    onRecovered: finishWith(onRecovered)
  })

  useEffect(() => {
    if (typeof window === 'undefined' || typeof document === 'undefined') return undefined

    reduceMotionRef.current = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches || false
    document.body.classList.add('is-booting')

    const focusTimer = window.setTimeout(
      () => form.inputRef.current?.focus(),
      reduceMotionRef.current ? 0 : 480
    )

    return () => {
      window.clearTimeout(focusTimer)
      exitTlRef.current?.kill()
      document.body.classList.remove('is-booting')
    }
  }, [form.inputRef])

  if (form.hidden) return null

  const shared = { form, panel, rootRef, cardRef }

  const label = panel.mode === 'register'
    ? '注册门店账号'
    : panel.mode === 'recover'
      ? '找回登录密码'
      : '登录工作台'

  return (
    <section
      ref={rootRef}
      className="boot-sequence"
      data-viewport={viewport}
      data-auth-mode={panel.mode}
      role="dialog"
      aria-modal="true"
      aria-label={label}
    >
      {viewport === 'mobile' ? <BootLoaderMobile {...shared} /> : <BootLoaderDesktop {...shared} />}
    </section>
  )
}
