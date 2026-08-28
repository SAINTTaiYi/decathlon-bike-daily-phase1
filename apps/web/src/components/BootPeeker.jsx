import { useEffect, useRef } from 'react'
import { gsap } from 'gsap'

/**
 * 登录卡背后的探头角色（Peeker）。
 *
 * 构图方法：半圆 + 向下延伸的单条 path，viewBox 只框住上半部分，
 * 下半身被自然裁掉 —— 视觉上就是"从登录框后面探出头"。
 * 配色走 workshop 品牌黄 #ffde59 / 深炭 #14161a，不使用任何外部素材。
 *
 * 行为：
 * - 瞳孔跟随指针（clamp 防止越出眼白），触屏走自动巡视
 * - 随机间隔眨眼（clipPath rect 高度动画，非 scaleY，避免形变失真）
 * - 输入用户名时上探一点并微笑加深
 * - 密码有值未显示时移开视线；密码明文时抬手遮眼 + 偶尔偷瞄
 *
 * 全部位移走 transform / GSAP quickTo，无 filter blur、无大表面 scale。
 */

const BODY_PATH = 'M 0 200 A 200 200 0 0 1 400 200 L 400 800 L 0 800 Z'

const EYE = {
  left: { cx: 140, cy: 95 },
  right: { cx: 260, cy: 95 },
  r: 46,
  pupilR: 34
}

