import { useEffect, useRef } from 'react'
import { gsap } from 'gsap'
import { BootPeeker } from '../BootPeeker.jsx'
import { BootLoginFields } from './BootLoginFields.jsx'
import { APP_VERSION } from '../../data/releaseNotes.js'

/**
 * 登录页 · 移动端专属实现（竖屏手机 / 窄视口）。
 *
 * 与桌面端完全独立：单列纵向流，角色占据卡片上方的独立一行（正常文档流，
 * 不做 bottom:100% 绝对定位），所以身体绝不会压到表单上。
 * 桌面端的双栏插画面板在这里根本不渲染。
 */
export function BootLoaderMobile({ form, onRegister, onForgotPassword, rootRef, cardRef }) {
  const introTlRef = useRef(null)
  const reduceMotionRef = useRef(false)

  const { error, submitting, isTyping, showPassword, password, submitLogin } = form

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

      <div ref={cardRef} className="bootm-card">
        <div className="bootm-brand bootm-item">
          <strong>WORKSHOP OPS</strong>
          <span className="bootm-version">V{APP_VERSION}</span>
        </div>

        <form className="bootm-form" onSubmit={submitLogin} noValidate>
          <BootLoginFields
            prefix="bootm"
            form={form}
            itemClassName="bootm-item"
            onForgotPassword={onForgotPassword}
          />

          {error ? <p className="bootm-error bootm-item" role="alert">{error}</p> : null}

          <div className="bootm-actions bootm-item">
            <button type="submit" className="bootm-btn-primary" disabled={submitting}>
              {submitting ? '正在验证…' : '登录并进入'}
            </button>
            <button type="button" className="bootm-btn-secondary" onClick={onRegister} disabled={submitting}>
              使用公司邮箱注册
            </button>
          </div>

          <div className="bootm-footer bootm-item">
            <span className="bootm-shield">
              <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
              </svg>
              迪卡侬门店专属 · 数据库加密直连
            </span>
          </div>
        </form>
      </div>
    </div>
  )
}

export default BootLoaderMobile
