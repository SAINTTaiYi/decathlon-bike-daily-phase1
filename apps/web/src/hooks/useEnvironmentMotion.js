import { useEffect } from 'react'
import { gsap } from 'gsap'

function reducedMotion() {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches || false
}

// Crextio 风格环境渐变光斑的运动控制（光斑本体在 App.jsx 的 environment 层）。
// - 呼吸漂移：每个光斑极慢的 xPercent/yPercent 往返漂移（30-50s），
//   形成"几乎察觉不到但活着"的流动感；纯 transform，走合成器
// - 模块切换：监听 workshop-ambient 事件（转场钩子派发），整个环境层
//   沿切换方向轻推一下 + 亮度脉冲，让背景跟随操作
// - 弹窗联动：body.dialog-open 出现/消失时环境层变暗/恢复
// - 桌面指针视差：pointer:fine 时各光斑按指针位置缓动偏移（不同系数形成纵深）
// reduced-motion：不漂移、无视差、无脉冲，仅保留弹窗变暗。
export default function useEnvironmentMotion({ enabled, rootRef }) {
  useEffect(() => {
    if (!enabled) return undefined
    const env = rootRef.current?.querySelector('.workspace-environment')
    if (!env) return undefined
    const blobs = [...env.querySelectorAll('.env-blob')]
    if (!blobs.length) return undefined
    const reduced = reducedMotion()
    const drifts = []

    if (!reduced) {
      const driftSpec = [
        { x: 5, y: -4, dur: 32 },
        { x: -4.5, y: 4, dur: 41 },
        { x: 3.5, y: 5, dur: 49 }
      ]
      blobs.forEach((blob, index) => {
        const spec = driftSpec[index % driftSpec.length]
        drifts.push(gsap.to(blob, {
          xPercent: spec.x, yPercent: spec.y,
          duration: spec.dur, ease: 'sine.inOut', repeat: -1, yoyo: true
        }))
      })
    }

    const onAmbient = (event) => {
      if (reduced) return
      const direction = event?.detail?.direction === -1 ? -1 : 1
      gsap.killTweensOf(env, 'x,opacity')
      gsap.fromTo(env,
        { x: direction * 16 },
        { x: 0, duration: .85, ease: 'expo.out' }
      )
      gsap.fromTo(env, { opacity: .9 }, { opacity: 1, duration: .55, ease: 'expo.out', overwrite: 'auto' })
    }
    window.addEventListener('workshop-ambient', onAmbient)

    // 弹窗打开时压暗环境（与 AppDialog 的 body.dialog-open 联动）
    const dimObserver = new MutationObserver(() => {
      const dimmed = document.body.classList.contains('dialog-open')
      gsap.to(env, { opacity: dimmed ? .55 : 1, duration: .35, ease: 'expo.out', overwrite: 'auto' })
    })
    dimObserver.observe(document.body, { attributes: true, attributeFilter: ['class'] })

    // 桌面指针视差（触屏/无精确指针设备不启用）
    let parallaxCleanup = () => {}
    if (!reduced && window.matchMedia?.('(pointer: fine)').matches) {
      const quick = blobs.map((blob, index) => ({
        x: gsap.quickTo(blob, 'x', { duration: 1 + index * .25, ease: 'power2.out' }),
        y: gsap.quickTo(blob, 'y', { duration: 1 + index * .25, ease: 'power2.out' })
      }))
      const onMove = (event) => {
        const nx = event.clientX / window.innerWidth - .5
        const ny = event.clientY / window.innerHeight - .5
        quick.forEach((pair, index) => {
          pair.x(nx * (12 + index * 9))
          pair.y(ny * (9 + index * 7))
        })
      }
      window.addEventListener('pointermove', onMove, { passive: true })
      parallaxCleanup = () => window.removeEventListener('pointermove', onMove)
    }

    return () => {
      drifts.forEach((tween) => tween.kill())
      gsap.killTweensOf([env, ...blobs])
      window.removeEventListener('workshop-ambient', onAmbient)
      dimObserver.disconnect()
      parallaxCleanup()
      gsap.set(env, { clearProps: 'transform,opacity' })
      blobs.forEach((blob) => gsap.set(blob, { clearProps: 'transform' }))
    }
  }, [enabled, rootRef])
}
