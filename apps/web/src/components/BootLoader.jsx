import { useCallback, useEffect, useRef, useState } from 'react'
import { gsap } from 'gsap'
import { normalizeLoginUsername, USERNAME_MAX_LENGTH } from '../data/userSession.js'
import { BootMascot } from './BootMascot.jsx'
import { APP_VERSION } from '../data/releaseNotes.js'

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
          y: 32,
          scale: 0.98,
          filter: 'blur(12px)'
        }, {
          autoAlpha: 1,
          y: 0,
          scale: 1,
          filter: 'blur(0px)',
          duration: 0.75
        }, 0)
        .fromTo('.boot-stagger-item', {
          autoAlpha: 0,
          y: 16
        }, {
          autoAlpha: 1,
          y: 0,
          duration: 0.52,
          stagger: 0.06
        }, 0.15)
        .fromTo('.boot-poster-item', {
          autoAlpha: 0,
          scale: 0.94,
          y: 16
        }, {
          autoAlpha: 1,
          scale: 1,
          y: 0,
          duration: 0.65,
          stagger: 0.08
        }, 0.22)
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
    >
      {/* 桌面居中沉浸式容器 / 移动端自然浮起卡片 */}
      <div ref={cardRef} className="boot-card">
        {/* =================================================================
            左侧：纯净极简表单区 (参考图 1/2/3 风格，高对比黄黑胶囊)
            ================================================================= */}
        <div ref={formSideRef} className="boot-form-side">
          {/* 顶部品牌区：WORKSHOP OPS + 当前版本号 */}
          <div className="boot-brand-row boot-stagger-item">
            <div className="boot-brand-text">
              <strong>WORKSHOP OPS</strong>
              <span className="boot-brand-version">V{APP_VERSION}</span>
            </div>
          </div>

          {/* 移动端顶部吉祥物（跟随指针转向 / 触屏自动巡视） */}
          <div className="boot-mobile-hero boot-stagger-item" aria-hidden="true">
            <BootMascot className="boot-mascot-mobile" />
          </div>

          {/* 登录标题与注册快捷链接 */}
          <div className="boot-header-group boot-stagger-item">
            <h1 id="login-title" className="boot-title">登录工作台</h1>
            <p className="boot-subtitle">
              新同事？
              <button type="button" className="boot-link-action" onClick={onRegister} disabled={submitting}>
                使用公司邮箱注册
              </button>
            </p>
          </div>

          {/* 表单输入组 */}
          <form className="boot-form" onSubmit={submitLogin} noValidate>
            <div className="boot-fields-group">
              <label className="boot-field-wrap boot-stagger-item">
                <span className="boot-label">用户名</span>
                <div className="boot-input-box">
                  <svg className="boot-input-icon" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
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

              <label className="boot-field-wrap boot-stagger-item">
                <div className="boot-label-row">
                  <span className="boot-label">密码</span>
                  <button
                    type="button"
                    className="boot-link-action sub-text"
                    onClick={() => alert('请联系门店平台管理员或店长重置密码。')}
                    tabIndex={-1}
                  >
                    忘记密码？
                  </button>
                </div>
                <div className="boot-input-box">
                  <svg className="boot-input-icon" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
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

            {error ? <p className="boot-error-pill boot-stagger-item" role="alert">{error}</p> : null}

            {/* 操作主按钮与快速注册入口 (黄黑高对比设计，参考图 3) */}
            <div className="boot-actions boot-stagger-item">
              <button type="submit" className="boot-btn-primary" disabled={submitting}>
                {submitting ? '正在验证…' : '登录并进入'}
              </button>
              <button type="button" className="boot-btn-secondary" onClick={onRegister} disabled={submitting}>
                使用公司邮箱注册
              </button>
            </div>

            <div className="boot-footer-note boot-stagger-item">
              <span className="boot-shield-tag">
                <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                </svg>
                迪卡侬门店专属 · 数据库加密直连
              </span>
            </div>
          </form>
        </div>

        {/* =================================================================
            右侧：工坊艺术海报插画卡片 (参考图 4/5 风格，Bento 独立高饱和卡片)
            ================================================================= */}
        <div ref={posterSideRef} className="boot-poster-side">
          <div className="boot-poster-inner">
            {/* 顶部标签 */}
            <div className="boot-poster-top boot-poster-item">
              <div className="boot-status-pill">
                <span className="boot-live-dot" aria-hidden="true" />
                <span>WORKSHOP 2.0</span>
              </div>
              <span className="boot-badge-text">五象店 / 全国门店</span>
            </div>

            {/* 居中大插画区 */}
            <div className="boot-poster-art boot-poster-item">
              <BootMascot className="boot-mascot-hero" />
            </div>

            {/* 底部文字 Slogan & 运营特点 */}
            <div className="boot-poster-bottom boot-poster-item">
              <h2 className="boot-slogan-title">
                让每一台单车<br />
                <span className="highlight">更快、更安全</span> 重返赛道
              </h2>
              <p className="boot-slogan-desc">
                维修工单 · 待取车管理 · 二手车流转 · 自动闭店日报
              </p>
              <div className="boot-kpi-row">
                <div className="boot-kpi-tag">
                  <strong>195+</strong>
                  <span>全国覆盖门店</span>
                </div>
                <div className="boot-kpi-tag">
                  <strong>0</strong>
                  <span>数据丢失</span>
                </div>
                <div className="boot-kpi-tag">
                  <strong>100%</strong>
                  <span>免费纯净</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
