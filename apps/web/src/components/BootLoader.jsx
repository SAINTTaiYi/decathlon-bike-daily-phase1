import { useCallback, useEffect, useRef } from 'react'
import { gsap } from 'gsap'
import { useViewportKind } from '../hooks/useViewportKind.js'
import { useBootLoginForm } from '../hooks/useBootLoginForm.js'
import { BootLoaderMobile } from './boot/BootLoaderMobile.jsx'
import { BootLoaderDesktop } from './boot/BootLoaderDesktop.jsx'

/**
 * 登录页入口 —— 只做三件事：判定视口、持有共用业务逻辑、播退场动画。
 *
 * 项目规则（2026-08-28）：桌面端与移动端 UI 是两套彼此独立的实现，
 * 不用单套 DOM + @media 硬凑双端。这里按运行时视口挂载其中一套，
 * 另一套连 DOM 都不进文档；样式分别住在 boot-mobile.css / boot-desktop.css。
 */
export default function BootLoader({ initialError = '', onLogin, onComplete, onRegister }) {
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

  const handleForgotPassword = useCallback(() => {
    alert('请联系门店平台管理员或店长重置密码。')
  }, [])

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

  const shared = {
    form,
    onRegister,
    onForgotPassword: handleForgotPassword,
    rootRef,
    cardRef
  }

  return (
    <section
      ref={rootRef}
      className="boot-sequence"
      data-viewport={viewport}
      role="dialog"
      aria-modal="true"
      aria-label="登录工作台"
    >
      {viewport === 'mobile' ? <BootLoaderMobile {...shared} /> : <BootLoaderDesktop {...shared} />}
    </section>
  )
}
