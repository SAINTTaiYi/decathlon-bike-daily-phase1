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
const clamp = (value, min, max) => Math.min(max, Math.max(min, value))

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

    // Never transform the scroll-bearing shell or its content wrapper while scrolling.
    // Only fixed ambience and visual-only child surfaces receive depth updates.
    const farPlane = root.querySelector('[data-workspace-layer="depth-far"]')
    const nearPlane = root.querySelector('[data-workspace-layer="depth-near"]')
    const navigation = [...root.querySelectorAll('[data-workspace-layer="navigation"]')]
    const sections = [...root.querySelectorAll('[data-depth-section]')]
    const cards = [...root.querySelectorAll('[data-depth-card]')]
    if (!farPlane || !nearPlane) return undefined

    const compact = window.matchMedia?.('(max-width: 639px)').matches || false
    const constrained = Number(navigator.hardwareConcurrency || 8) <= 4
    // Mobile intentionally carries the strongest persistent depth, not a reduced desktop copy.
    const deviceFactor = (compact ? 1.34 : 1) * (constrained ? .82 : 1)
    const hoverCapable = window.matchMedia?.('(hover: hover) and (pointer: fine)').matches || false
    const setFarY = gsap.quickSetter(farPlane, 'y', 'px')
    const setNearY = gsap.quickSetter(nearPlane, 'y', 'px')
    const setNearX = gsap.quickSetter(nearPlane, 'x', 'px')
    const setSectionDepth = sections.map((element) => gsap.quickSetter(element, '--depth-shift', 'px'))
    const setCardDepth = cards.map((element) => gsap.quickSetter(element, '--depth-card-shift', 'px'))
    const setNavigationDepth = navigation.map((element) => gsap.quickSetter(element, '--nav-depth-shift', 'px'))
    const cardTweens = new WeakMap()
    let activeCard = null
    let touchStart = null

    const factor = () => deviceFactor * (quietRef.current ? .22 : 1)
    const controlsCard = (element) => cardTweens.get(element) || (() => {
      const tween = {
        x: gsap.quickTo(element, 'x', { duration: .3, ease: 'power3.out' }),
        y: gsap.quickTo(element, 'y', { duration: .3, ease: 'power3.out' }),
        rx: gsap.quickTo(element, 'rotationX', { duration: .3, ease: 'power3.out' }),
        ry: gsap.quickTo(element, 'rotationY', { duration: .3, ease: 'power3.out' })
      }
      cardTweens.set(element, tween)
      return tween
    })()
    const resetCard = (element) => {
      const tween = controlsCard(element)
      tween.x(0); tween.y(0); tween.rx(0); tween.ry(0)
    }
    const resetPointer = () => {
      setNearX(0)
      if (activeCard) resetCard(activeCard)
      activeCard = null
    }
    const updateCard = (element, event, strength = 1) => {
      if (!element || quietRef.current) return
      const rect = element.getBoundingClientRect()
      if (!rect.width || !rect.height) return
      const x = clamp(((event.clientX - rect.left) / rect.width - .5) * 2, -1, 1)
      const y = clamp(((event.clientY - rect.top) / rect.height - .5) * 2, -1, 1)
      const tween = controlsCard(element)
      const local = deviceFactor * strength
      tween.x(x * 1.6 * local)
      tween.y(-3.5 * local)
      tween.rx(-y * 4.2 * local)
      tween.ry(x * 4.2 * local)
    }
    const updateAmbientX = (event, touch = false) => {
      const rect = root.getBoundingClientRect()
      const normalizedX = clamp(((event.clientX - rect.left) / rect.width - .5) * 2, -1, 1)
      setNearX(normalizedX * 22 * factor() * (touch ? .72 : 1))
    }
    const isInteractive = (target) => Boolean(target.closest(interactiveSelector))
    const onPointerMove = (event) => {
      if (event.pointerType === 'mouse' && hoverCapable) {
        updateAmbientX(event)
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
      updateAmbientX(event, true)
      const nextCard = event.target.closest('[data-spatial-tilt]')
      if (nextCard && nextCard !== activeCard) {
        if (activeCard) resetCard(activeCard)
        activeCard = nextCard
      }
      if (activeCard) updateCard(activeCard, event, .78)
    }
    const onPointerDown = (event) => {
      if (event.pointerType === 'touch' && !isInteractive(event.target)) touchStart = { x: event.clientX, y: event.clientY }
    }
    const onPointerEnd = () => { touchStart = null; resetPointer() }
    const renderDepth = (progress) => {
      const strength = factor()
      const centered = progress - .5
      setFarY(-centered * 168 * strength)
      setNearY(centered * 94 * strength)
      setNavigationDepth.forEach((setter) => setter(centered * -10 * strength))
      const viewportCenter = window.innerHeight * .5
      sections.forEach((section, index) => {
        const rect = section.getBoundingClientRect()
        const relative = clamp((viewportCenter - (rect.top + rect.height * .5)) / window.innerHeight, -1, 1)
        setSectionDepth[index](relative * 34 * strength)
      })
      cards.forEach((card, index) => {
        const rect = card.getBoundingClientRect()
        const relative = clamp((viewportCenter - (rect.top + rect.height * .5)) / window.innerHeight, -1, 1)
        setCardDepth[index](relative * 18 * strength)
      })
    }
    const scrollTrigger = ScrollTrigger.create({
      trigger: root,
      start: 'top top',
      end: 'bottom bottom',
      invalidateOnRefresh: true,
      onUpdate: (self) => renderDepth(self.progress)
    })

    root.addEventListener('pointermove', onPointerMove, { passive: true })
    root.addEventListener('pointerdown', onPointerDown, { passive: true })
    root.addEventListener('pointerup', onPointerEnd, { passive: true })
    root.addEventListener('pointercancel', onPointerEnd, { passive: true })
    root.addEventListener('pointerleave', onPointerEnd, { passive: true })
    const refreshFrame = window.requestAnimationFrame(() => {
      ScrollTrigger.refresh()
      renderDepth(scrollTrigger.progress)
    })

    return () => {
      window.cancelAnimationFrame(refreshFrame)
      scrollTrigger.kill()
      root.removeEventListener('pointermove', onPointerMove)
      root.removeEventListener('pointerdown', onPointerDown)
      root.removeEventListener('pointerup', onPointerEnd)
      root.removeEventListener('pointercancel', onPointerEnd)
      root.removeEventListener('pointerleave', onPointerEnd)
      if (activeCard) gsap.killTweensOf(activeCard)
      gsap.set([farPlane, nearPlane, ...navigation], { clearProps: 'transform,willChange' })
      sections.forEach((section) => section.style.removeProperty('--depth-shift'))
      cards.forEach((card) => card.style.removeProperty('--depth-card-shift'))
      navigation.forEach((element) => element.style.removeProperty('--nav-depth-shift'))
    }
  }, [enabled, rootRef])
}
