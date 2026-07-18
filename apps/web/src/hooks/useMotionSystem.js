import { useEffect, useLayoutEffect } from 'react'
import { gsap } from 'gsap'
import { animate } from 'animejs/animation'

const profiles = {
  header: { x: 0, y: -12, clipPath: 'inset(0 0 100% 0)', duration: .42 },
  summary: { x: 0, y: 18, clipPath: 'inset(0 0 16% 0)', duration: .52 },
  photo: { x: -18, y: 0, clipPath: 'inset(0 100% 0 0)', duration: .68 },
  title: { x: 0, y: 14, clipPath: 'inset(0 0 12% 0)', duration: .46 },
  data: { x: 0, y: 16, clipPath: 'inset(0 0 14% 0)', duration: .48 },
  row: { x: 16, y: 0, clipPath: 'inset(0 0 0 10%)', duration: .42 },
  dock: { x: 0, y: 24, clipPath: 'inset(100% 0 0 0)', duration: .48 }
}

export default function useMotionSystem(enabled) {
  useLayoutEffect(() => {
    if (!enabled) return undefined
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    const elements = [...document.querySelectorAll('[data-motion]')]
    if (reduced || !('IntersectionObserver' in window)) {
      gsap.set(elements, { autoAlpha: 1, x: 0, y: 0, clipPath: 'none', filter: 'none' })
      return undefined
    }

    const observer = new IntersectionObserver((entries) => entries.forEach((entry) => {
      if (!entry.isIntersecting) return
      const target = entry.target
      const profile = profiles[target.dataset.motion] || profiles.row
      const rowDirection = elements.indexOf(target) % 2 && target.dataset.motion === 'row' ? -profile.x : profile.x
      gsap.fromTo(target,
        { autoAlpha: .001, x: rowDirection, y: profile.y, clipPath: profile.clipPath, filter: 'blur(6px)' },
        { autoAlpha: 1, x: 0, y: 0, clipPath: 'inset(0 0 0 0)', filter: 'blur(0px)', duration: profile.duration, ease: 'expo.out', clearProps: 'transform,filter,clipPath,opacity,visibility' }
      )
      if (target.dataset.motion === 'photo') gsap.fromTo(target.querySelector('img'), { scale: 1.08 }, { scale: 1.018, duration: .72, ease: 'expo.out', clearProps: 'transform' })
      observer.unobserve(target)
    }), { rootMargin: '0px 0px -8% 0px', threshold: .05 })

    elements.forEach((element) => observer.observe(element))
    return () => { observer.disconnect(); gsap.killTweensOf(elements); elements.forEach((element) => gsap.killTweensOf(element.querySelectorAll('*'))) }
  }, [enabled])

  useEffect(() => {
    if (!enabled || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return undefined
    const selector = 'button:not(:disabled)'
    const running = new Set()
    let pressed = null
    const run = (target, values, duration) => {
      const instance = animate(target, { ...values, duration, ease: 'out(4)', composition: 'replace' })
      running.add(instance)
      instance.then(() => running.delete(instance))
    }
    const down = (event) => {
      pressed = event.target.closest(selector)
      if (!pressed) return
      pressed.dataset.pressed = 'true'
      run(pressed, { scale: .94, opacity: .88 }, 90)
    }
    const up = () => {
      if (!pressed) return
      const target = pressed
      target.dataset.pressed = 'false'
      run(target, { scale: 1, opacity: 1 }, 180)
      pressed = null
    }
    document.addEventListener('pointerdown', down)
    document.addEventListener('pointerup', up)
    document.addEventListener('pointercancel', up)
    document.addEventListener('pointerleave', up)
    window.addEventListener('blur', up)
    return () => { document.removeEventListener('pointerdown', down); document.removeEventListener('pointerup', up); document.removeEventListener('pointercancel', up); document.removeEventListener('pointerleave', up); window.removeEventListener('blur', up); running.forEach((instance) => instance.revert()) }
  }, [enabled])
}
