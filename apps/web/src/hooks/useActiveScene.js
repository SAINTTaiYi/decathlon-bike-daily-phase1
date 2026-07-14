import { useEffect, useMemo, useState } from 'react'
import { lookbookScenes } from '../data/lookbookScenes.js'

export default function useActiveScene() {
  const [activeScene, setActiveScene] = useState('pulse')
  const sceneIds = useMemo(() => lookbookScenes.map((scene) => scene.id), [])

  useEffect(() => {
    let frame = 0
    const pick = () => {
      frame = 0
      const viewportAnchor = window.innerHeight * 0.34
      const nearEnd = document.documentElement.scrollHeight - (window.scrollY + window.innerHeight) < 80
      let best = nearEnd ? sceneIds[sceneIds.length - 1] : activeScene
      let distance = Number.POSITIVE_INFINITY
      sceneIds.forEach((id) => {
        const element = document.getElementById(id)
        if (!element) return
        const rect = element.getBoundingClientRect()
        const nextDistance = Math.abs(rect.top - viewportAnchor)
        if (rect.bottom > 96 && nextDistance < distance) { distance = nextDistance; best = id }
      })
      setActiveScene((current) => current === best ? current : best)
    }
    const schedule = () => { if (!frame) frame = window.requestAnimationFrame(pick) }
    pick()
    window.addEventListener('scroll', schedule, { passive: true })
    window.addEventListener('resize', schedule)
    return () => { window.removeEventListener('scroll', schedule); window.removeEventListener('resize', schedule); if (frame) window.cancelAnimationFrame(frame) }
  }, [activeScene, sceneIds])

  const jumpTo = (id) => {
    setActiveScene(id)
    document.getElementById(id)?.scrollIntoView({ behavior: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' })
  }

  return { activeScene, jumpTo }
}
