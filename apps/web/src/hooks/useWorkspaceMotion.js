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
    const module = root.querySelector('[data-workspace-module][data-active="true"]')
    const dock = root.querySelector('[data-workspace-layer="dock"]')
    const targets = [environment, structure, ...navigation, module, dock].filter(Boolean)

    completedRef.current = false
    root.dataset.workspaceAssembled = 'false'
    const reset = () => {
      timelineRef.current?.kill()
      gsap.set(targets, { clearProps: 'transform,opacity,visibility,filter,willChange' })
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

    const timeline = gsap.timeline({ defaults: { ease: 'expo.out' }, onComplete: finish })
      .set(targets, { willChange: 'transform, opacity, filter' })
      .fromTo(environment, { autoAlpha: 0, filter: 'blur(8px)' }, { autoAlpha: 1, filter: 'blur(0px)', duration: .26 }, 0)
      .fromTo(navigation, { autoAlpha: 0, y: -8, filter: 'blur(5px)' }, { autoAlpha: 1, y: 0, filter: 'blur(0px)', duration: .34, stagger: .035 }, .06)
      .fromTo(structure, { autoAlpha: 0, y: 14, filter: 'blur(14px)' }, { autoAlpha: 1, y: 0, filter: 'blur(0px)', duration: .44 }, .12)
      .fromTo(module, { autoAlpha: 0, y: 12, filter: 'blur(12px)' }, { autoAlpha: 1, y: 0, filter: 'blur(0px)', duration: .4 }, .16)
      .fromTo(dock, { autoAlpha: 0, y: 10, filter: 'blur(6px)' }, { autoAlpha: 1, y: 0, filter: 'blur(0px)', duration: .32 }, .24)
      .to(overlay, { autoAlpha: 0, duration: .16, ease: 'power2.out' }, .48)
    timelineRef.current = timeline
    return () => timeline.kill()
  }, [active, onComplete, rootRef])

  return { skip }
}
