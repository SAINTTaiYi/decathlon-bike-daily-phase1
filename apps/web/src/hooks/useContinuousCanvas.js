import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { lookbookScenes } from '../data/lookbookScenes.js'
import {
  moduleMotionValues,
  moduleProgressForGeometry,
  motifProgress,
  motifVisibility,
  narrativeMotionValues,
  objectMotionValues,
  pageProgressForGeometry,
  continuousWordFocus
} from '../utils/continuousCanvasProgress.js'

function reducedMotion() {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches || false
}

function headerOffset() {
  const value = window.getComputedStyle(document.documentElement).getPropertyValue('--ops-header-height')
  return Number.parseFloat(value) || 108
}

function writeMotionVariables(element, values, prefix) {
  element.style.setProperty(`--${prefix}-x`, `${values.x.toFixed(2)}px`)
  element.style.setProperty(`--${prefix}-y`, `${values.y.toFixed(2)}px`)
  element.style.setProperty(`--${prefix}-scale`, values.scale.toFixed(4))
  element.style.setProperty(`--${prefix}-opacity`, values.opacity.toFixed(4))
}

function writeCanvasProgress(root, stack, canvas, progress, reduce) {
  const width = window.innerWidth
  const height = window.innerHeight
  root.style.setProperty('--canvas-progress', progress.toFixed(4))
  root.style.setProperty('--canvas-field-drift', `${(reduce ? 0 : (-0.5 + progress) * height * 0.52).toFixed(2)}px`)
  root.dataset.canvasReady = 'true'

  const objectNodes = [
    ...canvas.querySelectorAll('[data-continuous-object]'),
    ...root.querySelectorAll('[data-continuous-foreground] [data-continuous-object]')
  ]
  objectNodes.forEach((object) => {
    const index = Number.parseInt(object.style.getPropertyValue('--canvas-object-index'), 10) || 0
    const motion = objectMotionValues(progress, index, width, height, { reduce })
    writeMotionVariables(object, motion, 'object')
    object.style.setProperty('--object-rotation', `${motion.rotation.toFixed(2)}deg`)
    object.dataset.objectVisible = motion.opacity > 0.02 ? 'true' : 'false'
  })

  canvas.querySelectorAll('[data-continuous-narrative]').forEach((narrative) => {
    const index = Number.parseInt(narrative.dataset.continuousNarrative, 10) || 0
    const motion = narrativeMotionValues(progress, index, width, height, { reduce })
    writeMotionVariables(narrative, motion, 'narrative')
    narrative.dataset.narrativeVisible = motion.opacity > 0.08 ? 'true' : 'false'
  })

  canvas.querySelectorAll('[data-continuous-curve]').forEach((curve) => {
    const index = Number.parseInt(curve.dataset.continuousCurve, 10) || 0
    const local = reduce ? 0.5 : motifProgress(progress, index)
    const paths = curve.querySelectorAll('[data-continuous-curve-copy]')
    paths[0]?.setAttribute('startOffset', `${local * 75}%`)
    paths[1]?.setAttribute('startOffset', `${-100 + local * 75}%`)
    curve.style.setProperty('--curve-progress', local.toFixed(4))
    curve.style.setProperty('--curve-opacity', motifVisibility(local, { reduce }).toFixed(4))
  })

  canvas.querySelectorAll('[data-continuous-trail]').forEach((trail) => {
    const index = Number.parseInt(trail.dataset.continuousTrail, 10) || 0
    const local = reduce ? 0.5 : motifProgress(progress, index)
    const words = [...trail.querySelectorAll('[data-continuous-trail-word]')]
    trail.style.setProperty('--trail-progress', local.toFixed(4))
    trail.style.setProperty('--trail-opacity', motifVisibility(local, { reduce }).toFixed(4))
    words.forEach((word, wordIndex) => {
      const focus = continuousWordFocus(local, wordIndex, words.length, { reduce })
      word.style.setProperty('--trail-word-focus', focus.toFixed(4))
    })
  })

  stack.dataset.canvasProgress = progress.toFixed(3)
}

