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

// Amicro 风格模块转场（zoom-in 变体）：无整屏遮罩。旧面板先行退场，
// 新面板以方向位移 + scale + 轻透视入场，子项 stagger 依次浮现。
// 性能约束：大面板只动 transform/opacity（走 GPU 合成器），
// filter blur 仅用于小面积的页头行——大面积逐帧 blur 会重栅格化导致卡顿。
export default function useDesktopSceneTransition({ enabled, activeScene, rootRef, onSceneChange }) {
  const timelineRef = useRef(null)
  const enterTweensRef = useRef([])
  const activeSceneRef = useRef(activeScene)

  useEffect(() => {
    activeSceneRef.current = activeScene
  }, [activeScene])

  useEffect(() => () => {
    timelineRef.current?.kill()
    enterTweensRef.current?.forEach((tween) => tween.kill())
  }, [])

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
    enterTweensRef.current?.forEach((tween) => tween.kill())
    enterTweensRef.current = []
    const direction = sceneOrder.indexOf(nextScene) >= sceneOrder.indexOf(currentScene) ? 1 : -1
    const headerItems = [...root.querySelectorAll('.workshop-module-header > *')]
    const previousPanel = root.querySelector(`.workshop-module-panel[data-scene-id="${currentScene}"]`)
    gsap.killTweensOf([previousPanel, ...headerItems].filter(Boolean))
    gsap.killTweensOf(entranceTargets(previousPanel))
    // 防御性复位：清掉上一轮被打断的 tween 可能残留的 opacity/filter
    gsap.set([previousPanel, ...headerItems].filter(Boolean), { clearProps: 'transform,opacity,visibility,filter' })

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
        gsap.set(panel, { clearProps: 'transform,opacity,visibility,filter' })
        // 页头子项重新查询：换场景后图标节点会被 React 重建，旧数组会漏掉新节点
        const currentHeaderItems = [...root.querySelectorAll('.workshop-module-header > *')]
        gsap.set(currentHeaderItems, { clearProps: 'transform,opacity,visibility,filter' })
        const targets = entranceTargets(panel)
        enterTweensRef.current = [
          gsap.fromTo(panel,
            { autoAlpha: .01, x: direction * 44, y: 18, scale: .955, rotateX: 3.5, transformPerspective: 1200 },
            { autoAlpha: 1, x: 0, y: 0, scale: 1, rotateX: 0, duration: .66, ease: 'expo.out', clearProps: 'transform,opacity,visibility,filter' }
          ),
          ...currentHeaderItems.map((item) => gsap.fromTo(item,
            { autoAlpha: .01, x: direction * 24, filter: 'blur(5px)' },
            { autoAlpha: 1, x: 0, filter: 'blur(0px)', duration: .5, ease: 'expo.out', clearProps: 'transform,opacity,visibility,filter' }
          )),
          ...(targets.length ? [gsap.fromTo(targets,
            { autoAlpha: .01, x: direction * 20, y: 22, scale: .97 },
            { autoAlpha: 1, x: 0, y: 0, scale: 1, duration: .68, stagger: .04, ease: 'expo.out', clearProps: 'transform,opacity,visibility,filter' }
          )] : [])
        ]
      })
    }

    const timeline = gsap.timeline({ onComplete: finish })
    if (previousPanel) {
      timeline.to(previousPanel,
        { autoAlpha: 0, x: direction * -30, scale: .975, rotateX: -2, transformPerspective: 1200, duration: .24, ease: 'power2.in' }
      )
      if (headerItems.length) {
        timeline.to(headerItems, { autoAlpha: 0, x: direction * -16, duration: .2, stagger: .02, ease: 'power2.in' }, 0)
      }
    }
    timeline.call(revealScene)
    timelineRef.current = timeline
  }, [enabled, onSceneChange, rootRef])
}
