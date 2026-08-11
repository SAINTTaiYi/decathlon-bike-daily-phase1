import { useCallback, useEffect, useRef, useState } from 'react'
import { gsap } from 'gsap'
import { normalizeLoginUsername, USERNAME_MAX_LENGTH } from '../data/userSession.js'

export default function BootLoader({ initialError = '', onLogin, onComplete, onRegister }) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [hidden, setHidden] = useState(false)
  const rootRef = useRef(null)
  const topHalfRef = useRef(null)
  const bottomHalfRef = useRef(null)
  const decathlonRef = useRef(null)
  const bikeOpsRef = useRef(null)
  const seamRef = useRef(null)
  const loginRef = useRef(null)
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

    const nodes = [rootRef.current, topHalfRef.current, bottomHalfRef.current, decathlonRef.current, bikeOpsRef.current, seamRef.current, loginRef.current]
    if (reduceMotionRef.current || nodes.some((node) => !node)) {
      completeLogin(actorName)
      return
    }

    exitTlRef.current = gsap.timeline({
      defaults: { ease: 'expo.inOut' },
      onComplete: () => completeLogin(actorName)
    })
    exitTlRef.current
      .set(rootRef.current, { pointerEvents: 'none' }, 0)
      .to(loginRef.current, { autoAlpha: 0, y: 18, filter: 'blur(8px)', duration: 0.36, ease: 'power3.out' }, 0)
      .to(seamRef.current, { autoAlpha: 1, scaleY: 1, duration: 0.18, ease: 'power3.out' }, 0.05)
      .to(decathlonRef.current, { yPercent: -118, filter: 'blur(6px)', duration: 0.68 }, 0.08)
      .to(bikeOpsRef.current, { yPercent: 118, filter: 'blur(6px)', duration: 0.68 }, 0.08)
      .to(topHalfRef.current, { yPercent: -104, duration: 0.74 }, 0.1)
      .to(bottomHalfRef.current, { yPercent: 104, duration: 0.74 }, 0.1)
      .to(seamRef.current, { autoAlpha: 0, scaleY: 2.4, duration: 0.32, ease: 'power4.out' }, 0.34)
      .to(rootRef.current, { autoAlpha: 0, duration: 0.16, ease: 'power2.out' }, 0.72)
  }

  useEffect(() => {
    if (initialError) setError(initialError)
  }, [initialError])

  useEffect(() => {
    if (typeof window === 'undefined' || typeof document === 'undefined') return undefined

    reduceMotionRef.current = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches || false
    document.body.classList.add('is-booting')

    const ctx = gsap.context(() => {
      if (reduceMotionRef.current) return
      introTlRef.current = gsap.timeline({ defaults: { ease: 'expo.out' } })
      introTlRef.current
        .fromTo(decathlonRef.current, { autoAlpha: 0, yPercent: 20, filter: 'blur(20px)' }, { autoAlpha: 1, yPercent: 0, filter: 'blur(0px)', duration: 0.86 }, 0)
        .fromTo(bikeOpsRef.current, { autoAlpha: 0, yPercent: -20, filter: 'blur(20px)' }, { autoAlpha: 1, yPercent: 0, filter: 'blur(0px)', duration: 0.86 }, 0.08)
        .fromTo(seamRef.current, { autoAlpha: 0, scaleX: 0.12 }, { autoAlpha: 0.3, scaleX: 1, duration: 0.64, ease: 'power4.out' }, 0.42)
        .fromTo(loginRef.current, { autoAlpha: 0, y: 18, filter: 'blur(10px)' }, { autoAlpha: 1, y: 0, filter: 'blur(0px)', duration: 0.65 }, 0.48)
    }, rootRef)

    const focusTimer = window.setTimeout(() => inputRef.current?.focus(), reduceMotionRef.current ? 0 : 750)
    return () => {
      window.clearTimeout(focusTimer)
      introTlRef.current?.kill()
      exitTlRef.current?.kill()
      ctx.revert()
      document.body.classList.remove('is-booting')
    }
  }, [])

  useEffect(() => {
    if (hidden && typeof document !== 'undefined') document.body.classList.remove('is-booting')
  }, [hidden])

  if (hidden) return null

  return (
    <section
      ref={rootRef}
      className="boot-sequence boot-title-split"
      role="dialog"
      aria-modal="true"
      aria-labelledby="login-title"
      aria-describedby="login-description"
    >
      <div ref={topHalfRef} className="boot-title-half boot-title-half-top" aria-hidden="true" />
      <div ref={bottomHalfRef} className="boot-title-half boot-title-half-bottom" aria-hidden="true" />
      <div ref={seamRef} className="boot-title-seam" aria-hidden="true" />

      <div className="boot-title-lockup" aria-hidden="true">
        <strong ref={decathlonRef} className="boot-title-word boot-title-word-decathlon">DECATHLON</strong>
        <strong ref={bikeOpsRef} className="boot-title-word boot-title-word-bikeops">BIKE OPS</strong>
      </div>

      <form ref={loginRef} className="boot-login" onSubmit={submitLogin} noValidate>
        <div className="boot-login-heading">
          <span>SECURE ACCOUNT · 数据库账号</span>
          <strong id="login-title">登录工作台</strong>
          <p id="login-description">使用现有账号登录。新同事可使用门店编码和公司邮箱完成自助注册。</p>
        </div>
        <label className="boot-login-field">
          <span>用户名</span>
          <input
            ref={inputRef}
            type="text"
            name="username"
            value={username}
            onChange={(event) => {
              setUsername(event.target.value)
              if (error) setError('')
            }}
            maxLength={USERNAME_MAX_LENGTH}
            autoComplete="username"
            enterKeyHint="go"
            aria-invalid={Boolean(error)}
            aria-describedby={error ? 'login-error' : 'login-privacy'}
            placeholder="例如：小王"
          />
        </label>
        <label className="boot-login-field">
          <span>密码</span>
          <input
            type="password"
            name="password"
            value={password}
            onChange={(event) => {
              setPassword(event.target.value)
              if (error) setError('')
            }}
            minLength="10"
            maxLength="128"
            autoComplete="current-password"
            enterKeyHint="go"
            aria-invalid={Boolean(error)}
          />
        </label>
        {error ? <p className="boot-login-error" id="login-error" role="alert">{error}</p> : null}
        <div className="boot-login-actions"><button type="submit" className="boot-login-submit" disabled={submitting}>{submitting ? '正在验证…' : '登录并进入'}</button><button type="button" className="boot-register-link" onClick={onRegister} disabled={submitting}>使用公司邮箱注册</button></div><small id="login-privacy">账号使用公司邮箱验证码注册；密码不会写入浏览器存储或操作日志。</small>
      </form>
    </section>
  )
}
