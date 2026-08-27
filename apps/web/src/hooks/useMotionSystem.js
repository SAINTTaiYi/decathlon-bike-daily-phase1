import { useEffect, useLayoutEffect } from 'react'
import { gsap } from 'gsap'

const profiles = {
  header: { y: -8, duration: .28 },
  summary: { y: 12, duration: .34 },
  photo: { y: 14, duration: .36 },
  title: { y: 10, duration: .3 },
  data: { y: 12, duration: .32 },
  row: { y: 10, duration: .3 },
  dock: { y: 8, duration: .26 }
}

export default function useMotionSystem({ enabled, rootRef, quiet = false }) {
  useLayoutEffect(() => {
    if (!enabled) return undefined
    const root = rootRef.current || document
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    const observed = new WeakSet()
    const animated = new WeakSet()
    const timelines = new Set()

    const candidates = () => [...root.querySelectorAll('[data-motion]')]
      .filter((element) => !element.closest('[hidden], [aria-hidden="true"], [data-workspace-priority="true"]'))

    const finish = (targets) => gsap.set(targets, {
      autoAlpha: 1,
      x: 0,
      y: 0,
      scale: 1,
      clearProps: 'transform,transformOrigin,opacity,visibility,filter,willChange'
    })

    if (reduced || !('IntersectionObserver' in window)) {
      finish(candidates())
      return undefined
    }

    const observer = new IntersectionObserver((entries) => {
      const entering = entries
        .filter((entry) => entry.isIntersecting && !animated.has(entry.target))
        .map((entry) => entry.target)
      if (!entering.length) return
      entering.forEach((target) => {
        animated.add(target)
        observer.unobserve(target)
      })
      const groups = new Map()
      entering.forEach((target) => {
        const group = target.dataset.motion === 'row' ? target.closest('[data-reveal-group]') || target : target
        const items = groups.get(group) || []
        items.push(target)
        groups.set(group, items)
      })
      groups.forEach((targets) => {
        const profile = profiles[targets[0].dataset.motion] || profiles.row
        const timeline = gsap.timeline({
          defaults: { ease: 'expo.out', overwrite: 'auto' },
          onComplete: () => {
            finish(targets)
            timelines.delete(timeline)
          }
        })
        timelines.add(timeline)
        // reveal 目标可能是整块面板/台账：只动 transform/opacity，不用 filter blur
        timeline.fromTo(targets,
          { autoAlpha: .001, y: profile.y, scale: .992, willChange: 'transform, opacity' },
          { autoAlpha: 1, y: 0, scale: 1, duration: profile.duration, stagger: targets.length > 1 ? .045 : 0, clearProps: 'transform,opacity,visibility,filter,willChange' }
        )
      })
    }, { rootMargin: '8% 0px -3% 0px', threshold: .04 })

    const observe = (elements) => elements.forEach((element) => {
      if (observed.has(element) || animated.has(element)) return
      observed.add(element)
      observer.observe(element)
    })
    observe(candidates())

    const mutations = new MutationObserver((records) => {
      const additions = []
      records.forEach((record) => {
        if (record.type === 'attributes') {
          additions.push(...record.target.querySelectorAll?.('[data-motion]') || [])
          if (record.target.matches?.('[data-motion]')) additions.push(record.target)
          return
        }
        record.addedNodes.forEach((node) => {
          if (node.nodeType !== Node.ELEMENT_NODE) return
          if (node.matches?.('[data-motion]')) additions.push(node)
          additions.push(...node.querySelectorAll?.('[data-motion]') || [])
        })
      })
      observe(additions.filter((element) => !element.closest('[hidden], [aria-hidden="true"], [data-workspace-priority="true"]')))
    })
    mutations.observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ['hidden', 'aria-hidden'] })

    return () => {
      observer.disconnect()
      mutations.disconnect()
      timelines.forEach((timeline) => timeline.kill())
      finish(candidates())
    }
  }, [enabled, rootRef])

  useEffect(() => {
    if (!enabled || quiet || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return undefined
    const root = rootRef.current || document
    let pressed = null
    const down = (event) => {
      pressed = event.target.closest('button:not(:disabled), summary, [role="option"]')
      if (!pressed || !root.contains(pressed)) return
      gsap.to(pressed, { scale: .985, opacity: .9, duration: .09, ease: 'power2.out', overwrite: 'auto' })
    }
    const up = () => {
      if (!pressed) return
      gsap.to(pressed, { scale: 1, opacity: 1, duration: .16, ease: 'power3.out', overwrite: 'auto', clearProps: 'transform,opacity' })
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
      if (pressed) gsap.set(pressed, { clearProps: 'transform,opacity' })
    }
  }, [enabled, quiet, rootRef])
}
