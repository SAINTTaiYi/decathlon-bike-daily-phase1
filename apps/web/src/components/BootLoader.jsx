import { useCallback, useEffect, useRef, useState } from 'react'
import { gsap } from 'gsap'
import { normalizeLoginUsername, USERNAME_MAX_LENGTH } from '../data/userSession.js'

export default function BootLoader({ initialError = '', onLogin, onComplete, onRegister }) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [hidden, setHidden] = useState(false)

  const rootRef = useRef(null)
  const cardRef = useRef(null)
  const formSideRef = useRef(null)
  const posterSideRef = useRef(null)
  const brandBadgeRef = useRef(null)
  const headingRef = useRef(null)
  const fieldsRef = useRef(null)
  const actionsRef = useRef(null)
  const footerNoteRef = useRef(null)
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
      // 错误震颤动效
      if (cardRef.current && !reduceMotionRef.current) {
        gsap.fromTo(cardRef.current, { x: -8 }, { x: 0, duration: 0.35, ease: 'elastic.out(1, 0.3)' })
      }
      return
    }

    introTlRef.current?.kill()
    exitTlRef.current?.kill()

    if (reduceMotionRef.current || !cardRef.current || !rootRef.current) {
      completeLogin()
      return
    }

    // 登录成功退场动效
    exitTlRef.current = gsap.timeline({
      defaults: { ease: 'expo.inOut' },
      onComplete: () => completeLogin()
    })

    exitTlRef.current
      .set(rootRef.current, { pointerEvents: 'none' }, 0)
      .to(cardRef.current, {
        autoAlpha: 0,
        y: -24,
        scale: 0.96,
        filter: 'blur(12px)',
        duration: 0.48,
        ease: 'power3.in'
      }, 0)
      .to(rootRef.current, {
        autoAlpha: 0,
        duration: 0.36,
        ease: 'power2.out'
      }, 0.2)
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
        .fromTo(cardRef.current, {
          autoAlpha: 0,
          y: 28,
          scale: 0.98,
          filter: 'blur(12px)'
        }, {
          autoAlpha: 1,
          y: 0,
          scale: 1,
          filter: 'blur(0px)',
          duration: 0.72
        }, 0)
        .fromTo([brandBadgeRef.current, headingRef.current], {
          autoAlpha: 0,
          y: 14
        }, {
          autoAlpha: 1,
          y: 0,
          duration: 0.5,
          stagger: 0.08
        }, 0.15)
        .fromTo(fieldsRef.current?.children ? Array.from(fieldsRef.current.children) : [], {
          autoAlpha: 0,
          y: 14
        }, {
          autoAlpha: 1,
          y: 0,
          duration: 0.5,
          stagger: 0.07
        }, 0.25)
        .fromTo([actionsRef.current, footerNoteRef.current], {
          autoAlpha: 0,
          y: 10
        }, {
          autoAlpha: 1,
          y: 0,
          duration: 0.45,
          stagger: 0.06
        }, 0.38)
        .fromTo(posterSideRef.current?.querySelectorAll('.boot-poster-stagger') || [], {
          autoAlpha: 0,
          y: 18
        }, {
          autoAlpha: 1,
          y: 0,
          duration: 0.6,
          stagger: 0.09
        }, 0.2)
    }, rootRef)

    const focusTimer = window.setTimeout(() => inputRef.current?.focus(), reduceMotionRef.current ? 0 : 500)
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
      className="boot-sequence"
      role="dialog"
      aria-modal="true"
      aria-labelledby="login-title"
      aria-describedby="login-description"
    >
      <div className="boot-bg-blobs" aria-hidden="true">
        <div className="boot-blob boot-blob-1" />
        <div className="boot-blob boot-blob-2" />
        <div className="boot-blob boot-blob-3" />
      </div>

      <div ref={cardRef} className="boot-card">
        {/* 左侧：表单区 */}
        <div ref={formSideRef} className="boot-form-side">
          <div ref={brandBadgeRef} className="boot-brand-lockup">
            <span className="boot-brand-word">DECATHLON</span>
            <span className="boot-brand-pill">BIKE OPS</span>
          </div>

          <div ref={headingRef} className="boot-login-heading">
            <h1 id="login-title" className="boot-login-title">登录工作台</h1>
            <p id="login-description" className="boot-login-sub">
              高效 · 精准 · 门店数字化工坊运营
            </p>
          </div>

          <form className="boot-login-form" onSubmit={submitLogin} noValidate>
            <div ref={fieldsRef} className="boot-fields-group">
              <label className="boot-field-wrap">
                <span className="boot-field-label">用户名</span>
                <div className="boot-input-box">
                  <svg className="boot-field-icon" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                    <circle cx="12" cy="7" r="4" />
                  </svg>
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
                    enterKeyHint="next"
                    aria-invalid={Boolean(error)}
                    placeholder="输入用户名（如：CHU13 / 小王）"
                  />
                </div>
              </label>

              <label className="boot-field-wrap">
                <span className="boot-field-label">登录密码</span>
                <div className="boot-input-box">
                  <svg className="boot-field-icon" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                  </svg>
                  <input
                    type={showPassword ? 'text' : 'password'}
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
                    placeholder="输入登录密码"
                  />
                  <button
                    type="button"
                    className="boot-pwd-toggle"
                    onClick={() => setShowPassword(!showPassword)}
                    aria-label={showPassword ? '隐藏密码' : '显示密码'}
                    tabIndex={-1}
                  >
                    {showPassword ? (
                      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                        <line x1="1" y1="1" x2="23" y2="23" />
                      </svg>
                    ) : (
                      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                        <circle cx="12" cy="12" r="3" />
                      </svg>
                    )}
                  </button>
                </div>
              </label>
            </div>

            {error ? <p className="boot-login-error" role="alert">{error}</p> : null}

            <div ref={actionsRef} className="boot-login-actions">
              <button type="submit" className="boot-login-submit" disabled={submitting}>
                {submitting ? '正在验证…' : '登录并进入'}
              </button>
              <button type="button" className="boot-register-link" onClick={onRegister} disabled={submitting}>
                使用公司邮箱注册
              </button>
            </div>

            <div ref={footerNoteRef} className="boot-form-footer">
              <small className="boot-footer-shield">
                <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                </svg>
                企业级安全认证 · 密码不写入浏览器缓存
              </small>
            </div>
          </form>
        </div>

        {/* 右侧：工坊视觉海报区（桌面端） */}
        <div ref={posterSideRef} className="boot-poster-side">
          <div className="boot-poster-backdrop" aria-hidden="true" />
          <div className="boot-poster-content">
            <div className="boot-poster-badge boot-poster-stagger">
              <span className="boot-pulse-dot" aria-hidden="true" />
              <span>WORKSHOP LIVE SYNC</span>
            </div>

            <div className="boot-poster-slogan boot-poster-stagger">
              <h2>一站式门店工坊<br />维修 · 待取车 · 二手车 · 日报协同</h2>
              <p>实时同步 · 零数据丢失 · 快速流转</p>
            </div>

            <div className="boot-poster-cards boot-poster-stagger">
              <div className="boot-kpi-pill">
                <span className="boot-kpi-label">全国覆盖</span>
                <strong>195 家</strong>
              </div>
              <div className="boot-kpi-pill">
                <span className="boot-kpi-label">日均台账</span>
                <strong>2,400+</strong>
              </div>
            </div>

            <div className="boot-poster-footer boot-poster-stagger">
              <span className="boot-version-tag">V6.2 · 企业级私有部署</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
