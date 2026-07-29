import { useCallback, useLayoutEffect, useRef } from 'react'
import { gsap } from 'gsap'

function reducedMotion() {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches || false
}

export default function useWorkspaceMotion({ active, rootRef, onComplete }) {
  const timelineRef = useRef(null)
  const finishRef = useRef(() => {})
  const completedRef = useRef(false)
  const skip = useCallback(() => finishRef.current(), [])

  useLayoutEffect(() => {
    if (!active || !rootRef.current) return undefined
    const root = rootRef.current
    const overlay = document.querySelector('[data-workspace-launch-overlay]')
    const environment = root.querySelector('[data-workspace-layer="environment"]')
    const structure = root.querySelector('[data-workspace-layer="structure"]')
    const navigation = [...root.querySelectorAll('[data-workspace-layer="navigation"]')]
    const module = root.querySelector('[data-module-stage][data-active="true"]')
    const dock = root.querySelector('[data-workspace-layer="dock"]')
    const targets = [environment, structure, ...navigation, module, dock].filter(Boolean)

    completedRef.current = false
    root.dataset.workspaceAssembled = 'false'
    const reset = () => {
      timelineRef.current?.kill()
      gsap.set(targets, { clearProps: 'transform,opacity,visibility,willChange,clipPath' })
      if (overlay) gsap.set(overlay, { clearProps: 'opacity,visibility,pointerEvents,willChange' })
      root.dataset.workspaceAssembled = 'true'
    }
    const finish = () => {
      if (completedRef.current) return
      completedRef.current = true
      reset()
      onComplete()
    }
    finishRef.current = finish

    if (reducedMotion() || !structure || !module) {
      const fade = gsap.to(overlay, { autoAlpha: 0, duration: .12, ease: 'power2.out', onComplete: finish })
      timelineRef.current = fade
      return () => fade.kill()
    }

    const timeline = gsap.timeline({ defaults: { ease: 'power3.out' }, onComplete: finish })
      .set(targets, { willChange: 'transform, opacity' })
      .fromTo(environment, { autoAlpha: 0 }, { autoAlpha: 1, duration: .24 }, 0)
      .fromTo(navigation, { autoAlpha: 0, y: -8 }, { autoAlpha: 1, y: 0, duration: .32, stagger: .035 }, .06)
      .fromTo(structure, { autoAlpha: 0, y: 12 }, { autoAlpha: 1, y: 0, duration: .38 }, .12)
      .fromTo(module, { autoAlpha: 0, y: 14, clipPath: 'inset(0 0 100% 0)' }, { autoAlpha: 1, y: 0, clipPath: 'inset(0 0 0% 0)', duration: .42 }, .16)
      .fromTo(dock, { autoAlpha: 0, y: 10 }, { autoAlpha: 1, y: 0, duration: .3 }, .22)
      .to(overlay, { autoAlpha: 0, duration: .16, ease: 'power2.out' }, .46)
    timelineRef.current = timeline
    return () => timeline.kill()
  }, [active, onComplete, rootRef])

  return { skip }
}
