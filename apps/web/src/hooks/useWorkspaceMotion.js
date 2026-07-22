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
    const navigation = root.querySelector('[data-workspace-layer="navigation"]')
    const focus = root.querySelector('[data-workspace-layer="focus"]')
    const modules = [...root.querySelectorAll('[data-workspace-module]')]
    const targets = [environment, structure, navigation, focus, ...modules].filter(Boolean)
    completedRef.current = false
    root.dataset.workspaceAssembled = 'false'

    const reset = () => {
      timelineRef.current?.kill()
      gsap.set(targets, { clearProps: 'transform,opacity,visibility,willChange' })
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

    if (reducedMotion() || !structure || !focus) {
      timelineRef.current = gsap.to(overlay, { autoAlpha: 0, duration: 0.08, onComplete: finish })
      return () => timelineRef.current?.kill()
    }

    const ctx = gsap.context(() => {
      gsap.set(targets, { willChange: 'transform, opacity' })
      gsap.set(environment, { autoAlpha: 0 })
      gsap.set(structure, { autoAlpha: 0.01, x: 26 })
      gsap.set(navigation, { autoAlpha: 0.01, x: -22 })
      gsap.set(focus, { autoAlpha: 0.01, y: 18 })
      gsap.set(modules, { autoAlpha: 0.01, y: 12 })
      timelineRef.current = gsap.timeline({ defaults: { ease: 'power4.out' }, onComplete: finish })
        .to(environment, { autoAlpha: 1, duration: 0.18 }, 0)
        .to(structure, { autoAlpha: 1, x: 0, duration: 0.34 }, 0.04)
        .to(navigation, { autoAlpha: 1, x: 0, duration: 0.3 }, 0.1)
        .to(focus, { autoAlpha: 1, y: 0, duration: 0.32 }, 0.16)
        .to(modules, { autoAlpha: 1, y: 0, duration: 0.28, stagger: 0.035 }, 0.22)
        .to(overlay, { autoAlpha: 0, duration: 0.16, ease: 'power2.out' }, 0.58)
    }, root)

    return () => {
      timelineRef.current?.kill()
      ctx.revert()
    }
  }, [active, onComplete, rootRef])

  return { skip }
}
