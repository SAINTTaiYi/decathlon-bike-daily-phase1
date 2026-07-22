import { useEffect, useMemo, useState } from 'react'
import { lookbookScenes } from '../data/lookbookScenes.js'

export default function useActiveScene() {
  const [activeScene, setActiveScene] = useState('pulse')
  const sceneIds = useMemo(() => lookbookScenes.map((scene) => scene.id), [])

  useEffect(() => {
    if (!('IntersectionObserver' in window)) return undefined
    const observer = new IntersectionObserver((entries) => {
      const visible = entries
        .filter((entry) => entry.isIntersecting)
        .sort((left, right) => Math.abs(left.boundingClientRect.top) - Math.abs(right.boundingClientRect.top))
      if (visible[0]?.target?.id) setActiveScene(visible[0].target.id)
    }, { rootMargin: '-16% 0px -68% 0px', threshold: 0 })
    sceneIds.forEach((id) => {
      const element = document.getElementById(id)
      if (element) observer.observe(element)
    })
    return () => observer.disconnect()
  }, [sceneIds])

  const jumpTo = (id) => {
    setActiveScene(id)
    document.getElementById(id)?.scrollIntoView({ behavior: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' })
  }

  return { activeScene, jumpTo }
}
