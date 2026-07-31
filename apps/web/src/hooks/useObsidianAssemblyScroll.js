import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { lookbookScenes } from '../data/lookbookScenes.js'

const clamp = (value, min = 0, max = 1) => Math.min(max, Math.max(min, value))
const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches || false
function headerOffset() {
  const value = window.getComputedStyle(document.documentElement).getPropertyValue('--ops-header-height')
  return Number.parseFloat(value) || 108
}

export default function useObsidianAssemblyScroll({ enabled, rootRef, quiet = false }) {
  const sceneIds = useMemo(() => lookbookScenes.map((scene) => scene.id), [])
  const initialHashRef = useRef(window.location.hash.match(/^#module-(pulse|pickup|poster|repair|resale|sales)$/u)?.[1] || '')
  const [activeScene, setActiveScene] = useState(initialHashRef.current || sceneIds[0])
  const activeRef = useRef(activeScene)
  const quietRef = useRef(quiet)
  const sectionsRef = useRef(new Map())

  useLayoutEffect(() => { activeRef.current = activeScene }, [activeScene])
  useLayoutEffect(() => { quietRef.current = quiet }, [quiet])

  const updateActive = useCallback((sceneId, { history = true } = {}) => {
    if (!sceneIds.includes(sceneId)) return
    if (activeRef.current !== sceneId) {
      activeRef.current = sceneId
      setActiveScene(sceneId)
    }
    if (history && window.location.hash !== `#module-${sceneId}`) {
      window.history.replaceState(window.history.state, '', `#module-${sceneId}`)
    }
  }, [sceneIds])

  const jumpTo = useCallback((sceneId) => {
    if (!enabled || quietRef.current || !sceneIds.includes(sceneId)) return false
    const section = sectionsRef.current.get(sceneId) || document.getElementById(`module-${sceneId}`)
    if (!section) return false
    const top = section.getBoundingClientRect().top + window.scrollY - headerOffset() - 10
    activeRef.current = sceneId
    setActiveScene(sceneId)
    window.history.pushState(window.history.state, '', `#module-${sceneId}`)
    window.scrollTo({ top: Math.max(0, top), behavior: reducedMotion() ? 'auto' : 'smooth' })
    window.requestAnimationFrame(() => section.focus({ preventScroll: true }))
    return true
  }, [enabled, sceneIds])

  useLayoutEffect(() => {
    if (!enabled) return undefined
    const root = rootRef.current || document
    const stack = root.querySelector('[data-assembly-stack]')
    const line = root.querySelector('[data-assembly-line]')
    if (!stack || !line) return undefined
    const sections = [...stack.querySelectorAll('[data-assembly-module]')]
    if (!sections.length) return undefined
    sectionsRef.current = new Map(sections.map((section) => [section.dataset.sceneId, section]))
    const reduce = reducedMotion()
    let frame = 0

    const revealAll = () => root.querySelectorAll('[data-assembly-text]').forEach((node) => { node.dataset.assemblyTextVisible = 'true' })
    const textObserver = reduce || !('IntersectionObserver' in window) ? null : new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return
        entry.target.dataset.assemblyTextVisible = 'true'
        textObserver.unobserve(entry.target)
      })
    }, { rootMargin: '10% 0px -7% 0px', threshold: 0.08 })
    if (textObserver) root.querySelectorAll('[data-assembly-text]').forEach((node) => textObserver.observe(node))
    else revealAll()

    const sync = () => {
      window.cancelAnimationFrame(frame)
      frame = window.requestAnimationFrame(() => {
        const viewportHeight = window.innerHeight
        const stackRect = stack.getBoundingClientRect()
        const stackTop = stackRect.top + window.scrollY
        const travel = Math.max(1, stack.offsetHeight - viewportHeight)
        const progress = reduce ? 0 : clamp((window.scrollY - stackTop) / travel)
        const wave = Math.sin(progress * Math.PI * 2)
        root.style.setProperty('--assembly-page-progress', progress.toFixed(4))
        line.style.setProperty('--assembly-line-x', `${(reduce ? 0 : wave * 16).toFixed(2)}px`)
        line.style.setProperty('--assembly-line-y', `${(reduce ? 0 : (progress - 0.5) * -84).toFixed(2)}px`)
        line.style.setProperty('--assembly-line-dash', (reduce ? 0 : -progress * 1.86).toFixed(4))

        const overview = sectionsRef.current.get('pulse')
        const ore = overview?.querySelector('[data-assembly-ore]')
        if (overview && ore) {
          const rect = overview.getBoundingClientRect()
          const local = reduce ? 0.5 : clamp((viewportHeight - rect.top) / Math.max(1, rect.height + viewportHeight))
          const centred = local - 0.5
          ore.style.setProperty('--assembly-ore-x', `${(centred * 28).toFixed(2)}px`)
          ore.style.setProperty('--assembly-ore-y', `${(centred * -118).toFixed(2)}px`)
          ore.style.setProperty('--assembly-ore-rotation', `${(centred * 8).toFixed(2)}deg`)
          ore.style.setProperty('--assembly-ore-scale', (1 + centred * 0.065).toFixed(4))
        }

        const focalLine = viewportHeight * 0.42
        const geometry = sections.map((section) => {
          const rect = section.getBoundingClientRect()
          if (rect.bottom > 0 && rect.top < viewportHeight) section.dataset.moduleInview = 'true'
          else delete section.dataset.moduleInview
          return { section, rect }
        })
        const crossed = geometry.filter(({ rect }) => rect.top <= focalLine)
        updateActive((crossed.at(-1) || geometry[0]).section.dataset.sceneId)
      })
    }
    const jumpFromHistory = () => {
      const sceneId = window.location.hash.match(/^#module-(pulse|pickup|poster|repair|resale|sales)$/u)?.[1]
      const section = sceneId ? sectionsRef.current.get(sceneId) : null
      if (!section) return sync()
      activeRef.current = sceneId
      setActiveScene(sceneId)
      const top = section.getBoundingClientRect().top + window.scrollY - headerOffset() - 10
      window.scrollTo({ top: Math.max(0, top), behavior: 'auto' })
      window.requestAnimationFrame(() => section.focus({ preventScroll: true }))
      sync()
    }
    const initialScene = initialHashRef.current
    if (initialScene) window.requestAnimationFrame(jumpFromHistory)
    window.addEventListener('scroll', sync, { passive: true })
    window.addEventListener('resize', sync, { passive: true })
    window.addEventListener('popstate', jumpFromHistory)
    sync()
    return () => {
      window.cancelAnimationFrame(frame)
      textObserver?.disconnect()
      window.removeEventListener('scroll', sync)
      window.removeEventListener('resize', sync)
      window.removeEventListener('popstate', jumpFromHistory)
      sectionsRef.current.clear()
    }
  }, [enabled, rootRef, updateActive])

  return { activeScene, jumpTo }
}
