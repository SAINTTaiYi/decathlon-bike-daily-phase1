import { useEffect, useRef } from 'react'
import { gsap } from 'gsap'

/**
 * 登录页四角色互动插画。
 *
 * 行为对齐原始复刻实现（katavii/animated-login @ 62f0b80）：
 * - 眼球跟随指针，位移经过 clamp 防止瞳孔越出眼白
 * - 身体 skewX 反向偏移，鼠标在右则身体左倾，模拟「歪头看」
 * - 输入用户名时紫色角色拔高并与黑色角色对视
 * - 密码有值未显示时紫色角色移开视线
 * - 密码明文时四个角色一起回避，紫色角色随机偷瞄
 * - 紫/黑角色随机间隔眨眼
 *
 * 所有位移使用 transform / GSAP quickTo，不触发重排，不使用 filter blur。
 */

const PUPIL_DEFAULT_MAX = 5
const EYEBALL_DEFAULT_MAX = 10

function Pupil({ size = 12, maxDistance = PUPIL_DEFAULT_MAX, pupilColor = '#14161a' }) {
  return (
    <span
      className="boot-char-pupil"
      data-max-distance={maxDistance}
      style={{ width: size, height: size, backgroundColor: pupilColor }}
    />
  )
}

function EyeBall({
  size = 48,
  pupilSize = 16,
  maxDistance = EYEBALL_DEFAULT_MAX,
  eyeColor = '#ffffff',
  pupilColor = '#14161a',
}) {
  return (
    <span
      className="boot-char-eyeball"
      data-max-distance={maxDistance}
      style={{ width: size, height: size, backgroundColor: eyeColor, '--boot-char-lid': pupilColor }}
    >
      <span
        className="boot-char-eyeball-pupil"
        style={{ width: pupilSize, height: pupilSize, backgroundColor: pupilColor }}
      />
    </span>
  )
}

