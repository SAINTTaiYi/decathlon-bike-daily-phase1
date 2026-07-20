import { useEffect, useLayoutEffect, useRef } from 'react'
import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { animate } from 'animejs/animation'

gsap.registerPlugin(ScrollTrigger)

const profiles = {
  header: { y: -16, z: -28, rotationX: -2.2, scale: .992, duration: .48 },
  summary: { y: 26, z: -42, rotationX: 3.6, scale: .986, duration: .58 },
  photo: { y: 34, z: -58, rotationX: 4.6, scale: .982, duration: .68 },
  title: { y: 20, z: -32, rotationX: 2.8, scale: .99, duration: .5 },
  data: { y: 24, z: -38, rotationX: 3.2, scale: .988, duration: .54 },
  row: { y: 28, z: -46, rotationX: 4.2, scale: .986, duration: .56 },
  dock: { y: 26, z: -24, rotationX: 2.4, scale: .992, duration: .5 }
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
    const revealed = new WeakSet()
    const observed = new WeakSet()
    const queued = new Map()
    const timelines = new Set()
    let flushFrame = 0

    const visibleMotionElements = () => [...root.querySelectorAll('[data-motion]')]
      .filter((element) => !element.closest('[data-workspace-priority="true"], [data-workspace-module="true"]'))

    const finishStatic = (elements) => {
      gsap.set(elements, {
        autoAlpha: 1,
        x: 0,
        y: 0,
        z: 0,
        rotationX: 0,
        rotationY: 0,
        scale: 1,
        clearProps: 'transform,transformOrigin,opacity,visibility,willChange'
      })
    }

    if (reduced || !('IntersectionObserver' in window)) {
      finishStatic(visibleMotionElements())
      return undefined
    }

    const flush = () => {
      flushFrame = 0
      const groups = new Map()
      queued.forEach((entry, target) => {
        if (revealed.has(target)) return
        const group = target.dataset.motion === 'row'
          ? target.closest('[data-reveal-group]') || target
          : target
        const current = groups.get(group) || []
        current.push({ target, entry })
        groups.set(group, current)
      })
      queued.clear()

      groups.forEach((items) => {
        const targets = items.map(({ target }) => target).filter((target) => !revealed.has(target))
        if (!targets.length) return
        targets.forEach((target) => revealed.add(target))
        const motion = targets[0].dataset.motion || 'row'
        const profile = profiles[motion] || profiles.row
        const alreadyCentral = items.some(({ entry }) => entry.boundingClientRect.top < window.innerHeight * .46)
        const stagger = targets.length > 1 ? .065 : 0
        const duration = alreadyCentral ? Math.min(profile.duration, .42) : profile.duration
        const timeline = gsap.timeline({
          defaults: { ease: 'power4.out', overwrite: 'auto' },
          onComplete: () => {
            finishStatic(targets)
            timelines.delete(timeline)
          }
        })
        timelines.add(timeline)
        timeline
          .set(targets, {
            transformPerspective: 1050,
            transformOrigin: '50% 52%',
            transformStyle: 'preserve-3d',
            backfaceVisibility: 'hidden',
            willChange: 'transform, opacity'
          })
          .fromTo(targets,
            { autoAlpha: .001, y: profile.y, z: profile.z, rotationX: profile.rotationX, scale: profile.scale },
            { autoAlpha: 1, y: 0, z: 0, rotationX: 0, scale: 1, duration, stagger },
            0
          )
      })
    }

    const schedule = () => {
      if (!flushFrame) flushFrame = window.requestAnimationFrame(flush)
    }

    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting || revealed.has(entry.target)) return
        queued.set(entry.target, entry)
        observer.unobserve(entry.target)
      })
      schedule()
    }, { rootMargin: '12% 0px -4% 0px', threshold: .01 })

    const observe = (elements) => elements.forEach((element) => {
      if (!observed.has(element) && !revealed.has(element)) {
        observed.add(element)
        observer.observe(element)
      }
    })
    observe(visibleMotionElements())

    const mutations = new MutationObserver((records) => {
      const additions = []
      records.forEach((record) => record.addedNodes.forEach((node) => {
        if (node.nodeType !== Node.ELEMENT_NODE) return
        if (node.matches?.('[data-motion]')) additions.push(node)
        additions.push(...node.querySelectorAll?.('[data-motion]') || [])
      }))
      if (additions.length) observe(additions.filter((element) => !element.closest('[data-workspace-priority="true"], [data-workspace-module="true"]')))
    })
    mutations.observe(root, { childList: true, subtree: true })

    return () => {
      window.cancelAnimationFrame(flushFrame)
      observer.disconnect()
      mutations.disconnect()
      timelines.forEach((timeline) => timeline.kill())
      finishStatic(visibleMotionElements())
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
