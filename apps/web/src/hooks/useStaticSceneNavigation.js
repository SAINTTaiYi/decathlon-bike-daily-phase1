import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { lookbookScenes } from '../data/lookbookScenes.js'

const scenePattern = /^#module-(pulse|pickup|poster|repair|resale|sales)$/u

export default function useStaticSceneNavigation({ enabled }) {
  const sceneIds = useMemo(() => lookbookScenes.map(({ id }) => id), [])
  const initialScene = window.location.hash.match(scenePattern)?.[1] || sceneIds[0]
  const [activeScene, setActiveScene] = useState(initialScene)
  const activeRef = useRef(initialScene)

  useEffect(() => { activeRef.current = activeScene }, [activeScene])

  const applyScene = useCallback((sceneId, { history = 'push', focus = true } = {}) => {
    if (!enabled || !sceneIds.includes(sceneId)) return false
    activeRef.current = sceneId
    setActiveScene(sceneId)
    const hash = `#module-${sceneId}`
    if (window.location.hash !== hash) {
      if (history === 'replace') window.history.replaceState(window.history.state, '', hash)
      else if (history === 'push') window.history.pushState(window.history.state, '', hash)
    }
    window.scrollTo({ top: 0, behavior: 'auto' })
    if (focus) window.requestAnimationFrame(() => document.getElementById(`module-${sceneId}`)?.focus({ preventScroll: true }))
    return true
  }, [enabled, sceneIds])

  useEffect(() => {
    if (!enabled) return undefined
    const onPopState = () => {
      const target = window.location.hash.match(scenePattern)?.[1] || sceneIds[0]
      activeRef.current = target
      setActiveScene(target)
      window.scrollTo({ top: 0, behavior: 'auto' })
      window.requestAnimationFrame(() => document.getElementById(`module-${target}`)?.focus({ preventScroll: true }))
    }
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [enabled, sceneIds])

  return { activeScene, jumpTo: applyScene }
}
