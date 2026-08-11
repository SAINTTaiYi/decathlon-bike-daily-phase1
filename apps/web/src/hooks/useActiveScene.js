import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { lookbookScenes } from '../data/lookbookScenes.js'

const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
const moduleElement = (id) => document.getElementById(`module-${id}`)
const scrollKeys = new Set([' ', 'ArrowDown', 'ArrowUp', 'PageDown', 'PageUp', 'Home', 'End'])

const isAtNavigationTarget = (section) => {
  const rect = section.getBoundingClientRect()
  const nearDocumentEnd = document.documentElement.scrollHeight - (window.scrollY + window.innerHeight) < 8
  return Math.abs(rect.top) <= 8 || (nearDocumentEnd && rect.bottom > 0)
}

export default function useActiveScene({ enabled = true, rootRef } = {}) {
  const [activeScene, setActiveScene] = useState('pulse')
  const sceneIds = useMemo(() => lookbookScenes.map((scene) => scene.id), [])
  const navigationRef = useRef(null)

  const cancelNavigation = useCallback(() => {
    const navigation = navigationRef.current
    if (!navigation) return
    if (navigation.frame) window.cancelAnimationFrame(navigation.frame)
    navigationRef.current = null
  }, [])

  useEffect(() => {
    if (!enabled) {
      cancelNavigation()
      return undefined
    }

    let frame = 0
    const pick = () => {
      frame = 0
      // A dock jump owns the selected state until its destination is reached or the user interrupts it.
      if (navigationRef.current) return
      const root = rootRef?.current || document
      const sections = sceneIds.map(moduleElement).filter((section) => section && root.contains(section))
      if (!sections.length) return

      const nearEnd = document.documentElement.scrollHeight - (window.scrollY + window.innerHeight) < 48
      const anchor = Math.min(window.innerHeight * 0.34, 240)
      let best = nearEnd ? sections.at(-1).dataset.sceneId : sections[0].dataset.sceneId
      let distance = Number.POSITIVE_INFINITY
      for (const section of sections) {
        const rect = section.getBoundingClientRect()
        if (rect.bottom <= 0 || rect.top >= window.innerHeight) continue
        const nextDistance = Math.abs(rect.top - anchor)
        if (nextDistance < distance) {
          distance = nextDistance
          best = section.dataset.sceneId
        }
      }
      setActiveScene((current) => current === best ? current : best)
    }

    const schedule = () => {
      if (!frame) frame = window.requestAnimationFrame(pick)
    }

    const cancelForManualInput = (event) => {
      if (!navigationRef.current) return
      if (event.type === 'keydown' && (!scrollKeys.has(event.key) || event.metaKey || event.ctrlKey || event.altKey)) return
      cancelNavigation()
      schedule()
    }

    const settleAtTarget = () => {
      const navigation = navigationRef.current
      if (!navigation) return
      const section = moduleElement(navigation.sceneId)
      if (!section) return
      // Native scrollend means either the requested smooth jump arrived or the user stopped it.
      // In both cases release the lock without intercepting wheel, touchmove, or keyboard scrolling.
      cancelNavigation()
      schedule()
    }

    pick()
    window.addEventListener('scroll', schedule, { passive: true })
    window.addEventListener('resize', schedule)
    window.addEventListener('scrollend', settleAtTarget, { passive: true })
    window.addEventListener('pointerdown', cancelForManualInput, { passive: true })
    window.addEventListener('touchstart', cancelForManualInput, { passive: true })
    ;['wheel', 'keydown'].forEach((eventName) => window.addEventListener(eventName, cancelForManualInput, eventName === 'wheel' ? { passive: true } : undefined))

    return () => {
      window.removeEventListener('scroll', schedule)
      window.removeEventListener('resize', schedule)
      window.removeEventListener('scrollend', settleAtTarget)
      window.removeEventListener('pointerdown', cancelForManualInput)
      window.removeEventListener('touchstart', cancelForManualInput)
      ;['wheel', 'keydown'].forEach((eventName) => window.removeEventListener(eventName, cancelForManualInput))
      if (frame) window.cancelAnimationFrame(frame)
      cancelNavigation()
    }
  }, [cancelNavigation, enabled, rootRef, sceneIds])

  const jumpTo = useCallback((id) => {
    const section = moduleElement(id)
    if (!section) return

    cancelNavigation()
    // Set the dock state before scrolling so intermediate modules cannot steal its highlight.
    setActiveScene(id)
    const navigation = { sceneId: id, frame: 0, lastY: window.scrollY, hasMoved: false, stillFrames: 0 }
    navigationRef.current = navigation

    const watchForArrival = () => {
      if (navigationRef.current !== navigation) return
      if (isAtNavigationTarget(section)) {
        cancelNavigation()
        return
      }
      const nextY = window.scrollY
      navigation.hasMoved ||= Math.abs(nextY - navigation.lastY) > 0.5
      navigation.stillFrames = Math.abs(nextY - navigation.lastY) < 0.5 ? navigation.stillFrames + 1 : 0
      navigation.lastY = nextY
      // Some engines do not dispatch scrollend. A stalled native scroll is either completion or interruption;
      // release the lock so viewport tracking immediately represents the user's actual resting position.
      if (navigation.hasMoved && navigation.stillFrames >= 4) {
        cancelNavigation()
        return
      }
      navigation.frame = window.requestAnimationFrame(watchForArrival)
    }

    section.scrollIntoView({ behavior: reducedMotion() ? 'auto' : 'smooth', block: 'start' })
    navigation.frame = window.requestAnimationFrame(watchForArrival)
    window.requestAnimationFrame(() => section.focus({ preventScroll: true }))
  }, [cancelNavigation])

  return { activeScene, jumpTo }
}
