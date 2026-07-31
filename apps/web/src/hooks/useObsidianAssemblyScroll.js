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
    if (history && window.location.hash !== `#module-${sceneId}`) window.history.replaceState(window.history.state, '', `#module-${sceneId}`)
  }, [sceneIds])

  const jumpTo = useCallback((sceneId) => {
    if (!enabled || quietRef.current || !sceneIds.includes(sceneId)) return false
    const section = sectionsRef.current.get(sceneId)?.section || document.getElementById(`module-${sceneId}`)
    if (!section) return false
    const top = section.offsetTop - headerOffset() - 10
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
    const reduce = reducedMotion()
    let frame = 0
    let viewportHeight = window.innerHeight
    let stackHeight = 1
    let geometry = []

    const measure = () => {
      viewportHeight = window.innerHeight
      stackHeight = Math.max(1, stack.offsetHeight)
      geometry = sections.map((section) => ({ section, sceneId: section.dataset.sceneId, top: section.offsetTop, height: Math.max(1, section.offsetHeight) }))
      sectionsRef.current = new Map(geometry.map((entry) => [entry.sceneId, entry]))
    }
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

    const render = () => {
      frame = 0
      const scrollY = window.scrollY
      const progress = reduce ? 0 : clamp(scrollY / Math.max(1, stackHeight - viewportHeight))
      const wave = Math.sin(progress * Math.PI * 2)
      root.style.setProperty('--assembly-page-progress', progress.toFixed(4))
      line.style.setProperty('--assembly-line-x', `${(reduce ? 0 : wave * 12).toFixed(2)}px`)
      line.style.setProperty('--assembly-line-y', `${(reduce ? 0 : (progress - 0.5) * -64).toFixed(2)}px`)
      line.style.setProperty('--assembly-line-dash', (reduce ? 0 : -progress * 1.86).toFixed(4))

      const focal = scrollY + viewportHeight * 0.42
      let current = geometry[0]
      geometry.forEach((entry) => {
        const local = reduce ? 0.5 : clamp((scrollY + viewportHeight - entry.top) / Math.max(1, entry.height + viewportHeight))
        entry.section.style.setProperty('--assembly-local-progress', local.toFixed(4))
        const inview = entry.top < scrollY + viewportHeight && entry.top + entry.height > scrollY
        if (entry.inview !== inview) {
          entry.inview = inview
          if (inview) entry.section.dataset.moduleInview = 'true'
          else delete entry.section.dataset.moduleInview
        }
        if (entry.top <= focal) current = entry
      })
      const overview = sectionsRef.current.get('pulse')
      const ore = overview?.section.querySelector('[data-assembly-ore]')
      if (ore) {
        const local = reduce ? 0.5 : clamp((scrollY + viewportHeight - overview.top) / Math.max(1, overview.height + viewportHeight))
        const centred = local - 0.5
        ore.style.setProperty('--assembly-ore-x', `${(centred * 20).toFixed(2)}px`)
        ore.style.setProperty('--assembly-ore-y', `${(centred * -88).toFixed(2)}px`)
        ore.style.setProperty('--assembly-ore-rotation', `${(centred * 6).toFixed(2)}deg`)
        ore.style.setProperty('--assembly-ore-scale', (1 + centred * 0.04).toFixed(4))
      }
      updateActive(current.sceneId)
    }
    const sync = () => { if (!frame) frame = window.requestAnimationFrame(render) }
    const resizeObserver = 'ResizeObserver' in window ? new ResizeObserver(() => { measure(); sync() }) : null
    resizeObserver?.observe(stack)
    sections.forEach((section) => resizeObserver?.observe(section))
    const onResize = () => { measure(); sync() }
    const jumpFromHistory = () => {
      const sceneId = window.location.hash.match(/^#module-(pulse|pickup|poster|repair|resale|sales)$/u)?.[1]
      const entry = sceneId ? sectionsRef.current.get(sceneId) : null
      if (!entry) return sync()
      activeRef.current = sceneId
      setActiveScene(sceneId)
      window.scrollTo({ top: Math.max(0, entry.top - headerOffset() - 10), behavior: 'auto' })
      window.requestAnimationFrame(() => entry.section.focus({ preventScroll: true }))
      sync()
    }
    measure()
    if (initialHashRef.current) window.requestAnimationFrame(jumpFromHistory)
    window.addEventListener('scroll', sync, { passive: true })
    window.addEventListener('resize', onResize, { passive: true })
    window.addEventListener('popstate', jumpFromHistory)
    sync()
    return () => {
      window.cancelAnimationFrame(frame)
      resizeObserver?.disconnect()
      textObserver?.disconnect()
      window.removeEventListener('scroll', sync)
      window.removeEventListener('resize', onResize)
      window.removeEventListener('popstate', jumpFromHistory)
      sectionsRef.current.clear()
    }
  }, [enabled, rootRef, updateActive])

  return { activeScene, jumpTo }
}
