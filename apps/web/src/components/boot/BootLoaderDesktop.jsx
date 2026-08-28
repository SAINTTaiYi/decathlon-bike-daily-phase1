import { useEffect, useRef } from 'react'
import { gsap } from 'gsap'
import { BootCharacters } from '../BootCharacters.jsx'
import { BootLoginFields } from './BootLoginFields.jsx'
import { BootAuthStepFields } from './BootAuthStepFields.jsx'
import { BootAuthSteps } from './BootAuthSteps.jsx'
import { useAuthPanelMorph } from '../../hooks/useAuthPanelMorph.js'
import { APP_VERSION } from '../../data/releaseNotes.js'

/**
 * 登录页 · 桌面端专属实现（宽视口）。
 *
 * 与移动端完全独立：双栏卡片，左表单右插画，四角色互动面板只在这里渲染。
 * 桌面端不渲染探头角色（那是移动端专属）。
 *
 * 登录 / 注册 / 找回密码是同一张卡的三种形态：不跳页，靠 useAuthPanelMorph
 * 做高度 FLIP + 内容淡入淡出，视觉上就是登录框自己长开或收拢。
 */
export function BootLoaderDesktop({ form, panel, rootRef, cardRef }) {
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
    itemSelector: '.bootd-item'
  })

  useEffect(() => {
    if (typeof window === 'undefined') return undefined

    reduceMotionRef.current = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches || false
    if (reduceMotionRef.current) return undefined

    const ctx = gsap.context(() => {
      introTlRef.current = gsap.timeline({ defaults: { ease: 'expo.out' } })
      introTlRef.current
        .fromTo(cardRef.current, { autoAlpha: 0, y: 30 }, { autoAlpha: 1, y: 0, duration: 0.75 }, 0)
        .fromTo('.bootd-item', { autoAlpha: 0, y: 16 }, { autoAlpha: 1, y: 0, duration: 0.52, stagger: 0.06 }, 0.15)
        .fromTo('.bootd-poster-item', { autoAlpha: 0, y: 18 }, { autoAlpha: 1, y: 0, duration: 0.62 }, 0.22)
    }, rootRef)

    return () => {
      introTlRef.current?.kill()
      ctx.revert()
    }
  }, [cardRef, rootRef])

  return (
    <div ref={cardRef} className="bootd-card" data-auth-mode={mode}>
      <div className="bootd-form-side">
        <div className="bootd-brand bootd-item">
          <strong>WORKSHOP OPS</strong>
          <span className="bootd-version">V{APP_VERSION}</span>
        </div>

        <div ref={bodyRef} className="bootd-body">
          {isLogin ? (
            <form className="bootd-form" onSubmit={submitLogin} noValidate>
              <BootLoginFields
                prefix="bootd"
                form={form}
                itemClassName="bootd-item"
                onForgotPassword={() => panel.switchMode('recover')}
              />

              {error ? <p className="bootd-error bootd-item" role="alert">{error}</p> : null}

              <div className="bootd-actions bootd-item">
                <button type="submit" className="bootd-btn-primary" disabled={submitting}>
                  {submitting ? '正在验证…' : '登录并进入'}
                </button>
                <button
                  type="button"
                  className="bootd-btn-secondary"
                  onClick={() => panel.switchMode('register')}
                  disabled={submitting}
                >
                  使用公司邮箱注册
                </button>
              </div>
            </form>
          ) : (
            <form className="bootd-form" onSubmit={submitCurrent} noValidate>
              <div className="bootd-panel-head bootd-item">
                <h2 className="bootd-panel-title">{title}</h2>
                <p className="bootd-panel-hint">{hint}</p>
              </div>

              <BootAuthSteps prefix="bootd" steps={steps} step={step} itemClassName="bootd-item" />

              <BootAuthStepFields prefix="bootd" panel={panel} itemClassName="bootd-item" />

              {notice ? <p className="bootd-notice bootd-item" role="status">{notice}</p> : null}
              {error ? <p className="bootd-error bootd-item" role="alert">{error}</p> : null}

              <div className="bootd-actions bootd-item">
                <button type="submit" className="bootd-btn-primary" disabled={busy}>
                  {busy ? '处理中…' : primaryLabel}
                </button>
                <button
                  type="button"
                  className="bootd-btn-secondary"
                  onClick={step === 0 ? panel.backToLogin : panel.previousStep}
                  disabled={busy}
                >
                  {step === 0 ? '返回登录' : '上一步'}
                </button>
              </div>
            </form>
          )}

          <div className="bootd-footer bootd-item">
            <span className="bootd-shield">
              <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
              </svg>
              迪卡侬门店专属 · 数据库加密直连
            </span>
          </div>
        </div>
      </div>

      <div className="bootd-poster-side bootd-poster-item">
        <BootCharacters isTyping={isTyping} showPassword={showPassword} passwordLength={password.length} />
      </div>
    </div>
  )
}

export default BootLoaderDesktop
