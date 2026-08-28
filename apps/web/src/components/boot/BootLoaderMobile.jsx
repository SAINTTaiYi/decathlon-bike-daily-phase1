import { useEffect, useRef } from 'react'
import { gsap } from 'gsap'
import { BootPeeker } from '../BootPeeker.jsx'
import { BootLoginFields } from './BootLoginFields.jsx'
import { BootAuthStepFields } from './BootAuthStepFields.jsx'
import { BootAuthSteps } from './BootAuthSteps.jsx'
import { useAuthPanelMorph } from '../../hooks/useAuthPanelMorph.js'
import { APP_VERSION } from '../../data/releaseNotes.js'

/**
 * 登录页 · 移动端专属实现（竖屏手机 / 窄视口）。
 *
 * 与桌面端完全独立：单列纵向流，角色占据卡片上方的独立一行（正常文档流，
 * 不做 bottom:100% 绝对定位），所以身体绝不会压到表单上。
 *
 * 登录 / 注册 / 找回密码同样是这张卡的三种形态，就地变形，不跳页。
 */
export function BootLoaderMobile({ form, panel, rootRef, cardRef }) {
  const introTlRef = useRef(null)
  const reduceMotionRef = useRef(false)
  const bodyRef = useRef(null)

  const { error: loginError, submitting, isTyping, showPassword, password, submitLogin } = form
  const { mode, step, steps, notice, busy, title, hint, primaryLabel, submitCurrent } = panel

  const isLogin = mode === 'login'
  const error = isLogin ? loginError : panel.error

  useAuthPanelMorph({
    transitionKey: panel.transitionKey,
    cardRef,
    bodyRef,
    itemSelector: '.bootm-item'
  })

  useEffect(() => {
    if (typeof window === 'undefined') return undefined

    reduceMotionRef.current = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches || false
    if (reduceMotionRef.current) return undefined

    const ctx = gsap.context(() => {
      introTlRef.current = gsap.timeline({ defaults: { ease: 'expo.out' } })
      introTlRef.current
        .fromTo('.bootm-peeker-row', { autoAlpha: 0, y: 24 }, { autoAlpha: 1, y: 0, duration: 0.6 }, 0)
        .fromTo(cardRef.current, { autoAlpha: 0, y: 28 }, { autoAlpha: 1, y: 0, duration: 0.7 }, 0.08)
        .fromTo('.bootm-item', { autoAlpha: 0, y: 14 }, { autoAlpha: 1, y: 0, duration: 0.5, stagger: 0.06 }, 0.24)
    }, rootRef)

    return () => {
      introTlRef.current?.kill()
      ctx.revert()
    }
  }, [cardRef, rootRef])

  return (
    <div className="bootm-stage">
      {/* 角色行：独立一行，卡片之上，不与表单重叠 */}
      <div className="bootm-peeker-row">
        <BootPeeker isTyping={isTyping} showPassword={showPassword} passwordLength={password.length} />
      </div>

      <div ref={cardRef} className="bootm-card" data-auth-mode={mode}>
        <div className="bootm-brand bootm-item">
          <strong>WORKSHOP OPS</strong>
          <span className="bootm-version">V{APP_VERSION}</span>
        </div>

        <div ref={bodyRef} className="bootm-body">
          {isLogin ? (
            <form className="bootm-form" onSubmit={submitLogin} noValidate>
              <BootLoginFields
                prefix="bootm"
                form={form}
                itemClassName="bootm-item"
                onForgotPassword={() => panel.switchMode('recover')}
              />

              {error ? <p className="bootm-error bootm-item" role="alert">{error}</p> : null}

              <div className="bootm-actions bootm-item">
                <button type="submit" className="bootm-btn-primary" disabled={submitting}>
                  {submitting ? '正在验证…' : '登录并进入'}
                </button>
                <button
                  type="button"
                  className="bootm-btn-secondary"
                  onClick={() => panel.switchMode('register')}
                  disabled={submitting}
                >
                  使用公司邮箱注册
                </button>
              </div>
            </form>
          ) : (
            <form className="bootm-form" onSubmit={submitCurrent} noValidate>
              <div className="bootm-panel-head bootm-item">
                <h2 className="bootm-panel-title">{title}</h2>
                <p className="bootm-panel-hint">{hint}</p>
              </div>

              <BootAuthSteps prefix="bootm" steps={steps} step={step} itemClassName="bootm-item" />

              <BootAuthStepFields prefix="bootm" panel={panel} itemClassName="bootm-item" />

              {notice ? <p className="bootm-notice bootm-item" role="status">{notice}</p> : null}
              {error ? <p className="bootm-error bootm-item" role="alert">{error}</p> : null}

              <div className="bootm-actions bootm-item">
                <button type="submit" className="bootm-btn-primary" disabled={busy}>
                  {busy ? '处理中…' : primaryLabel}
                </button>
                <button
                  type="button"
                  className="bootm-btn-secondary"
                  onClick={step === 0 ? panel.backToLogin : panel.previousStep}
                  disabled={busy}
                >
                  {step === 0 ? '返回登录' : '上一步'}
                </button>
              </div>
            </form>
          )}

          <div className="bootm-footer bootm-item">
            <span className="bootm-shield">
              <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
              </svg>
              迪卡侬门店专属 · 数据库加密直连
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}

export default BootLoaderMobile
