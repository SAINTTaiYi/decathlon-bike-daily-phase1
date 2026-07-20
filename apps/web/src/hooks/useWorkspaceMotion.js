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
    const focus = root.querySelector('[data-workspace-layer="focus"]')
    const modules = [...root.querySelectorAll('[data-workspace-module]')]
    const dock = root.querySelector('[data-workspace-layer="dock"]')
    const targets = [environment, structure, ...navigation, focus, ...modules, dock].filter(Boolean)
    const reduced = reducedMotion()

    completedRef.current = false
    root.dataset.workspaceAssembled = 'false'

    const reset = () => {
      timelineRef.current?.kill()
      gsap.set(targets, { clearProps: 'transform,filter,opacity,visibility,willChange' })
      if (overlay) gsap.set(overlay, { clearProps: 'opacity,visibility,pointerEvents,willChange' })
      gsap.set(root, { clearProps: 'perspective,transformStyle' })
      root.dataset.workspaceAssembled = 'true'
    }

    const finish = () => {
      if (completedRef.current) return
      completedRef.current = true
      reset()
      onComplete()
    }
    finishRef.current = finish

    if (reduced || !environment || !structure || !focus) {
      const shortFade = gsap.to(overlay, {
        autoAlpha: 0,
        duration: 0.2,
        ease: 'power2.out',
        onComplete: finish
      })
      timelineRef.current = shortFade
      return () => shortFade.kill()
    }

    const ctx = gsap.context(() => {
      gsap.set(root, { perspective: 1180, transformStyle: 'preserve-3d' })
      gsap.set(targets, { willChange: 'transform, opacity, filter' })
      gsap.set(environment, { autoAlpha: 0.65, scale: 1.025, filter: 'blur(8px)' })
      gsap.set(structure, { autoAlpha: 0.01, y: 22, z: -70, rotationX: 1.5, transformStyle: 'preserve-3d' })
      gsap.set(navigation, { autoAlpha: 0.01, x: 24, y: -8, z: -32 })
      gsap.set(focus, { autoAlpha: 0.01, y: 34, z: -95, rotationX: 3.5, scale: 0.975 })
      gsap.set(modules, { autoAlpha: 0.01, y: 24, z: -52, rotationX: 1.5 })
      if (dock) gsap.set(dock, { autoAlpha: 0.01, y: 20, z: 28 })

      timelineRef.current = gsap.timeline({
        defaults: { ease: 'power4.out' },
        onComplete: finish
      })
        .addLabel('prepare', 0)
        .to(environment, { autoAlpha: 1, scale: 1, filter: 'blur(0px)', duration: 0.5 }, 'prepare+=0.12')
        .addLabel('structure', 0.18)
        .to(structure, { autoAlpha: 1, y: 0, z: 0, rotationX: 0, duration: 0.62 }, 'structure')
        .addLabel('navigation', 0.42)
        .to(navigation, { autoAlpha: 1, x: 0, y: 0, z: 0, duration: 0.56, ease: 'expo.out', stagger: 0.05 }, 'navigation')
        .addLabel('focus', 0.72)
        .to(focus, { autoAlpha: 1, y: 0, z: 0, rotationX: 0, scale: 1, duration: 0.72 }, 'focus')
        .addLabel('content', 0.98)
        .to(modules, { autoAlpha: 1, y: 0, z: 0, rotationX: 0, duration: 0.54, stagger: 0.055 }, 'content')
        .to(dock, { autoAlpha: 1, y: 0, z: 0, duration: 0.48 }, 'content+=0.2')
        .addLabel('lock', 1.52)
        .to(focus, { y: -2, scale: 1.012, duration: 0.22, ease: 'sine.inOut' }, 'lock')
        .to(focus, { y: 0, scale: 1, duration: 0.3, ease: 'sine.inOut' }, 'lock+=0.22')
        .to(overlay, { autoAlpha: 0, duration: 0.26, ease: 'power2.out' }, 2.1)
    }, root)

    return () => {
      timelineRef.current?.kill()
      ctx.revert()
    }
  }, [active, onComplete, rootRef])

  return { skip }
}
