import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { lookbookScenes } from '../data/lookbookScenes.js'

const WHEEL_THRESHOLD = 72
const TOUCH_THRESHOLD = 64
const HINT_TIMEOUT = 1800

function reducedMotion() {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches || false
}

function atDocumentBoundary(direction) {
  const root = document.documentElement
  const maxScroll = Math.max(0, root.scrollHeight - window.innerHeight)
  return direction > 0
    ? window.scrollY >= maxScroll - 2
    : window.scrollY <= 2
}

function scrollableAncestorCanMove(target, direction) {
  let element = target instanceof Element ? target : null
  while (element && element !== document.body) {
    const style = window.getComputedStyle(element)
    if (/(auto|scroll)/u.test(style.overflowY) && element.scrollHeight > element.clientHeight + 1) {
      if (direction > 0 && element.scrollTop < element.scrollHeight - element.clientHeight - 1) return true
      if (direction < 0 && element.scrollTop > 1) return true
    }
    element = element.parentElement
  }
  return false
}

export default function useModuleFlow({ enabled, quiet = false }) {
  const sceneIds = useMemo(() => lookbookScenes.map((scene) => scene.id), [])
  const [activeScene, setActiveScene] = useState(sceneIds[0])
  const [transition, setTransition] = useState(null)
  const [boundaryHint, setBoundaryHint] = useState(null)
  const activeRef = useRef(activeScene)
  const transitionRef = useRef(transition)
  const quietRef = useRef(quiet)
  const hintTimerRef = useRef(0)

  useEffect(() => { activeRef.current = activeScene }, [activeScene])
  useEffect(() => { transitionRef.current = transition }, [transition])
  useEffect(() => { quietRef.current = quiet }, [quiet])

  const clearHint = useCallback(() => {
    window.clearTimeout(hintTimerRef.current)
    setBoundaryHint(null)
  }, [])

  const requestScene = useCallback((targetId, { origin = 'navigation' } = {}) => {
    if (!enabled || quietRef.current || transitionRef.current) return false
    const fromIndex = sceneIds.indexOf(activeRef.current)
    const toIndex = sceneIds.indexOf(targetId)
    if (toIndex < 0 || toIndex === fromIndex) return false
    clearHint()
    setTransition({
      from: activeRef.current,
      to: targetId,
      direction: toIndex > fromIndex ? 1 : -1,
      origin,
      reduced: reducedMotion()
    })
    return true
  }, [clearHint, enabled, sceneIds])

  const requestBoundary = useCallback((direction, origin) => {
    const currentIndex = sceneIds.indexOf(activeRef.current)
    const targetId = sceneIds[currentIndex + direction]
    if (!targetId || transitionRef.current || quietRef.current) return false
    if (boundaryHint?.target === targetId && boundaryHint?.direction === direction) {
      return requestScene(targetId, { origin })
    }
    window.clearTimeout(hintTimerRef.current)
    setBoundaryHint({ target: targetId, direction, origin })
    hintTimerRef.current = window.setTimeout(() => setBoundaryHint(null), HINT_TIMEOUT)
    return true
  }, [boundaryHint, requestScene, sceneIds])

  const completeTransition = useCallback(() => {
    const pending = transitionRef.current
    if (!pending) return
    setActiveScene(pending.to)
    activeRef.current = pending.to
    setTransition(null)
    transitionRef.current = null
    window.requestAnimationFrame(() => {
      window.scrollTo({ top: 0, behavior: 'auto' })
      window.requestAnimationFrame(() => {
        document.getElementById(`module-${pending.to}`)?.focus({ preventScroll: true })
      })
    })
  }, [])

  useEffect(() => {
    if (!transition) return undefined
    document.body.classList.add('module-transitioning')
    return () => document.body.classList.remove('module-transitioning')
  }, [transition])

  useEffect(() => {
    if (!enabled) return undefined
    let wheelTotal = 0
    let wheelDirection = 0
    let wheelTimer = 0
    let touchStart = null

    const resetWheel = () => {
      wheelTotal = 0
      wheelDirection = 0
      window.clearTimeout(wheelTimer)
    }

    const onWheel = (event) => {
      if (quietRef.current || transitionRef.current || Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return
      const direction = event.deltaY > 0 ? 1 : -1
      if (!atDocumentBoundary(direction) || scrollableAncestorCanMove(event.target, direction)) {
        if (boundaryHint) clearHint()
        resetWheel()
        return
      }
      const index = sceneIds.indexOf(activeRef.current)
      if (!sceneIds[index + direction]) return
      event.preventDefault()
      if (wheelDirection !== direction) {
        wheelTotal = 0
        wheelDirection = direction
      }
      wheelTotal += Math.min(40, Math.abs(event.deltaY))
      window.clearTimeout(wheelTimer)
      wheelTimer = window.setTimeout(resetWheel, 180)
      if (wheelTotal >= WHEEL_THRESHOLD) {
        resetWheel()
        requestBoundary(direction, 'wheel')
      }
    }

    const onTouchStart = (event) => {
      if (quietRef.current || transitionRef.current || event.touches.length !== 1) return
      touchStart = { y: event.touches[0].clientY, target: event.target }
    }

    const onTouchEnd = (event) => {
      if (!touchStart || quietRef.current || transitionRef.current) return
      const endY = event.changedTouches[0]?.clientY ?? touchStart.y
      const delta = touchStart.y - endY
      const direction = delta > 0 ? 1 : -1
      const target = touchStart.target
      touchStart = null
      if (Math.abs(delta) < TOUCH_THRESHOLD || !atDocumentBoundary(direction) || scrollableAncestorCanMove(target, direction)) return
      requestBoundary(direction, 'touch')
    }

    const onKeyDown = (event) => {
      if (quietRef.current || transitionRef.current || event.defaultPrevented) return
      const direction = event.key === 'PageDown' ? 1 : event.key === 'PageUp' ? -1 : 0
      if (!direction || !atDocumentBoundary(direction)) return
      const index = sceneIds.indexOf(activeRef.current)
      if (!sceneIds[index + direction]) return
      event.preventDefault()
      requestBoundary(direction, 'keyboard')
    }

    window.addEventListener('wheel', onWheel, { passive: false })
    window.addEventListener('touchstart', onTouchStart, { passive: true })
    window.addEventListener('touchend', onTouchEnd, { passive: true })
    window.addEventListener('keydown', onKeyDown)
    return () => {
      resetWheel()
      window.removeEventListener('wheel', onWheel)
      window.removeEventListener('touchstart', onTouchStart)
      window.removeEventListener('touchend', onTouchEnd)
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [boundaryHint, clearHint, enabled, requestBoundary, sceneIds])

  useEffect(() => () => window.clearTimeout(hintTimerRef.current), [])

  return {
    activeScene,
    transition,
    boundaryHint,
    jumpTo: requestScene,
    completeTransition,
    clearBoundaryHint: clearHint
  }
}
