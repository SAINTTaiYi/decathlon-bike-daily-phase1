import { useCallback, useEffect, useRef } from 'react'
import { gsap } from 'gsap'

const sceneOrder = ['pulse', 'pickup', 'poster', 'repair', 'resale', 'sales']

function prefersReducedMotion() {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches || false
}

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

// Amicro 风格模块转场（zoom-in 变体）：无整屏遮罩。旧面板带 blur/透视退场，
// 新面板以 scale + blur + 轻微 rotateX 的 3D 入场展开，子项 stagger 依次浮现。
export default function useDesktopSceneTransition({ enabled, activeScene, rootRef, onSceneChange }) {
  const timelineRef = useRef(null)
  const activeSceneRef = useRef(activeScene)

  useEffect(() => {
    activeSceneRef.current = activeScene
  }, [activeScene])

  useEffect(() => () => timelineRef.current?.kill(), [])

  return useCallback((nextScene) => {
    const currentScene = activeSceneRef.current
    if (!enabled || nextScene === currentScene) return
    const root = rootRef.current
    if (!root || prefersReducedMotion()) {
      activeSceneRef.current = nextScene
      onSceneChange(nextScene)
      return
    }

    timelineRef.current?.kill()
    const direction = sceneOrder.indexOf(nextScene) >= sceneOrder.indexOf(currentScene) ? 1 : -1
    const headerItems = [...root.querySelectorAll('.workshop-module-header > *')]
    const previousPanel = root.querySelector(`.workshop-module-panel[data-scene-id="${currentScene}"]`)
    gsap.killTweensOf([previousPanel, ...headerItems].filter(Boolean))
    gsap.killTweensOf(entranceTargets(previousPanel))

    root.dataset.desktopSceneDirection = direction > 0 ? 'forward' : 'backward'
    root.dataset.desktopSceneTransitioning = 'true'

    const finish = () => {
      delete root.dataset.desktopSceneTransitioning
    }
    const revealScene = () => {
      activeSceneRef.current = nextScene
      onSceneChange(nextScene)
      window.requestAnimationFrame(() => {
        const panel = root.querySelector(`.workshop-module-panel[data-scene-id="${nextScene}"]`)
        if (!panel) return
        // 旧面板退场残留的内联样式先清干净，避免上一轮 opacity:0/filter 泄漏
        gsap.set(panel, { clearProps: 'transform,opacity,visibility,filter' })
        const targets = entranceTargets(panel)
        gsap.fromTo(panel,
          { autoAlpha: .01, x: direction * 44, y: 18, scale: .955, rotateX: 3.5, transformPerspective: 1200, filter: 'blur(14px)' },
          { autoAlpha: 1, x: 0, y: 0, scale: 1, rotateX: 0, filter: 'blur(0px)', duration: .66, ease: 'expo.out', clearProps: 'transform,opacity,visibility,filter' }
        )
        if (targets.length) gsap.fromTo(targets,
          { autoAlpha: .01, x: direction * 20, y: 22, scale: .97, filter: 'blur(8px)' },
          { autoAlpha: 1, x: 0, y: 0, scale: 1, filter: 'blur(0px)', duration: .68, stagger: .04, ease: 'expo.out', clearProps: 'transform,opacity,visibility,filter' }
        )
        gsap.fromTo(headerItems,
          { autoAlpha: .01, x: direction * 28, filter: 'blur(6px)' },
          { autoAlpha: 1, x: 0, filter: 'blur(0px)', duration: .52, stagger: .04, ease: 'expo.out', clearProps: 'transform,opacity,visibility,filter' }
        )
      })
    }

    const timeline = gsap.timeline({ onComplete: finish })
    if (previousPanel) {
      timeline.to(previousPanel,
        { autoAlpha: 0, x: direction * -30, scale: .975, rotateX: -2, transformPerspective: 1200, filter: 'blur(10px)', duration: .24, ease: 'power2.in' }
      )
      if (headerItems.length) {
        timeline.to(headerItems, { autoAlpha: 0, x: direction * -16, filter: 'blur(5px)', duration: .2, stagger: .02, ease: 'power2.in' }, 0)
      }
    }
    timeline.call(revealScene)
    timelineRef.current = timeline
  }, [enabled, onSceneChange, rootRef])
}
