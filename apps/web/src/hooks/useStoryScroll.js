import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { lookbookScenes } from '../data/lookbookScenes.js'

gsap.registerPlugin(ScrollTrigger)
ScrollTrigger.config({ ignoreMobileResize: true })

function reducedMotion() {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches || false
}

function headerOffset() {
  const value = window.getComputedStyle(document.documentElement).getPropertyValue('--ops-header-height')
  return Number.parseFloat(value) || 72
}

export default function useStoryScroll({ enabled, rootRef, quiet = false }) {
  const sceneIds = useMemo(() => lookbookScenes.map((scene) => scene.id), [])
  const [activeScene, setActiveScene] = useState(sceneIds[0])
  const activeRef = useRef(activeScene)
  const quietRef = useRef(quiet)
  const sectionRefs = useRef(new Map())
  const handoffRefs = useRef(new Map())

  useEffect(() => { activeRef.current = activeScene }, [activeScene])
  useEffect(() => { quietRef.current = quiet }, [quiet])

  const updateActiveScene = useCallback((sceneId) => {
    if (!sceneIds.includes(sceneId) || activeRef.current === sceneId) return
    activeRef.current = sceneId
    setActiveScene(sceneId)
  }, [sceneIds])

  const jumpTo = useCallback((targetId) => {
    if (!enabled || quietRef.current || !sceneIds.includes(targetId)) return false
    const section = sectionRefs.current.get(targetId) || document.getElementById(`module-${targetId}`)
    if (!section) return false
    const handoff = handoffRefs.current.get(targetId)
    const anchor = section.parentElement?.classList.contains('pin-spacer') ? section.parentElement : section
    const stack = rootRef.current?.querySelector('[data-module-flow-stack]')
    const naturalAnchor = targetId === sceneIds[0] && stack ? stack : anchor
    const naturalTop = naturalAnchor.getBoundingClientRect().top + window.scrollY - headerOffset() - 8
    const top = handoff
      ? handoff.end + Math.max(1, window.innerHeight * .25 - headerOffset() - 8)
      : naturalTop
    updateActiveScene(targetId)
    window.scrollTo({
      top: Math.max(0, top),
      behavior: reducedMotion() ? 'auto' : 'smooth'
    })
    window.requestAnimationFrame(() => section.focus({ preventScroll: true }))
    return true
  }, [enabled, sceneIds, updateActiveScene])

  useLayoutEffect(() => {
    if (!enabled) return undefined
    const root = rootRef.current || document
    const stack = root.querySelector('[data-module-flow-stack]')
    if (!stack) return undefined
    const sections = [...stack.querySelectorAll('[data-module-flow-section]')]
    if (!sections.length) return undefined

    sectionRefs.current = new Map(sections.map((section) => [section.dataset.sceneId, section]))
    const reduce = reducedMotion()
    const handoffs = []
    let sceneFrame = 0
    let refreshTimer = 0
    let disposed = false

    const syncSceneFromProgress = () => {
      window.cancelAnimationFrame(sceneFrame)
      sceneFrame = window.requestAnimationFrame(() => {
        let activeIndex = 0
        handoffs.forEach((trigger, index) => {
          if (trigger.progress >= .5) activeIndex = index + 1
        })
        updateActiveScene(sceneIds[activeIndex])
      })
    }

    const context = gsap.context(() => {
      sections.forEach((section, index) => {
        const inner = section.querySelector('[data-module-flow-inner]')
        gsap.set(section, { zIndex: index + 1 })
        if (!inner) return

        if (reduce) {
          gsap.set(inner, { rotation: 0, transformOrigin: 'bottom left' })
          if (index > 0) {
            ScrollTrigger.create({
              trigger: section,
              start: 'top 50%',
              end: 'bottom 50%',
              onEnter: () => updateActiveScene(sceneIds[index]),
              onLeaveBack: () => updateActiveScene(sceneIds[index - 1])
            })
          }
          return
        }

        if (index > 0) {
          gsap.set(inner, { rotation: 30, transformOrigin: 'bottom left' })
          const tween = gsap.to(inner, {
            rotation: 0,
            ease: 'none',
            scrollTrigger: {
              trigger: section,
              start: 'top bottom',
              end: 'top 25%',
              scrub: true,
              invalidateOnRefresh: true,
              onUpdate: syncSceneFromProgress
            }
          })
          if (tween.scrollTrigger) {
            handoffs.push(tween.scrollTrigger)
            handoffRefs.current.set(sceneIds[index], tween.scrollTrigger)
          }
        }

        if (index < sections.length - 1) {
          ScrollTrigger.create({
            trigger: section,
            start: 'bottom bottom',
            end: 'bottom top',
            pin: true,
            pinSpacing: false,
            anticipatePin: 1,
            invalidateOnRefresh: true
          })
        }
      })
    }, stack)

    const scheduleRefresh = () => {
      window.clearTimeout(refreshTimer)
      refreshTimer = window.setTimeout(() => {
        if (disposed) return
        ScrollTrigger.refresh()
        syncSceneFromProgress()
      }, 180)
    }
    const resizeObserver = typeof ResizeObserver === 'undefined'
      ? null
      : new ResizeObserver(scheduleRefresh)
    sections.forEach((section) => resizeObserver?.observe(section.querySelector('[data-module-flow-inner]') || section))
    window.addEventListener('resize', scheduleRefresh, { passive: true })
    document.fonts?.ready.then(scheduleRefresh)
    scheduleRefresh()

    return () => {
      disposed = true
      window.cancelAnimationFrame(sceneFrame)
      window.clearTimeout(refreshTimer)
      window.removeEventListener('resize', scheduleRefresh)
      resizeObserver?.disconnect()
      context.revert()
      sectionRefs.current.clear()
      handoffRefs.current.clear()
    }
  }, [enabled, rootRef, sceneIds, updateActiveScene])

  return { activeScene, jumpTo }
}
