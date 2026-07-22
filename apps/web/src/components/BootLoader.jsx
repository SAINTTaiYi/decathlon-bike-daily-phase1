import { useCallback, useEffect, useRef, useState } from 'react'
import { gsap } from 'gsap'
import { normalizeLoginUsername, USERNAME_MAX_LENGTH } from '../data/userSession.js'
import { SignalAccessBrand, SignalAccessHeading } from './SignalAccessFrame.jsx'

export default function BootLoader({ onLogin, onComplete }) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [hidden, setHidden] = useState(false)
  const rootRef = useRef(null)
  const brandRef = useRef(null)
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

    const nodes = [rootRef.current, brandRef.current, loginRef.current]
    if (reduceMotionRef.current || nodes.some((node) => !node)) {
      completeLogin()
      return
    }

    exitTlRef.current = gsap.timeline({
      defaults: { ease: 'power4.inOut' },
      onComplete: completeLogin
    })
    exitTlRef.current
      .set(rootRef.current, { pointerEvents: 'none' }, 0)
      .to(brandRef.current, { autoAlpha: 0, x: -36, duration: 0.32 }, 0)
      .to(loginRef.current, { autoAlpha: 0, x: 36, duration: 0.32 }, 0)
      .to(rootRef.current, { autoAlpha: 0, duration: 0.14, ease: 'power2.out' }, 0.26)
  }

  useEffect(() => {
    if (typeof window === 'undefined' || typeof document === 'undefined') return undefined

    reduceMotionRef.current = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches || false
    document.body.classList.add('is-booting')

    const ctx = gsap.context(() => {
      if (reduceMotionRef.current) return
      introTlRef.current = gsap.timeline({ defaults: { ease: 'power4.out' } })
      introTlRef.current
        .fromTo(brandRef.current, { autoAlpha: 0, x: -28 }, { autoAlpha: 1, x: 0, duration: 0.42 }, 0.06)
        .fromTo(loginRef.current, { autoAlpha: 0, x: 28 }, { autoAlpha: 1, x: 0, duration: 0.42 }, 0.12)
    }, rootRef)

    const focusTimer = window.setTimeout(() => inputRef.current?.focus(), reduceMotionRef.current ? 0 : 480)
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
      className="signal-access-shell signal-access-login"
      role="dialog"
      aria-modal="true"
      aria-labelledby="login-title"
      aria-describedby="login-description"
    >
      <div ref={brandRef} className="signal-access-brand-slot"><SignalAccessBrand mode="access" /></div>
      <form ref={loginRef} className="signal-access-panel signal-access-form" onSubmit={submitLogin} noValidate>
        <SignalAccessHeading
          eyebrow="SECURE ACCOUNT / 数据库账号"
          title="登录工作台"
          description="使用管理员创建的账号登录。后续修改同步到数据库，并以当前账号写入审计记录。"
          titleId="login-title"
          descriptionId="login-description"
        />
        <label className="signal-access-field">
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
        <label className="signal-access-field">
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
        {error ? <p className="signal-access-error" id="login-error" role="alert">{error}</p> : null}
        <button type="submit" className="signal-access-submit" disabled={submitting}>{submitting ? '正在验证…' : '登录并进入'}</button>
        <small id="login-privacy">账号由管理员创建。密码不会写入浏览器存储或操作日志。</small>
      </form>
    </section>
  )
}
