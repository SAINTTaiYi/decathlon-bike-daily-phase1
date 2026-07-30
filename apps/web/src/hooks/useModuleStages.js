import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { lookbookScenes } from '../data/lookbookScenes.js'
import { stageMotionValues, stageProgressForGeometry, stageWordFocus } from '../utils/moduleStageProgress.js'

function reducedMotion() {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches || false
}

function headerOffset() {
  const value = window.getComputedStyle(document.documentElement).getPropertyValue('--ops-header-height')
  return Number.parseFloat(value) || 108
}

function writeStageProgress(stage, progress, reduce) {
  const motion = stageMotionValues(progress, window.innerHeight, { reduce })
  stage.style.setProperty('--module-progress', motion.progress.toFixed(4))
  stage.style.setProperty('--stage-title-2-y', `${motion.title2Y}px`)
  stage.style.setProperty('--stage-title-3-y', `${motion.title3Y}px`)
  stage.style.setProperty('--stage-backdrop-y', `${motion.backdropY}px`)
  stage.style.setProperty('--stage-object-y', `${motion.objectY}px`)
  stage.style.setProperty('--stage-object-scale', motion.objectScale.toFixed(4))
  stage.dataset.stageProgress = motion.progress.toFixed(3)

  const paths = stage.querySelectorAll('[data-stage-curve-copy]')
  paths[0]?.setAttribute('startOffset', `${motion.curveOffset}%`)
  paths[1]?.setAttribute('startOffset', `${motion.curveOffsetMirror}%`)

  const words = [...stage.querySelectorAll('[data-stage-trail-word]')]
  words.forEach((word, index) => {
    const focus = stageWordFocus(motion.progress, index, words.length, { reduce })
    word.style.setProperty('--stage-word-focus', focus.toFixed(4))
  })
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
    const reduce = reducedMotion()
    let frame = 0

    const syncStages = () => {
      window.cancelAnimationFrame(frame)
      frame = window.requestAnimationFrame(() => {
        const header = headerOffset()
        const marker = Math.min(window.innerHeight - 1, header + Math.max(36, window.innerHeight * 0.18))
        const geometry = stages.map((stage) => {
          const rect = stage.getBoundingClientRect()
          const runway = stage.querySelector('[data-module-stage-runway]')
          const cover = stage.querySelector('[data-module-stage-cover]')
          const runwayHeight = runway?.offsetHeight || rect.height
          const coverHeight = cover?.offsetHeight || Math.max(1, window.innerHeight - header)
          const progress = stageProgressForGeometry({
            stageTop: rect.top,
            header,
            runwayHeight,
            coverHeight
          })
          writeStageProgress(stage, progress, reduce)
          return { stage, rect }
        })
        const containing = geometry.find(({ rect }) => rect.top <= marker && rect.bottom > marker)
        const nearest = geometry.reduce((best, item) => (
          Math.abs(item.rect.top - marker) < Math.abs(best.rect.top - marker) ? item : best
        ), geometry[0])
        updateActiveScene((containing || nearest).stage.dataset.sceneId)
      })
    }

    const observer = typeof IntersectionObserver === 'undefined'
      ? null
      : new IntersectionObserver((entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting) entry.target.dataset.stageInview = 'true'
          })
          syncStages()
        }, {
          rootMargin: `-${headerOffset()}px 0px -8% 0px`,
          threshold: [0, 0.04, 0.3, 0.7]
        })

    stages.forEach((stage) => {
      if (!observer || reduce) stage.dataset.stageInview = 'true'
      observer?.observe(stage)
    })
    window.addEventListener('scroll', syncStages, { passive: true })
    window.addEventListener('resize', syncStages, { passive: true })
    syncStages()

    return () => {
      window.cancelAnimationFrame(frame)
      observer?.disconnect()
      window.removeEventListener('scroll', syncStages)
      window.removeEventListener('resize', syncStages)
      stageRefs.current.clear()
    }
  }, [enabled, rootRef, updateActiveScene])

  return { activeScene, jumpTo }
}
