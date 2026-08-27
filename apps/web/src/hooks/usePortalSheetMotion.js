import { useEffect, useRef, useState } from 'react'
import { gsap } from 'gsap'

function reducedMotion() {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches || false
}

// Portal 抽屉通用进出场（GSAP）：open 翻 true 立即挂载并播入场；
// 翻 false 先播退场、完成后再卸载；退场途中重开则打断退场直接续播入场。
// 返回 { mounted, backdropRef, panelRef }——backdrop 与 panel 挂 ref 即可。
// reduced-motion：直挂直卸，不播 tween。
export default function usePortalSheetMotion({ open, enter = .34, exit = .22 }) {
  const [mounted, setMounted] = useState(false)
  const backdropRef = useRef(null)
  const panelRef = useRef(null)
  const timelineRef = useRef(null)
  const openRef = useRef(open)
  openRef.current = open

  // 卸载路径：open=false 且当前已挂载 → 播退场，完成后卸载
  useEffect(() => {
    if (open) {
      setMounted(true)
      return undefined
    }
    const backdrop = backdropRef.current
    const panel = panelRef.current
    if (!mounted || !backdrop || !panel || reducedMotion()) {
      setMounted(false)
      return undefined
    }
    timelineRef.current?.kill()
    const timeline = gsap.timeline({ onComplete: () => { if (!openRef.current) setMounted(false) } })
    timeline.to(panel,
      { autoAlpha: 0, yPercent: 9, duration: exit, ease: 'power2.in', clearProps: 'transform,opacity,visibility' },
      0
    )
    timeline.to(backdrop,
      { autoAlpha: 0, duration: exit + .04, ease: 'power2.in', clearProps: 'opacity,visibility' },
      0
    )
    timelineRef.current = timeline
    return () => timeline.kill()
  }, [open, mounted, exit])

  // 进场路径：挂载后播入场（重开打断退场的场景也会走到这里）
  useEffect(() => {
    if (!mounted || !open) return undefined
    const backdrop = backdropRef.current
    const panel = panelRef.current
    if (!backdrop || !panel) return undefined
    if (reducedMotion()) {
      gsap.set([backdrop, panel], { clearProps: 'transform,opacity,visibility' })
      return undefined
    }
    timelineRef.current?.kill()
    const timeline = gsap.timeline()
      .fromTo(backdrop, { autoAlpha: 0 }, { autoAlpha: 1, duration: enter * .75, ease: 'power2.out', clearProps: 'opacity,visibility' }, 0)
      .fromTo(panel, { autoAlpha: 0, yPercent: 9 }, { autoAlpha: 1, yPercent: 0, duration: enter, ease: 'expo.out', clearProps: 'transform,opacity,visibility' }, 0)
    timelineRef.current = timeline
    return () => timeline.kill()
  }, [mounted, open, enter])

  return { mounted, backdropRef, panelRef }
}
