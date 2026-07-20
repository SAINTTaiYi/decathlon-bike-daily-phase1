import { useEffect, useLayoutEffect, useRef } from 'react'
import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { animate } from 'animejs/animation'

gsap.registerPlugin(ScrollTrigger)

const profiles = {
  header: { x: 0, y: -12, clipPath: 'inset(0 0 100% 0)', duration: .42 },
  summary: { x: 0, y: 18, clipPath: 'inset(0 0 16% 0)', duration: .52 },
  photo: { x: -18, y: 0, clipPath: 'inset(0 100% 0 0)', duration: .68 },
  title: { x: 0, y: 14, clipPath: 'inset(0 0 12% 0)', duration: .46 },
  data: { x: 0, y: 16, clipPath: 'inset(0 0 14% 0)', duration: .48 },
  row: { x: 16, y: 0, clipPath: 'inset(0 0 0 10%)', duration: .42 },
  dock: { x: 0, y: 24, clipPath: 'inset(100% 0 0 0)', duration: .48 }
}

const interactiveSelector = 'input, textarea, select, button, [contenteditable="true"], [role="combobox"], [role="menu"]'

export default function useMotionSystem({ enabled, rootRef, quiet = false }) {
  const quietRef = useRef(quiet)

  useEffect(() => {
    quietRef.current = quiet
  }, [quiet])

  useLayoutEffect(() => {
    if (!enabled) return undefined
    const root = rootRef.current || document
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    const elements = [...root.querySelectorAll('[data-motion]')]
      .filter((element) => !element.closest('[data-workspace-priority="true"], [data-workspace-module="true"]'))

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
      if (target.dataset.motion === 'photo') {
        const image = target.querySelector('img')
        if (image) gsap.fromTo(image, { scale: 1.08 }, { scale: 1.018, duration: .72, ease: 'expo.out', clearProps: 'transform' })
      }
      observer.unobserve(target)
    }), { rootMargin: '0px 0px -8% 0px', threshold: .05 })

    elements.forEach((element) => observer.observe(element))
    return () => {
      observer.disconnect()
      gsap.killTweensOf(elements)
      elements.forEach((element) => gsap.killTweensOf(element.querySelectorAll('*')))
    }
  }, [enabled, rootRef])

  useEffect(() => {
    if (!enabled || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return undefined
    const root = rootRef.current || document
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
      if (!pressed || !root.contains(pressed)) return
      pressed.dataset.pressed = 'true'
      run(pressed, { scale: .98, opacity: .92 }, 90)
    }
    const up = () => {
      if (!pressed) return
      const target = pressed
      target.dataset.pressed = 'false'
      run(target, { scale: 1, opacity: 1 }, 180)
      pressed = null
    }
    root.addEventListener('pointerdown', down)
    root.addEventListener('pointerup', up)
    root.addEventListener('pointercancel', up)
    root.addEventListener('pointerleave', up)
    window.addEventListener('blur', up)
    return () => {
      root.removeEventListener('pointerdown', down)
      root.removeEventListener('pointerup', up)
      root.removeEventListener('pointercancel', up)
      root.removeEventListener('pointerleave', up)
      window.removeEventListener('blur', up)
      running.forEach((instance) => instance.revert())
    }
  }, [enabled, rootRef])

  useEffect(() => {
    if (!enabled || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return undefined
    const root = rootRef.current
    if (!root) return undefined

    const environment = root.querySelector('[data-workspace-layer="environment"]')
    const scrollPlane = root.querySelector('[data-workspace-layer="structure"]')
    const pointerPlane = root.querySelector('[data-workspace-layer="pointer-plane"]')
    const navigation = [...root.querySelectorAll('[data-workspace-layer="navigation"]')]
    if (!environment || !scrollPlane || !pointerPlane) return undefined

    const compact = window.matchMedia?.('(max-width: 639px)').matches || false
    const constrained = Number(navigator.hardwareConcurrency || 8) <= 4
    const deviceFactor = (compact ? .55 : 1) * (constrained ? .68 : 1)
    const hoverCapable = window.matchMedia?.('(hover: hover) and (pointer: fine)').matches || false
    const pointerX = gsap.quickTo(pointerPlane, 'x', { duration: .46, ease: 'power3.out' })
    const pointerY = gsap.quickTo(pointerPlane, 'y', { duration: .46, ease: 'power3.out' })
    const pointerRX = gsap.quickTo(pointerPlane, 'rotationX', { duration: .46, ease: 'power3.out' })
    const pointerRY = gsap.quickTo(pointerPlane, 'rotationY', { duration: .46, ease: 'power3.out' })
    const environmentY = gsap.quickTo(environment, 'y', { duration: .32, ease: 'none' })
    const planeY = gsap.quickTo(scrollPlane, 'y', { duration: .32, ease: 'none' })
    const navTweens = navigation.map((element) => ({
      x: gsap.quickTo(element, 'x', { duration: .42, ease: 'power3.out' }),
      y: gsap.quickTo(element, 'y', { duration: .42, ease: 'power3.out' }),
      rx: gsap.quickTo(element, 'rotationX', { duration: .42, ease: 'power3.out' }),
      ry: gsap.quickTo(element, 'rotationY', { duration: .42, ease: 'power3.out' })
    }))
    const cardTweens = new WeakMap()
    let activeCard = null
    let touchStart = null

    const factor = () => deviceFactor * (quietRef.current ? .25 : 1)
    const resetPointer = () => {
      pointerX(0); pointerY(0); pointerRX(0); pointerRY(0)
      navTweens.forEach((tween) => { tween.x(0); tween.y(0); tween.rx(0); tween.ry(0) })
      if (activeCard) resetCard(activeCard)
      activeCard = null
    }
    const controlsCard = (element) => cardTweens.get(element) || (() => {
      const tween = {
        x: gsap.quickTo(element, 'x', { duration: .42, ease: 'power3.out' }),
        y: gsap.quickTo(element, 'y', { duration: .42, ease: 'power3.out' }),
        rx: gsap.quickTo(element, 'rotationX', { duration: .42, ease: 'power3.out' }),
        ry: gsap.quickTo(element, 'rotationY', { duration: .42, ease: 'power3.out' })
      }
      cardTweens.set(element, tween)
      return tween
    })()
    const resetCard = (element) => {
      const tween = controlsCard(element)
      tween.x(0); tween.y(0); tween.rx(0); tween.ry(0)
    }
    const updateCard = (element, event, strength = 1) => {
      if (!element || quietRef.current) return
      const rect = element.getBoundingClientRect()
      if (!rect.width || !rect.height) return
      const x = Math.max(-1, Math.min(1, ((event.clientX - rect.left) / rect.width - .5) * 2))
      const y = Math.max(-1, Math.min(1, ((event.clientY - rect.top) / rect.height - .5) * 2))
      const tween = controlsCard(element)
      const local = deviceFactor * strength
      tween.x(x * .7 * local)
      tween.y(-1.5 * local)
      tween.rx(-y * 2.2 * local)
      tween.ry(x * 2.2 * local)
    }
    const updatePointer = (event, touch = false) => {
      const rect = root.getBoundingClientRect()
      const normalizedX = Math.max(-1, Math.min(1, ((event.clientX - rect.left) / rect.width - .5) * 2))
      const normalizedY = Math.max(-1, Math.min(1, ((event.clientY - rect.top) / rect.height - .5) * 2))
      const currentFactor = factor() * (touch ? .55 : 1)
      pointerX(normalizedX * 4 * currentFactor)
      pointerY(normalizedY * 3 * currentFactor)
      pointerRX(-normalizedY * .55 * currentFactor)
      pointerRY(normalizedX * .55 * currentFactor)
      navTweens.forEach((tween) => {
        tween.x(normalizedX * 2.2 * currentFactor)
        tween.y(normalizedY * 1.5 * currentFactor)
        tween.rx(-normalizedY * .32 * currentFactor)
        tween.ry(normalizedX * .32 * currentFactor)
      })
    }
    const isInteractive = (target) => Boolean(target.closest(interactiveSelector))
    const onPointerMove = (event) => {
      if (event.pointerType === 'mouse' && hoverCapable) {
        updatePointer(event)
        const nextCard = isInteractive(event.target) ? null : event.target.closest('[data-spatial-tilt]')
        if (nextCard !== activeCard) {
          if (activeCard) resetCard(activeCard)
          activeCard = nextCard
        }
        if (activeCard) updateCard(activeCard, event)
        return
      }
      if (event.pointerType !== 'touch' || !touchStart || isInteractive(event.target)) return
      const distance = Math.hypot(event.clientX - touchStart.x, event.clientY - touchStart.y)
      if (distance < 8) return
      updatePointer(event, true)
      const nextCard = event.target.closest('[data-spatial-tilt]')
      if (nextCard && nextCard !== activeCard) {
        if (activeCard) resetCard(activeCard)
        activeCard = nextCard
      }
      if (activeCard) updateCard(activeCard, event, .45)
    }
    const onPointerDown = (event) => {
      if (event.pointerType === 'touch' && !isInteractive(event.target)) touchStart = { x: event.clientX, y: event.clientY }
    }
    const onPointerEnd = () => { touchStart = null; resetPointer() }
    const scrollTrigger = ScrollTrigger.create({
      trigger: root,
      start: 'top top',
      end: 'bottom bottom',
      invalidateOnRefresh: true,
      onUpdate: (self) => {
        const currentFactor = factor()
        environmentY(self.progress * 14 * currentFactor)
        planeY(-self.progress * 6 * currentFactor)
      }
    })

    root.addEventListener('pointermove', onPointerMove, { passive: true })
    root.addEventListener('pointerdown', onPointerDown, { passive: true })
    root.addEventListener('pointerup', onPointerEnd, { passive: true })
    root.addEventListener('pointercancel', onPointerEnd, { passive: true })
    root.addEventListener('pointerleave', onPointerEnd, { passive: true })
    const refreshFrame = window.requestAnimationFrame(() => ScrollTrigger.refresh())

    return () => {
      window.cancelAnimationFrame(refreshFrame)
      scrollTrigger.kill()
      root.removeEventListener('pointermove', onPointerMove)
      root.removeEventListener('pointerdown', onPointerDown)
      root.removeEventListener('pointerup', onPointerEnd)
      root.removeEventListener('pointercancel', onPointerEnd)
      root.removeEventListener('pointerleave', onPointerEnd)
      gsap.killTweensOf([environment, scrollPlane, pointerPlane, ...navigation])
      if (activeCard) gsap.killTweensOf(activeCard)
      gsap.set([environment, scrollPlane, pointerPlane, ...navigation], { clearProps: 'transform,willChange' })
    }
  }, [enabled, rootRef])
}
