import { useCallback, useLayoutEffect, useRef } from 'react'
import { gsap } from 'gsap'

function reducedMotion() { return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches || false }

export default function useWorkspaceMotion({ active, rootRef, onComplete, staticMode = false }) {
  const timelineRef = useRef(null)
  const finishRef = useRef(() => {})
  const completedRef = useRef(false)
  const skip = useCallback(() => finishRef.current(), [])

  useLayoutEffect(() => {
    if (!active || !rootRef.current) return undefined
    const root = rootRef.current
    const overlay = document.querySelector('[data-workspace-launch-overlay]')
    const bands = [...(overlay?.querySelectorAll('[data-workspace-transition-bands] > i') || [])]
    const title = overlay?.querySelector('[data-workspace-transition-title]')
    const navigation = [...root.querySelectorAll('[data-workspace-layer="navigation"]')]
    const structure = root.querySelector('[data-workspace-layer="structure"]')
    const targets = [structure, ...navigation].filter(Boolean)
    completedRef.current = false
    root.dataset.workspaceAssembled = 'false'
    const reset = () => {
      timelineRef.current?.kill()
      gsap.set([...targets, ...bands, title].filter(Boolean), { clearProps: 'transform,opacity,visibility,willChange,filter' })
      if (overlay) gsap.set(overlay, { clearProps: 'opacity,visibility,pointerEvents' })
      root.dataset.workspaceAssembled = 'true'
    }
    const finish = () => { if (completedRef.current) return; completedRef.current = true; reset(); onComplete() }
    finishRef.current = finish
    if (staticMode || reducedMotion() || !overlay || !structure || bands.length !== 4) {
      if (overlay) gsap.set(overlay, { autoAlpha: 0, pointerEvents: 'none' })
      finish()
      return undefined
    }
    const timeline = gsap.timeline({ onComplete: finish })
      .set(targets, { autoAlpha: 1 }, 0)
      .set(bands, { scaleX: 1, transformOrigin: '100% 50%', willChange: 'transform' }, 0)
      .fromTo(title, { autoAlpha: 0, yPercent: 120, filter: 'blur(10px)' }, { autoAlpha: 1, yPercent: 0, filter: 'blur(0px)', duration: 1.2, ease: 'power3.out' }, 0.08)
      .fromTo(navigation, { yPercent: -150, skewX: -10, skewY: -5 }, { yPercent: 0, skewX: 0, skewY: 0, duration: 2.1, ease: 'cubic-bezier(.69,0,0,1)' }, 0.16)
      .to(title, { autoAlpha: 0, yPercent: -80, duration: 0.6, ease: 'power2.in' }, 1.0)
      .to(bands.slice().reverse(), { scaleX: 0, duration: 0.9, stagger: 0.15, ease: 'cubic-bezier(.6,0,.05,1)' }, 1.0)
      .to(overlay, { autoAlpha: 0, duration: 0.15 }, 2.36)
    timelineRef.current = timeline
    return () => timeline.kill()
  }, [active, onComplete, rootRef, staticMode])
  return { skip }
}
