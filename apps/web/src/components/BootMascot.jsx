import { useEffect, useRef } from 'react'

/**
 * 品牌吉祥物 · 工坊小扳手侠（Wrenchy）
 *
 * 跟随指针转向：头部整体做小幅偏转，眼球在眼窝内独立移动，
 * 幅度更大以放大"注视"感。移动端无指针时进入自动巡视（缓慢左右张望）。
 * 全部走 GSAP quickTo（合成器友好，无 filter blur / 无 scale）。
 */
export function BootMascot({ className = '' }) {
  const rootRef = useRef(null)
  const headRef = useRef(null)
  const eyesRef = useRef(null)
  const highlightRef = useRef(null)

  useEffect(() => {
    const root = rootRef.current
    const head = headRef.current
    const eyes = eyesRef.current
    const highlight = highlightRef.current
    if (!root || !head || !eyes) return undefined

    let disposed = false
    let cleanup = () => {}

    const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches
    if (reduceMotion) return undefined

    import('gsap')
      .then(({ gsap }) => {
        if (disposed) return

        // 头部偏转：幅度小，跟手快
        const headX = gsap.quickTo(head, 'x', { duration: 0.55, ease: 'power3.out' })
        const headY = gsap.quickTo(head, 'y', { duration: 0.55, ease: 'power3.out' })
        const headRot = gsap.quickTo(head, 'rotation', { duration: 0.7, ease: 'power3.out' })
        // 眼球：幅度大，跟手更快，制造注视感
        const eyeX = gsap.quickTo(eyes, 'x', { duration: 0.35, ease: 'power2.out' })
        const eyeY = gsap.quickTo(eyes, 'y', { duration: 0.35, ease: 'power2.out' })
        const hiX = highlight ? gsap.quickTo(highlight, 'x', { duration: 0.9, ease: 'power2.out' }) : null

        const aim = (nx, ny) => {
          // nx / ny 归一化到 [-1, 1]
          const cx = Math.max(-1, Math.min(1, nx))
          const cy = Math.max(-1, Math.min(1, ny))
          headX(cx * 7)
          headY(cy * 5)
          headRot(cx * 6)
          eyeX(cx * 5.5)
          eyeY(cy * 4)
          if (hiX) hiX(cx * -10)
        }

        const finePointer = window.matchMedia?.('(pointer: fine)')?.matches
        let idleTween = null

        if (finePointer) {
          const onMove = (event) => {
            const rect = root.getBoundingClientRect()
            if (!rect.width || !rect.height) return
            const originX = rect.left + rect.width / 2
            const originY = rect.top + rect.height / 2
            // 以吉祥物为原点，半屏范围内映射满幅
            aim(
              (event.clientX - originX) / (window.innerWidth / 2.2),
              (event.clientY - originY) / (window.innerHeight / 2.4)
            )
          }
          window.addEventListener('pointermove', onMove, { passive: true })
          cleanup = () => {
            window.removeEventListener('pointermove', onMove)
            gsap.killTweensOf([head, eyes, highlight].filter(Boolean))
          }
        } else {
          // 触屏：自动巡视，让它看起来始终活着
          const look = { v: 0 }
          idleTween = gsap.to(look, {
            v: 1,
            duration: 3.4,
            ease: 'sine.inOut',
            repeat: -1,
            yoyo: true,
            onUpdate: () => aim(look.v * 2 - 1, Math.sin(look.v * Math.PI) * 0.35)
          })
          cleanup = () => {
            idleTween?.kill()
            gsap.killTweensOf([head, eyes, highlight].filter(Boolean))
          }
        }
      })
      .catch(() => {})

    return () => {
      disposed = true
      cleanup()
    }
  }, [])

  return (
    <div ref={rootRef} className={`boot-mascot ${className}`.trim()} aria-hidden="true">
      <svg viewBox="0 0 240 240" fill="none" xmlns="http://www.w3.org/2000/svg">
        {/* 背后品牌黄光盘（无边线、纯填充） */}
        <circle cx="120" cy="120" r="94" fill="#ffde59" opacity="0.16" />
        <circle cx="120" cy="120" r="68" fill="#ffde59" opacity="0.22" />

        {/* 身体：圆润无描边 */}
        <path
          d="M120 158c26 0 46 14 46 34v14H74v-14c0-20 20-34 46-34z"
          fill="#14161a"
        />

        <g ref={headRef} style={{ transformOrigin: '120px 118px' }}>
          {/* 耳朵 */}
          <path d="M74 74l6 34 24-16z" fill="#14161a" />
          <path d="M166 74l-6 34-24-16z" fill="#14161a" />
          {/* 头部主体 */}
          <ellipse cx="120" cy="118" rx="52" ry="46" fill="#ffde59" />
          {/* 面罩浅色区（用填充深浅分层，不用线条） */}
          <ellipse cx="120" cy="130" rx="34" ry="26" fill="#fff6d1" />

          {/* 眼窝 */}
          <ellipse cx="101" cy="114" rx="11" ry="12" fill="#fffdf8" />
          <ellipse cx="139" cy="114" rx="11" ry="12" fill="#fffdf8" />

          {/* 眼球（独立跟随） */}
          <g ref={eyesRef}>
            <circle cx="101" cy="115" r="6" fill="#14161a" />
            <circle cx="139" cy="115" r="6" fill="#14161a" />
            <circle cx="103" cy="112.5" r="2" fill="#fffdf8" />
            <circle cx="141" cy="112.5" r="2" fill="#fffdf8" />
          </g>

          {/* 鼻头与笑口 */}
          <ellipse cx="120" cy="133" rx="6" ry="4.6" fill="#14161a" />
          <path
            d="M111 142c3 4.5 6 6.5 9 6.5s6-2 9-6.5"
            stroke="#14161a"
            strokeWidth="3.4"
            strokeLinecap="round"
          />

          {/* 头顶高光（随指针轻移，暗示光源） */}
          <ellipse ref={highlightRef} cx="104" cy="92" rx="16" ry="8" fill="#fffdf8" opacity="0.5" />
        </g>

        {/* 手里的扳手：品牌工坊符号 */}
        <g>
          <rect x="168" y="150" width="9" height="46" rx="4.5" fill="#14161a" transform="rotate(24 172 173)" />
          <path
            d="M186 138a11 11 0 1 0-14 12l4 9 12-5-3-9a11 11 0 0 1 1-7z"
            fill="#14161a"
          />
        </g>
      </svg>
    </div>
  )
}
