import { useCallback, useLayoutEffect, useRef, useState } from 'react'
import { gsap } from 'gsap'
import { normalizeLoginUsername, USERNAME_MAX_LENGTH } from '../data/userSession.js'
import VisualLineText from './VisualLineText.jsx'

const EASE = 'cubic-bezier(0.22, 0.61, 0.36, 1)'

export default function BootLoader({ onLogin, onComplete }) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [hidden, setHidden] = useState(false)
  const rootRef = useRef(null)
  const brandRef = useRef(null)
  const loginRef = useRef(null)
  const headingRef = useRef(null)
  const descriptionRef = useRef(null)
  const inputRef = useRef(null)
  const introTlRef = useRef(null)
  const exitTlRef = useRef(null)
  const reduceMotionRef = useRef(false)

  const completeLogin = useCallback(() => {
    setHidden(true)
    onComplete?.()
  }, [onComplete])

  const submitLogin = async (event) => {
    event.preventDefault()
    const actorName = normalizeLoginUsername(username)
    if (!actorName || !password) {
      setError(!actorName ? '请输入用户名。' : '请输入密码。')
      inputRef.current?.focus()
      return
    }
    setError('')
    setSubmitting(true)
    const result = await onLogin?.(actorName, password)
    setSubmitting(false)
    if (!result?.ok) {
      setError(result?.error || '登录失败，请稍后重试。')
      inputRef.current?.focus()
      return
    }
    introTlRef.current?.kill()
    exitTlRef.current?.kill()
    if (reduceMotionRef.current || !rootRef.current) return completeLogin()
    exitTlRef.current = gsap.to(rootRef.current, {
      autoAlpha: 0,
      duration: 0.2,
      ease: EASE,
      onComplete: completeLogin
    })
  }

  useLayoutEffect(() => {
    if (typeof window === 'undefined' || typeof document === 'undefined') return undefined
    const root = rootRef.current
    const form = loginRef.current
    const brand = brandRef.current
    const headingLines = [...(headingRef.current?.querySelectorAll('.visual-line-text__content') || [])]
    const description = descriptionRef.current
    reduceMotionRef.current = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches || false
    document.body.classList.add('is-booting')

    if (reduceMotionRef.current || !root || !form || !brand || !headingLines.length || !description) {
      delete root?.dataset.editorialPending
      gsap.set([form, brand, ...headingLines, description].filter(Boolean), { autoAlpha: 1, y: 0 })
      inputRef.current?.focus()
      return () => document.body.classList.remove('is-booting')
    }

    gsap.set(form, { autoAlpha: 1 })
    gsap.set([brand, ...headingLines], { autoAlpha: 0, y: 12 })
    gsap.set(description, { autoAlpha: 0, y: 8 })
    const startTimer = window.setTimeout(() => {
      delete root.dataset.editorialPending
      introTlRef.current = gsap.timeline()
        .to(brand, { autoAlpha: 1, y: 0, duration: 0.45, ease: EASE }, 0)
        .to(headingLines, { autoAlpha: 1, y: 0, duration: 0.5, stagger: 0.05, ease: EASE }, 0.05)
        .to(description, { autoAlpha: 1, y: 0, duration: 0.55, ease: EASE }, 0.70)
    }, 120)
    const focusTimer = window.setTimeout(() => inputRef.current?.focus(), 1490)
    return () => {
      window.clearTimeout(startTimer)
      window.clearTimeout(focusTimer)
      introTlRef.current?.kill()
      exitTlRef.current?.kill()
      document.body.classList.remove('is-booting')
    }
  }, [])

  if (hidden) return null

  return (
    <section ref={rootRef} className="boot-sequence" data-editorial-page data-editorial-pending="true" role="dialog" aria-modal="true" aria-labelledby="login-title" aria-describedby="login-description">
      <div ref={brandRef} className="boot-title-lockup" aria-hidden="true"><strong>DECATHLON</strong><strong>BIKE OPS</strong></div>
      <form ref={loginRef} className="boot-login" onSubmit={submitLogin} noValidate>
        <div className="boot-login-heading">
          <span>SECURE ACCOUNT · 数据库账号</span>
          <span ref={headingRef}><VisualLineText as="strong" id="login-title">登录工作台</VisualLineText></span>
          <p ref={descriptionRef} id="login-description">使用管理员创建的账号登录。后续修改会同步到数据库，并以当前账号写入审计记录。</p>
        </div>
        <label className="boot-login-field"><span>用户名</span><input ref={inputRef} type="text" name="username" value={username} onChange={(event) => { setUsername(event.target.value); if (error) setError('') }} maxLength={USERNAME_MAX_LENGTH} autoComplete="username" enterKeyHint="go" aria-invalid={Boolean(error)} aria-describedby={error ? 'login-error' : 'login-privacy'} placeholder="例如：小王" /></label>
        <label className="boot-login-field"><span>密码</span><input type="password" name="password" value={password} onChange={(event) => { setPassword(event.target.value); if (error) setError('') }} minLength="10" maxLength="128" autoComplete="current-password" enterKeyHint="go" aria-invalid={Boolean(error)} /></label>
        {error ? <p className="boot-login-error" id="login-error" role="alert">{error}</p> : null}
        <button type="submit" className="boot-login-submit" disabled={submitting}>{submitting ? '正在验证…' : '登录并进入'}</button>
        <small id="login-privacy">账号由管理员创建；密码不会写入浏览器存储或操作日志。</small>
      </form>
    </section>
  )
}
