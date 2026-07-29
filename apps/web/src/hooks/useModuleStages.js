import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { lookbookScenes } from '../data/lookbookScenes.js'

function reducedMotion() {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches || false
}

function headerOffset() {
  const value = window.getComputedStyle(document.documentElement).getPropertyValue('--ops-header-height')
  return Number.parseFloat(value) || 108
}

export default function useModuleStages({ enabled, rootRef, quiet = false }) {
  const sceneIds = useMemo(() => lookbookScenes.map((scene) => scene.id), [])
  const [activeScene, setActiveScene] = useState(sceneIds[0])
  const activeRef = useRef(activeScene)
  const quietRef = useRef(quiet)
  const stageRefs = useRef(new Map())

  useEffect(() => { activeRef.current = activeScene }, [activeScene])
  useEffect(() => { quietRef.current = quiet }, [quiet])

  const updateActiveScene = useCallback((sceneId) => {
    if (!sceneIds.includes(sceneId) || activeRef.current === sceneId) return
    activeRef.current = sceneId
    setActiveScene(sceneId)
  }, [sceneIds])

  const jumpTo = useCallback((targetId) => {
    if (!enabled || quietRef.current || !sceneIds.includes(targetId)) return false
    const stage = stageRefs.current.get(targetId) || document.getElementById(`module-${targetId}`)
    if (!stage) return false
    const top = stage.getBoundingClientRect().top + window.scrollY - headerOffset() - 8
    updateActiveScene(targetId)
    window.scrollTo({ top: Math.max(0, top), behavior: reducedMotion() ? 'auto' : 'smooth' })
    window.requestAnimationFrame(() => stage.focus({ preventScroll: true }))
    return true
  }, [enabled, sceneIds, updateActiveScene])

  useLayoutEffect(() => {
    if (!enabled) return undefined
    const root = rootRef.current || document
    const stack = root.querySelector('[data-module-stage-stack]')
    if (!stack) return undefined
    const stages = [...stack.querySelectorAll('[data-module-stage]')]
    if (!stages.length) return undefined

    stageRefs.current = new Map(stages.map((stage) => [stage.dataset.sceneId, stage]))
    let frame = 0
    const syncActiveStage = () => {
      window.cancelAnimationFrame(frame)
      frame = window.requestAnimationFrame(() => {
        const marker = Math.min(window.innerHeight - 1, headerOffset() + Math.max(36, window.innerHeight * .18))
        const stage = stages.find((candidate) => {
          const rect = candidate.getBoundingClientRect()
          return rect.top <= marker && rect.bottom > marker
        }) || stages.reduce((nearest, candidate) => {
          const candidateDistance = Math.abs(candidate.getBoundingClientRect().top - marker)
          const nearestDistance = Math.abs(nearest.getBoundingClientRect().top - marker)
          return candidateDistance < nearestDistance ? candidate : nearest
        }, stages[0])
        updateActiveScene(stage.dataset.sceneId)
      })
    }

    const observer = typeof IntersectionObserver === 'undefined'
      ? null
      : new IntersectionObserver(syncActiveStage, {
          rootMargin: `-${headerOffset()}px 0px -42% 0px`,
          threshold: [0, .04, .3, .7]
        })
    stages.forEach((stage) => observer?.observe(stage))
    window.addEventListener('scroll', syncActiveStage, { passive: true })
    window.addEventListener('resize', syncActiveStage, { passive: true })
    syncActiveStage()

    return () => {
      window.cancelAnimationFrame(frame)
      observer?.disconnect()
      window.removeEventListener('scroll', syncActiveStage)
      window.removeEventListener('resize', syncActiveStage)
      stageRefs.current.clear()
    }
  }, [enabled, rootRef, updateActiveScene])

  return { activeScene, jumpTo }
}
