import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { gsap } from 'gsap'
import { lookbookScenes } from '../data/lookbookScenes.js'

const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
const moduleElement = (id) => document.getElementById(`module-${id}`)
const scrollKeys = new Set([' ', 'ArrowDown', 'ArrowUp', 'PageDown', 'PageUp', 'Home', 'End'])

const sceneOrder = ['pulse', 'pickup', 'poster', 'repair', 'resale', 'sales']

const isAtNavigationTarget = (section) => {
  const rect = section.getBoundingClientRect()
  const nearDocumentEnd = document.documentElement.scrollHeight - (window.scrollY + window.innerHeight) < 8
  return Math.abs(rect.top) <= 8 || (nearDocumentEnd && rect.bottom > 0)
}

// 与桌面端 useDesktopSceneTransition 保持同款入场目标与动画参数
function entranceTargets(panel) {
  if (!panel) return []
  const selectors = [
    '.ops-mobile-overview > *',
    '.pickup-queue-controls',
    '.pickup-ledger-board',
    '.pickup-card-frame',
    '.sales-input-summary > *',
    '.look-section > .scene-title',
    '.look-section > .record-ledger',
    '.look-section > .resale-register'
  ]
  return [...new Set(selectors.flatMap((selector) => [...panel.querySelectorAll(selector)]))].slice(0, 14)
}

export default function useActiveScene({ enabled = true, rootRef, viewMode = false } = {}) {
  const [activeScene, setActiveScene] = useState('pulse')
  const sceneIds = useMemo(() => lookbookScenes.map((scene) => scene.id), [])
  const navigationRef = useRef(null)
  const activeSceneRef = useRef('pulse')
  const timelineRef = useRef(null)
  // viewMode：切换模块时按场景记忆窗口滚动位置，切回时恢复
  const scrollPositionsRef = useRef({})

  useEffect(() => {
    activeSceneRef.current = activeScene
  }, [activeScene])

  useEffect(() => () => timelineRef.current?.kill(), [])

  const cancelNavigation = useCallback(() => {
    const navigation = navigationRef.current
    if (!navigation) return
    if (navigation.frame) window.cancelAnimationFrame(navigation.frame)
    navigationRef.current = null
  }, [])

  // ---- viewMode：点击导航栏切换单模块视图（与桌面端一致的退场+fade-up 转场）----
  useLayoutEffect(() => {
    if (!enabled || !viewMode) return undefined
    const shell = rootRef?.current?.querySelector('.workshop-shell') || document.querySelector('.workshop-shell')
    if (shell) {
      shell.dataset.mobileScene = activeSceneRef.current
      rootRef?.current?.setAttribute?.('data-mobile-scene', activeSceneRef.current)
      window.scrollTo(0, 0)
    }
    return undefined
  }, [enabled, rootRef, viewMode])

  useEffect(() => {
    if (!enabled || !viewMode) return undefined
    return () => timelineRef.current?.kill()
  }, [enabled, viewMode])

  const jumpView = useCallback((id) => {
    if (!enabled || id === activeSceneRef.current) return
    const shell = rootRef?.current?.querySelector('.workshop-shell') || document.querySelector('.workshop-shell')
    const targetPanel = moduleElement(id)
    if (!shell || !targetPanel) return

    // 记忆当前场景的滚动位置，切回时恢复
    scrollPositionsRef.current[activeSceneRef.current] = window.scrollY
    const currentScene = activeSceneRef.current
    const currentPanel = moduleElement(currentScene)
    const direction = sceneOrder.indexOf(id) >= sceneOrder.indexOf(currentScene) ? 1 : -1
    const reveal = () => {
      shell.dataset.mobileScene = id
      rootRef?.current?.setAttribute?.('data-mobile-scene', id)
      activeSceneRef.current = id
      setActiveScene(id)
      window.scrollTo(0, scrollPositionsRef.current[id] ?? 0)
      window.requestAnimationFrame(() => {
        const nextPanel = moduleElement(id)
        nextPanel?.focus({ preventScroll: true })
        if (!nextPanel) return
        // 旧面板退场残留的内联样式先清掉，避免上一轮 opacity:0/filter 泄漏
        gsap.set(nextPanel, { clearProps: 'transform,opacity,visibility,filter' })
        const targets = entranceTargets(nextPanel)
        // Amicro zoom-in 变体：方向位移 + scale + blur + 轻透视，expo.out 收尾
        gsap.fromTo(nextPanel,
          { autoAlpha: .01, x: direction * 28, y: 12, scale: .965, rotateX: 3, transformPerspective: 1100, filter: 'blur(12px)' },
          { autoAlpha: 1, x: 0, y: 0, scale: 1, rotateX: 0, filter: 'blur(0px)', duration: .56, ease: 'expo.out', overwrite: 'auto', clearProps: 'transform,opacity,visibility,filter' }
        )
        if (targets.length) gsap.fromTo(targets,
          { autoAlpha: .01, x: direction * 14, y: 16, scale: .975, filter: 'blur(7px)' },
          { autoAlpha: 1, x: 0, y: 0, scale: 1, filter: 'blur(0px)', duration: .6, stagger: .035, ease: 'expo.out', overwrite: 'auto', clearProps: 'transform,opacity,visibility,filter' }
        )
      })
    }

    if (reducedMotion()) {
      reveal()
      return
    }

    timelineRef.current?.kill()
    const headerItems = [...(rootRef?.current?.querySelectorAll('.workshop-module-header > *') || [])]
    gsap.killTweensOf([currentPanel, targetPanel, ...headerItems].filter(Boolean))
    gsap.killTweensOf(entranceTargets(targetPanel))

    shell.dataset.mobileSceneDirection = direction > 0 ? 'forward' : 'backward'
    shell.dataset.mobileSceneTransitioning = 'true'

    const finish = () => {
      delete shell.dataset.mobileSceneTransitioning
    }

    // 无遮罩转场：旧面板带 blur 退场，再切换并播放新面板 zoom-in 入场
    const timeline = gsap.timeline({ onComplete: finish })
    if (currentPanel) {
      timeline.to(currentPanel,
        { autoAlpha: 0, x: direction * -20, scale: .98, rotateX: -1.5, transformPerspective: 1100, filter: 'blur(8px)', duration: .22, ease: 'power2.in' }
      )
    }
    if (headerItems.length) {
      timeline.to(headerItems, { autoAlpha: 0, x: direction * -12, filter: 'blur(4px)', duration: .18, stagger: .02, ease: 'power2.in' }, 0)
    }
    timeline.call(reveal)
    timelineRef.current = timeline
  }, [enabled, rootRef])



  // ---- 非 viewMode：滚动驱动的场景跟踪（桌面端与旧移动端行为）----
  useEffect(() => {
    if (!enabled || viewMode) {
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
  }, [cancelNavigation, enabled, rootRef, sceneIds, viewMode])

  // 非 viewMode 的平滑滚动跳转（旧移动端/桌面端锚点兜底）
  const scrollJump = useCallback((id) => {
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

  const jumpTo = useCallback((id) => {
    if (viewMode) {
      jumpView(id)
      return
    }
    scrollJump(id)
  }, [jumpView, scrollJump, viewMode])

  return { activeScene, jumpTo }
}