export function BootPeeker({ isTyping = false, showPassword = false, passwordLength = 0 }) {
  const rootRef = useRef(null)
  const bodyRef = useRef(null)
  const pupilsRef = useRef(null)
  const mouthRef = useRef(null)
  const blushRef = useRef(null)
  const handsRef = useRef(null)
  const blinkRectRef = useRef(null)

  const blinkTimerRef = useRef(null)
  const peekTimerRef = useRef(null)
  const quickRef = useRef(null)

  const isHidingPassword = passwordLength > 0 && !showPassword
  const isShowingPassword = passwordLength > 0 && showPassword

  const stateRef = useRef({ isTyping, isHidingPassword, isShowingPassword })
  stateRef.current = { isTyping, isHidingPassword, isShowingPassword }

  // ─── 指针跟随 + 眨眼 ────────────────────────────────────────────────────
  useEffect(() => {
    const root = rootRef.current
    const pupils = pupilsRef.current
    const body = bodyRef.current
    const blinkRect = blinkRectRef.current
    if (!root || !pupils || !body || !blinkRect) return undefined

    const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches
    if (reduceMotion) return undefined

    const qt = {
      pupilX: gsap.quickTo(pupils, 'x', { duration: 0.32, ease: 'power2.out' }),
      pupilY: gsap.quickTo(pupils, 'y', { duration: 0.32, ease: 'power2.out' }),
      bodyX: gsap.quickTo(body, 'x', { duration: 0.6, ease: 'power3.out' }),
      bodyRot: gsap.quickTo(body, 'rotation', { duration: 0.7, ease: 'power3.out' })
    }
    quickRef.current = qt

    const clamp = (v, limit) => Math.max(-limit, Math.min(limit, v))

    const aim = (nx, ny) => {
      const state = stateRef.current
      // 遮眼时瞳孔归位，别在手掌后面乱转
      if (state.isShowingPassword) return
      const cx = clamp(nx, 1)
      const cy = clamp(ny, 1)
      // 密码未显示：刻意把视线移开（向上瞟），不跟手
      if (state.isHidingPassword) {
        qt.pupilX(clamp(cx, 0.4) * 10)
        qt.pupilY(-16)
      } else {
        qt.pupilX(cx * 18)
        qt.pupilY(cy * 12)
      }
      // 身体反向轻倾，放大"歪头看"
      qt.bodyX(cx * 6)
      qt.bodyRot(cx * -2.2)
    }

    const finePointer = window.matchMedia?.('(pointer: fine)')?.matches
    let idleTween = null
    let onMove = null

    if (finePointer) {
      onMove = (event) => {
        const rect = root.getBoundingClientRect()
        if (!rect.width || !rect.height) return
        const originX = rect.left + rect.width / 2
        const originY = rect.top + rect.height * 0.66
        aim(
          (event.clientX - originX) / (window.innerWidth / 2.2),
          (event.clientY - originY) / (window.innerHeight / 2.4)
        )
      }
      window.addEventListener('pointermove', onMove, { passive: true })
    } else {
      const look = { v: 0 }
      idleTween = gsap.to(look, {
        v: 1,
        duration: 3.6,
        ease: 'sine.inOut',
        repeat: -1,
        yoyo: true,
        onUpdate: () => aim(look.v * 2 - 1, Math.sin(look.v * Math.PI) * 0.3)
      })
    }

    // 眨眼：clipPath 内的 rect 收起再展开，随机间隔避免机械感
    const blink = () => {
      const state = stateRef.current
      const delay = state.isShowingPassword ? 2.4 : 1
      gsap
        .timeline()
        .to(blinkRect, { attr: { height: 0, y: 95 }, duration: 0.07, ease: 'power2.in' })
        .to(blinkRect, { attr: { height: 200, y: 0 }, duration: 0.11, ease: 'power2.out' }, '+=0.04')
      blinkTimerRef.current = window.setTimeout(blink, (delay + Math.random() * 4) * 1000)
    }
    blinkTimerRef.current = window.setTimeout(blink, 1800 + Math.random() * 2200)

    return () => {
      if (onMove) window.removeEventListener('pointermove', onMove)
      idleTween?.kill()
      if (blinkTimerRef.current) window.clearTimeout(blinkTimerRef.current)
      gsap.killTweensOf([pupils, body, blinkRect])
    }
  }, [])

  // ─── 表单状态反应 ───────────────────────────────────────────────────────
  useEffect(() => {
    const root = rootRef.current
    const mouth = mouthRef.current
    const blush = blushRef.current
    const hands = handsRef.current
    if (!root || !mouth || !blush || !hands) return undefined

    const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches
    if (reduceMotion) return undefined

    // 输入用户名：整体上探，笑意加深，腮红变明显
    gsap.to(root, {
      y: isTyping ? -14 : 0,
      duration: 0.65,
      ease: 'expo.out'
    })
    gsap.to(mouth, {
      attr: { d: isTyping ? 'M 100 93 Q 140 116 180 93' : 'M 100 95 Q 140 108 180 95' },
      duration: 0.45,
      ease: 'power2.out'
    })
    gsap.to(blush, {
      opacity: isTyping ? 1 : 0.55,
      duration: 0.5,
      ease: 'power2.out'
    })

    // 密码明文：抬手遮眼
    gsap.to(hands, {
      y: isShowingPassword ? 0 : 150,
      opacity: isShowingPassword ? 1 : 0,
      duration: 0.5,
      ease: isShowingPassword ? 'back.out(1.6)' : 'power3.in'
    })

    return () => {
      gsap.killTweensOf([root, mouth, blush, hands])
    }
  }, [isTyping, isShowingPassword])

  // ─── 遮眼时偶尔偷瞄 ─────────────────────────────────────────────────────
  useEffect(() => {
    const hands = handsRef.current
    if (!hands) return undefined
    if (!isShowingPassword) {
      if (peekTimerRef.current) window.clearTimeout(peekTimerRef.current)
      return undefined
    }
    const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches
    if (reduceMotion) return undefined

    const peek = () => {
      gsap
        .timeline()
        .to(hands, { y: 26, duration: 0.24, ease: 'power2.out' })
        .to(hands, { y: 0, duration: 0.3, ease: 'power2.in' }, '+=0.5')
      peekTimerRef.current = window.setTimeout(peek, (3 + Math.random() * 3.5) * 1000)
    }
    peekTimerRef.current = window.setTimeout(peek, 2400)

    return () => {
      if (peekTimerRef.current) window.clearTimeout(peekTimerRef.current)
      gsap.killTweensOf(hands)
    }
  }, [isShowingPassword])

  return (
    <div ref={rootRef} className="boot-peeker" aria-hidden="true">
      <svg viewBox="0 0 400 200" preserveAspectRatio="xMidYMax meet" xmlns="http://www.w3.org/2000/svg">
        <defs>
          {/* 身体同形状裁切：腮红被裁成贴边月牙 */}
          <clipPath id="peeker-body-clip">
            <path d={BODY_PATH} />
          </clipPath>
          {/* 眨眼：rect 高度动画驱动，眼球不形变 */}
          <clipPath id="peeker-blink-clip">
            <rect ref={blinkRectRef} x="0" y="0" width="400" height="200" />
          </clipPath>
          {/* 瞳孔径向渐变，高光偏左上 */}
          <radialGradient id="peeker-pupil" cx="0.42" cy="0.35" r="0.85">
            <stop offset="0%" stopColor="#3a3d45" />
            <stop offset="55%" stopColor="#1c1f25" />
            <stop offset="100%" stopColor="#0a0b0d" />
          </radialGradient>
        </defs>

        <g ref={bodyRef} style={{ transformOrigin: '200px 200px' }}>
          {/* 身体：半圆 + 下延，下半身被 viewBox 裁掉 */}
          <path d={BODY_PATH} fill="#ffde59" />

          {/* 腮红：被身体 clipPath 裁成月牙 */}
          <g ref={blushRef} clipPath="url(#peeker-body-clip)" opacity="0.55">
            <circle cx="55" cy="145" r="50" fill="#f7c92e" />
            <circle cx="345" cy="145" r="50" fill="#f7c92e" />
          </g>

          <g clipPath="url(#peeker-blink-clip)">
            {/* 眼白 */}
            <circle cx={EYE.left.cx} cy={EYE.left.cy} r={EYE.r} fill="#ffffff" />
            <circle cx={EYE.right.cx} cy={EYE.right.cy} r={EYE.r} fill="#ffffff" />
            {/* 瞳孔（整组跟随指针） */}
            <g ref={pupilsRef}>
              <circle cx={EYE.left.cx} cy={EYE.left.cy} r={EYE.pupilR} fill="url(#peeker-pupil)" />
              <circle cx={EYE.right.cx} cy={EYE.right.cy} r={EYE.pupilR} fill="url(#peeker-pupil)" />
              {/* 高光 */}
              <circle cx={EYE.left.cx - 11} cy={EYE.left.cy - 13} r="7.5" fill="#ffffff" opacity="0.92" />
              <circle cx={EYE.right.cx - 11} cy={EYE.right.cy - 13} r="7.5" fill="#ffffff" opacity="0.92" />
            </g>
          </g>

          {/* 嘴 */}
          <path
            ref={mouthRef}
            d="M 100 95 Q 140 108 180 95"
            stroke="#14161a"
            strokeWidth="3.5"
            strokeLinecap="round"
            fill="none"
          />

          {/* 遮眼的手：默认沉在下方，密码明文时抬起 */}
          <g ref={handsRef} opacity="0" style={{ transform: 'translateY(150px)' }}>
            <ellipse cx={EYE.left.cx} cy={EYE.left.cy + 4} rx="58" ry="46" fill="#ffde59" />
            <ellipse cx={EYE.right.cx} cy={EYE.right.cy + 4} rx="58" ry="46" fill="#ffde59" />
            <path
              d={`M ${EYE.left.cx - 34} ${EYE.left.cy + 22} Q ${EYE.left.cx} ${EYE.left.cy + 30} ${EYE.left.cx + 34} ${EYE.left.cy + 22}`}
              stroke="#e8c332"
              strokeWidth="3"
              strokeLinecap="round"
              fill="none"
            />
            <path
              d={`M ${EYE.right.cx - 34} ${EYE.right.cy + 22} Q ${EYE.right.cx} ${EYE.right.cy + 30} ${EYE.right.cx + 34} ${EYE.right.cy + 22}`}
              stroke="#e8c332"
              strokeWidth="3"
              strokeLinecap="round"
              fill="none"
            />
          </g>
        </g>
      </svg>
    </div>
  )
}