export default function useContinuousCanvas({ enabled, rootRef, quiet = false }) {
  const sceneIds = useMemo(() => lookbookScenes.map((scene) => scene.id), [])
  const initialHashRef = useRef(window.location.hash.match(/^#module-(pulse|pickup|poster|repair|resale|sales)$/u)?.[1] || '')
  const initialHash = initialHashRef.current
  const [activeScene, setActiveScene] = useState(initialHash || sceneIds[0])
  const activeRef = useRef(activeScene)
  const quietRef = useRef(quiet)
  const sectionRefs = useRef(new Map())
  const lastScrollRef = useRef(window.scrollY)
  const initialJumpDoneRef = useRef(false)

  useEffect(() => { activeRef.current = activeScene }, [activeScene])
  useEffect(() => { quietRef.current = quiet }, [quiet])

  const updateActiveScene = useCallback((sceneId, { history = true } = {}) => {
    if (!sceneIds.includes(sceneId)) return
    if (activeRef.current !== sceneId) {
      activeRef.current = sceneId
      setActiveScene(sceneId)
    }
    if (history && window.location.hash !== `#module-${sceneId}`) {
      window.history.replaceState(window.history.state, '', `#module-${sceneId}`)
    }
  }, [sceneIds])

  const jumpTo = useCallback((targetId) => {
    if (!enabled || quietRef.current || !sceneIds.includes(targetId)) return false
    const section = sectionRefs.current.get(targetId) || document.getElementById(`module-${targetId}`)
    const stack = section?.closest('[data-continuous-stack]')
    if (!section || !stack) return false
    const top = stack.getBoundingClientRect().top + window.scrollY + section.offsetTop - headerOffset() - 10
    activeRef.current = targetId
    setActiveScene(targetId)
    window.history.pushState(window.history.state, '', `#module-${targetId}`)
    const staticBoundary = activeRef.current === 'pulse' || targetId === 'pulse'
    window.scrollTo({ top: Math.max(0, top), behavior: staticBoundary || reducedMotion() ? 'auto' : 'smooth' })
    window.requestAnimationFrame(() => section.focus({ preventScroll: true }))
    return true
  }, [enabled, sceneIds])

  useLayoutEffect(() => {
    if (!enabled) return undefined
    const root = rootRef.current || document
    const stack = root.querySelector('[data-continuous-stack]')
    const canvas = root.querySelector('[data-continuous-canvas]')
    if (!stack || !canvas) return undefined
    const sections = [...stack.querySelectorAll('[data-continuous-module]')]
    if (!sections.length) return undefined

    sectionRefs.current = new Map(sections.map((section) => [section.dataset.sceneId, section]))
    const reduce = reducedMotion()
    let frame = 0

    const settle = (section) => {
      sections.forEach((candidate) => delete candidate.dataset.interactionSettled)
      if (section) section.dataset.interactionSettled = 'true'
      root.dataset.canvasSettled = 'true'
    }
    const releaseSettle = () => {
      sections.forEach((section) => delete section.dataset.interactionSettled)
      root.dataset.canvasSettled = 'false'
    }
    const onInteraction = (event) => {
      const control = event.target.closest('button, input, textarea, select, summary, [role="button"], [role="option"], [contenteditable="true"]')
      if (!control) return
      if (event.type === 'pointerdown' && event.pointerId !== undefined && control.setPointerCapture) {
        control.setPointerCapture(event.pointerId)
      }
      settle(control.closest('[data-continuous-module]'))
    }

    const sync = () => {
      window.cancelAnimationFrame(frame)
      frame = window.requestAnimationFrame(() => {
        const header = headerOffset()
        const viewportHeight = window.innerHeight
        const viewportWidth = window.innerWidth
        const stackRect = stack.getBoundingClientRect()
        const stackDocumentTop = stackRect.top + window.scrollY
        const pageProgress = pageProgressForGeometry({
          scrollY: window.scrollY,
          stackDocumentTop,
          stackHeight: stack.offsetHeight,
          viewportHeight,
          header
        })
        writeCanvasProgress(root, stack, canvas, pageProgress, reduce)

        const geometry = sections.map((section, index) => {
          const moduleTop = stackRect.top + section.offsetTop
          const moduleHeight = section.offsetHeight
          const rect = { top: moduleTop, bottom: moduleTop + moduleHeight, height: moduleHeight }
          const progress = moduleProgressForGeometry({ moduleTop, moduleHeight, viewportHeight })
          const isStaticOverview = section.dataset.sceneId === 'pulse'
          const motion = isStaticOverview
            ? { x: 0, y: 0, scale: 1, opacity: 1, progress }
            : moduleMotionValues(progress, viewportWidth, viewportHeight, index, { reduce })
          writeMotionVariables(section, motion, 'module')
          section.style.setProperty('--module-progress', motion.progress.toFixed(4))
          if (rect.bottom > header && rect.top < viewportHeight) section.dataset.moduleInview = 'true'
          else delete section.dataset.moduleInview
          return { section, rect }
        })

        const down = window.scrollY >= lastScrollRef.current
        const focalLine = viewportHeight * 0.42 + (down ? 0 : 40)
        const crossed = geometry.filter(({ rect }) => rect.top <= focalLine)
        const candidate = (crossed.at(-1) || geometry[0]).section.dataset.sceneId
        updateActiveScene(candidate)
        lastScrollRef.current = window.scrollY
      })
    }

    const onScroll = () => {
      releaseSettle()
      sync()
    }
    const jumpFromHistory = () => {
      const targetId = window.location.hash.match(/^#module-(pulse|pickup|poster|repair|resale|sales)$/u)?.[1]
      const target = targetId ? sectionRefs.current.get(targetId) : null
      if (!target) return sync()
      activeRef.current = targetId
      setActiveScene(targetId)
      const top = stack.getBoundingClientRect().top + window.scrollY + target.offsetTop - headerOffset() - 10
      window.scrollTo({ top: Math.max(0, top), behavior: 'auto' })
      window.requestAnimationFrame(() => target.focus({ preventScroll: true }))
      sync()
    }

    root.addEventListener('pointerdown', onInteraction, true)
    root.addEventListener('focusin', onInteraction, true)
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', sync, { passive: true })
    window.addEventListener('popstate', jumpFromHistory)
    if (initialHash && !initialJumpDoneRef.current) {
      const target = sectionRefs.current.get(initialHash)
      if (target) {
        initialJumpDoneRef.current = true
        const top = stack.getBoundingClientRect().top + window.scrollY + target.offsetTop - headerOffset() - 10
        window.scrollTo({ top: Math.max(0, top), behavior: 'auto' })
        window.requestAnimationFrame(() => target.focus({ preventScroll: true }))
      }
    }
    sync()

    return () => {
      window.cancelAnimationFrame(frame)
      root.removeEventListener('pointerdown', onInteraction, true)
      root.removeEventListener('focusin', onInteraction, true)
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', sync)
      window.removeEventListener('popstate', jumpFromHistory)
      sectionRefs.current.clear()
      delete root.dataset.canvasReady
      delete root.dataset.canvasSettled
      sections.forEach((section) => delete section.dataset.interactionSettled)
    }
  }, [enabled, initialHash, rootRef, updateActiveScene])

  return { activeScene, jumpTo }
}
