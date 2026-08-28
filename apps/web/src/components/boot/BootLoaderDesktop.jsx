import { useEffect, useRef } from 'react'
import { gsap } from 'gsap'
import { BootCharacters } from '../BootCharacters.jsx'
import { BootLoginFields } from './BootLoginFields.jsx'
import { APP_VERSION } from '../../data/releaseNotes.js'

/**
 * 登录页 · 桌面端专属实现（宽视口）。
 *
 * 与移动端完全独立：双栏卡片，左表单右插画，四角色互动面板只在这里渲染。
 * 桌面端不渲染探头角色（那是移动端专属）——它曾绝对定位压在 WORKSHOP OPS
 * 标题上，且与右侧四角色插画重复表达。角色只出现在右栏插画面板。
 */
export function BootLoaderDesktop({ form, onRegister, onForgotPassword, rootRef, cardRef }) {
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
    <div ref={cardRef} className="bootd-card">
      <div className="bootd-form-side">
        <div className="bootd-brand bootd-item">
          <strong>WORKSHOP OPS</strong>
          <span className="bootd-version">V{APP_VERSION}</span>
        </div>

        <form className="bootd-form" onSubmit={submitLogin} noValidate>
          <BootLoginFields
            prefix="bootd"
            form={form}
            itemClassName="bootd-item"
            onForgotPassword={onForgotPassword}
          />

          {error ? <p className="bootd-error bootd-item" role="alert">{error}</p> : null}

          <div className="bootd-actions bootd-item">
            <button type="submit" className="bootd-btn-primary" disabled={submitting}>
              {submitting ? '正在验证…' : '登录并进入'}
            </button>
            <button type="button" className="bootd-btn-secondary" onClick={onRegister} disabled={submitting}>
              使用公司邮箱注册
            </button>
          </div>

          <div className="bootd-footer bootd-item">
            <span className="bootd-shield">
              <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
              </svg>
              迪卡侬门店专属 · 数据库加密直连
            </span>
          </div>
        </form>
      </div>

      <div className="bootd-poster-side bootd-poster-item">
        <BootCharacters isTyping={isTyping} showPassword={showPassword} passwordLength={password.length} />
      </div>
    </div>
  )
}

export default BootLoaderDesktop