export function BootCharacters({ isTyping = false, showPassword = false, passwordLength = 0 }) {
  const containerRef = useRef(null)
  const mouseRef = useRef({ x: 0, y: 0 })
  const hasPointerRef = useRef(false)
  const rafIdRef = useRef(0)

  const purpleRef = useRef(null)
  const blackRef = useRef(null)
  const yellowRef = useRef(null)
  const orangeRef = useRef(null)

  const purpleFaceRef = useRef(null)
  const blackFaceRef = useRef(null)
  const yellowFaceRef = useRef(null)
  const orangeFaceRef = useRef(null)
  const yellowMouthRef = useRef(null)

  const purpleBlinkTimerRef = useRef(null)
  const blackBlinkTimerRef = useRef(null)
  const purplePeekTimerRef = useRef(null)
  const lookingTimerRef = useRef(null)
  const isLookingRef = useRef(false)
  const quickToRef = useRef(null)

  const isHidingPassword = passwordLength > 0 && !showPassword
  const isShowingPassword = passwordLength > 0 && showPassword

  const stateRef = useRef({ isTyping, isHidingPassword, isShowingPassword, isLooking: false })
  stateRef.current = {
    isTyping,
    isHidingPassword,
    isShowingPassword,
    isLooking: isLookingRef.current,
  }

  // ─── 主循环：指针跟随 + 身体倾斜 ──────────────────────────────────────────
  useEffect(() => {
    const purple = purpleRef.current
    const black = blackRef.current
    const yellow = yellowRef.current
    const orange = orangeRef.current
    const purpleFace = purpleFaceRef.current
    const blackFace = blackFaceRef.current
    const yellowFace = yellowFaceRef.current
    const orangeFace = orangeFaceRef.current
    const yellowMouth = yellowMouthRef.current
    const container = containerRef.current
    if (!purple || !black || !yellow || !orange) return
    if (!purpleFace || !blackFace || !yellowFace || !orangeFace || !yellowMouth) return
    if (!container) return

    const reduceMotion =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

    gsap.set(container.querySelectorAll('.boot-char-pupil'), { x: 0, y: 0 })
    gsap.set(container.querySelectorAll('.boot-char-eyeball-pupil'), { x: 0, y: 0 })

    if (reduceMotion) return

    const tween = (el, prop, duration = 0.3) =>
      gsap.quickTo(el, prop, { duration, ease: 'power2.out' })

    const qt = {
      purpleSkew: tween(purple, 'skewX'),
      blackSkew: tween(black, 'skewX'),
      orangeSkew: tween(orange, 'skewX'),
      yellowSkew: tween(yellow, 'skewX'),
      purpleX: tween(purple, 'x'),
      blackX: tween(black, 'x'),
      purpleHeight: tween(purple, 'height'),
      purpleFaceLeft: tween(purpleFace, 'left'),
      purpleFaceTop: tween(purpleFace, 'top'),
      blackFaceLeft: tween(blackFace, 'left'),
      blackFaceTop: tween(blackFace, 'top'),
      orangeFaceX: tween(orangeFace, 'x', 0.2),
      orangeFaceY: tween(orangeFace, 'y', 0.2),
      yellowFaceX: tween(yellowFace, 'x', 0.2),
      yellowFaceY: tween(yellowFace, 'y', 0.2),
      mouthX: tween(yellowMouth, 'x', 0.2),
      mouthY: tween(yellowMouth, 'y', 0.2),
    }
    quickToRef.current = qt

    const clamp = (value, limit) => Math.max(-limit, Math.min(limit, value))

    const calcPos = (el) => {
      const rect = el.getBoundingClientRect()
      const cx = rect.left + rect.width / 2
      const cy = rect.top + rect.height / 3
      const dx = mouseRef.current.x - cx
      const dy = mouseRef.current.y - cy
      return {
        faceX: clamp(dx / 20, 15),
        faceY: clamp(dy / 30, 10),
        bodySkew: clamp(-dx / 120, 6),
      }
    }

    const calcEyePos = (el, maxDist) => {
      const rect = el.getBoundingClientRect()
      const cx = rect.left + rect.width / 2
      const cy = rect.top + rect.height / 2
      const dx = mouseRef.current.x - cx
      const dy = mouseRef.current.y - cy
      const dist = Math.min(Math.hypot(dx, dy), maxDist)
      const angle = Math.atan2(dy, dx)
      return { x: Math.cos(angle) * dist, y: Math.sin(angle) * dist }
    }

    const tick = () => {
      rafIdRef.current = requestAnimationFrame(tick)
      if (!hasPointerRef.current) return

      const { isTyping: typing, isHidingPassword: hiding, isShowingPassword: showing, isLooking: looking } =
        stateRef.current

      if (!showing) {
        const pp = calcPos(purple)
        if (typing || hiding) {
          qt.purpleSkew(pp.bodySkew - 12)
          qt.purpleX(40)
          qt.purpleHeight(440)
        } else {
          qt.purpleSkew(pp.bodySkew)
          qt.purpleX(0)
          qt.purpleHeight(400)
        }

        const bp = calcPos(black)
        if (looking) {
          qt.blackSkew(bp.bodySkew * 1.5 + 10)
          qt.blackX(20)
        } else {
          qt.blackSkew(bp.bodySkew * 1.5)
          qt.blackX(0)
        }

        qt.orangeSkew(calcPos(orange).bodySkew)
        qt.yellowSkew(calcPos(yellow).bodySkew)

        if (!looking) {
          const faceX = pp.faceX >= 0 ? Math.min(25, pp.faceX * 1.5) : pp.faceX
          qt.purpleFaceLeft(45 + faceX)
          qt.purpleFaceTop(40 + pp.faceY)
          qt.blackFaceLeft(26 + bp.faceX)
          qt.blackFaceTop(32 + bp.faceY)
        }

        const op = calcPos(orange)
        qt.orangeFaceX(op.faceX)
        qt.orangeFaceY(op.faceY)

        const yp = calcPos(yellow)
        qt.yellowFaceX(yp.faceX)
        qt.yellowFaceY(yp.faceY)
        qt.mouthX(yp.faceX)
        qt.mouthY(yp.faceY)

        container.querySelectorAll('.boot-char-pupil').forEach((el) => {
          const maxDist = Number(el.dataset.maxDistance) || PUPIL_DEFAULT_MAX
          const pos = calcEyePos(el, maxDist)
          gsap.set(el, { x: pos.x, y: pos.y })
        })

        if (!looking) {
          container.querySelectorAll('.boot-char-eyeball').forEach((el) => {
            const pupil = el.querySelector('.boot-char-eyeball-pupil')
            if (!pupil) return
            const maxDist = Number(el.dataset.maxDistance) || EYEBALL_DEFAULT_MAX
            const pos = calcEyePos(el, maxDist)
            gsap.set(pupil, { x: pos.x, y: pos.y })
          })
        }
      }
    }

    const onMove = (event) => {
      mouseRef.current.x = event.clientX
      mouseRef.current.y = event.clientY
      hasPointerRef.current = true
    }

    window.addEventListener('pointermove', onMove, { passive: true })
    rafIdRef.current = requestAnimationFrame(tick)

    return () => {
      window.removeEventListener('pointermove', onMove)
      cancelAnimationFrame(rafIdRef.current)
      quickToRef.current = null
    }
  }, [])

  // ─── 随机眨眼 ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    ) {
      return undefined
    }

    if (isHidingPassword) return undefined

    const schedule = (holder, timerRef, fallbackSize) => {
      const eyeballs = holder.current?.querySelectorAll('.boot-char-eyeball')
      if (!eyeballs?.length) return
      const run = () => {
        timerRef.current = setTimeout(() => {
          eyeballs.forEach((el) => {
            gsap.to(el, { height: 2, duration: 0.08, ease: 'power2.in' })
          })
          setTimeout(() => {
            eyeballs.forEach((el) => {
              const size = Number.parseFloat(el.style.width) || fallbackSize
              gsap.to(el, { height: size, duration: 0.08, ease: 'power2.out' })
            })
            run()
          }, 150)
        }, Math.random() * 4000 + 3000)
      }
      run()
    }

    schedule(purpleRef, purpleBlinkTimerRef, 18)
    schedule(blackRef, blackBlinkTimerRef, 16)

    return () => {
      clearTimeout(purpleBlinkTimerRef.current)
      clearTimeout(blackBlinkTimerRef.current)
    }
  }, [isHidingPassword])

  // ─── 输入时紫黑对视 ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!(isTyping && !isShowingPassword)) {
      clearTimeout(lookingTimerRef.current)
      isLookingRef.current = false
      return undefined
    }

    isLookingRef.current = true
    const qt = quickToRef.current
    if (qt) {
      qt.purpleFaceLeft(55)
      qt.purpleFaceTop(65)
      qt.blackFaceLeft(32)
      qt.blackFaceTop(12)
    }
    purpleRef.current?.querySelectorAll('.boot-char-eyeball-pupil').forEach((p) => {
      gsap.to(p, { x: 3, y: 4, duration: 0.3, ease: 'power2.out', overwrite: 'auto' })
    })
    blackRef.current?.querySelectorAll('.boot-char-eyeball-pupil').forEach((p) => {
      gsap.to(p, { x: 0, y: -4, duration: 0.3, ease: 'power2.out', overwrite: 'auto' })
    })

    clearTimeout(lookingTimerRef.current)
    lookingTimerRef.current = setTimeout(() => {
      isLookingRef.current = false
      purpleRef.current?.querySelectorAll('.boot-char-eyeball-pupil').forEach((p) => {
        gsap.killTweensOf(p)
      })
    }, 800)

    return () => clearTimeout(lookingTimerRef.current)
  }, [isTyping, isShowingPassword])

  // ─── 密码状态：隐藏时移开视线 / 明文时集体回避 ──────────────────────────
  useEffect(() => {
    const qt = quickToRef.current
    if (!qt) return

    if (isShowingPassword) {
      qt.purpleSkew(0)
      qt.blackSkew(0)
      qt.orangeSkew(0)
      qt.yellowSkew(0)
      qt.purpleX(0)
      qt.blackX(0)
      qt.purpleHeight(400)
      qt.purpleFaceLeft(20)
      qt.purpleFaceTop(35)
      qt.blackFaceLeft(10)
      qt.blackFaceTop(28)
      qt.orangeFaceX(50 - 82)
      qt.orangeFaceY(85 - 90)
      qt.yellowFaceX(20 - 52)
      qt.yellowFaceY(35 - 40)
      qt.mouthX(10 - 40)
      qt.mouthY(0)

      const avert = (holder, selector, x, y) => {
        holder.current?.querySelectorAll(selector).forEach((p) => {
          gsap.to(p, { x, y, duration: 0.3, ease: 'power2.out', overwrite: 'auto' })
        })
      }
      avert(purpleRef, '.boot-char-eyeball-pupil', -4, -4)
      avert(blackRef, '.boot-char-eyeball-pupil', -4, -4)
      avert(orangeRef, '.boot-char-pupil', -5, -4)
      avert(yellowRef, '.boot-char-pupil', -5, -4)
    } else if (isHidingPassword) {
      qt.purpleFaceLeft(55)
      qt.purpleFaceTop(65)
    }
  }, [isShowingPassword, isHidingPassword])

  // ─── 密码输入且未明文：四角色闭眼 ─────────────────────────────────────────
  useEffect(() => {
    const container = containerRef.current
    if (!container) return undefined

    const lids = container.querySelectorAll('.boot-char-pupil, .boot-char-eyeball')
    if (!lids.length) return undefined

    if (isHidingPassword) {
      clearTimeout(purpleBlinkTimerRef.current)
      clearTimeout(blackBlinkTimerRef.current)
      lids.forEach((el) => {
        el.dataset.shut = 'true'
      })
      return () => {
        lids.forEach((el) => {
          delete el.dataset.shut
        })
      }
    }

    lids.forEach((el) => {
      delete el.dataset.shut
    })
    return undefined
  }, [isHidingPassword])

  // ─── 密码明文时紫色角色随机偷瞄 ───────────────────────────────────────────
  useEffect(() => {
    if (!isShowingPassword) {
      clearTimeout(purplePeekTimerRef.current)
      return undefined
    }

    const pupils = purpleRef.current?.querySelectorAll('.boot-char-eyeball-pupil')
    if (!pupils?.length) return undefined

    const run = () => {
      purplePeekTimerRef.current = setTimeout(() => {
        pupils.forEach((p) => {
          gsap.to(p, { x: 4, y: 5, duration: 0.3, ease: 'power2.out', overwrite: 'auto' })
        })
        const qt = quickToRef.current
        if (qt) {
          qt.purpleFaceLeft(20)
          qt.purpleFaceTop(35)
        }
        setTimeout(() => {
          pupils.forEach((p) => {
            gsap.to(p, { x: -4, y: -4, duration: 0.3, ease: 'power2.out', overwrite: 'auto' })
          })
          run()
        }, 800)
      }, Math.random() * 3000 + 2000)
    }
    run()

    return () => clearTimeout(purplePeekTimerRef.current)
  }, [isShowingPassword])

  return (
    <div ref={containerRef} className="boot-characters" aria-hidden="true">
      <div className="boot-characters-stage">
        <div ref={purpleRef} className="boot-char boot-char-purple">
          <div ref={purpleFaceRef} className="boot-char-face boot-char-face-purple">
            <EyeBall size={18} pupilSize={7} maxDistance={4} />
            <EyeBall size={18} pupilSize={7} maxDistance={4} />
          </div>
        </div>

        <div ref={blackRef} className="boot-char boot-char-black">
          <div ref={blackFaceRef} className="boot-char-face boot-char-face-black">
            <EyeBall size={16} pupilSize={6} maxDistance={4} />
            <EyeBall size={16} pupilSize={6} maxDistance={4} />
          </div>
        </div>

        <div ref={orangeRef} className="boot-char boot-char-orange">
          <div ref={orangeFaceRef} className="boot-char-face boot-char-face-orange">
            <Pupil size={11} maxDistance={5} />
            <Pupil size={11} maxDistance={5} />
          </div>
        </div>

        <div ref={yellowRef} className="boot-char boot-char-yellow">
          <div ref={yellowFaceRef} className="boot-char-face boot-char-face-yellow">
            <Pupil size={11} maxDistance={5} />
            <Pupil size={11} maxDistance={5} />
          </div>
          <div ref={yellowMouthRef} className="boot-char-mouth" />
        </div>
      </div>
    </div>
  )
}

export default BootCharacters
