import { useCallback, useEffect, useRef } from 'react'
import { gsap } from 'gsap'

const sceneOrder = ['pulse', 'pickup', 'poster', 'repair', 'resale', 'sales']

function prefersReducedMotion() {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches || false
}

function entranceTargets(panel) {
  if (!panel) return []
  // 注意：不含 .pickup-card-frame——卡片有自己的 CSS 入场动画（data-entering），
  // CSS animation 会覆盖 GSAP 内联样式，两套动画同帧打架会让文字抽搐。
  const selectors = [
    '.ops-mobile-overview > *',
    '.pickup-queue-controls',
    '.pickup-ledger-board',
    '.sales-input-summary > *',
    '.look-section > .scene-title',
    '.look-section > .record-ledger',
    '.look-section > .resale-register'
  ]
  return [...new Set(selectors.flatMap((selector) => [...panel.querySelectorAll(selector)]))].slice(0, 14)
}

// Amicro 风格模块转场（fade-up 变体）：无整屏遮罩。旧面板先行退场，
// 新面板带方向位移浮现，子项 stagger 依次入场。
// 文字安全约束：大面板（文字载体）只动 x/y/opacity——scale/rotateX 会让
// 文字在分数缩放下逐帧重栅格化，动画结束移除 transform 时"跳回清晰"即抽搐；
// filter blur 仅用于小面积的页头行。
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
    // 被打断的时间线不会触发 onComplete，先清掉过期标记（will-change 常驻会拖慢文字渲染）
    delete root.dataset.desktopSceneTransitioning
    const direction = sceneOrder.indexOf(nextScene) >= sceneOrder.indexOf(currentScene) ? 1 : -1
    const headerItems = [...root.querySelectorAll('.workshop-module-header > *')]
    const previousPanel = root.querySelector(`.workshop-module-panel[data-scene-id="${currentScene}"]`)
    gsap.killTweensOf([previousPanel, ...headerItems].filter(Boolean))
    gsap.killTweensOf(entranceTargets(previousPanel))
    // 不做防御性 clearProps：被打断的 tween 处于中间值时，清 props 会瞬间跳回原位（抽搐）；
    // 退场用 .to() 从当前值平滑续接，入场用 fromTo 强制完整区间，不会残留卡死状态。

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
        // 页头子项必须重新查询：换场景后图标节点会被 React 重建，
        // 搜索框 Portal 插槽（.workshop-module-search）也在这里，必须一并恢复
        const currentHeaderItems = [...root.querySelectorAll('.workshop-module-header > *')]
        const targets = entranceTargets(panel)
        enterTweensRef.current = [
          gsap.fromTo(panel,
            { autoAlpha: .01, x: direction * 34, y: 14 },
            { autoAlpha: 1, x: 0, y: 0, duration: .5, ease: 'expo.out', clearProps: 'transform,opacity,visibility' }
          ),
          ...currentHeaderItems.map((item) => gsap.fromTo(item,
            { autoAlpha: .01, x: direction * 24, filter: 'blur(5px)' },
            { autoAlpha: 1, x: 0, filter: 'blur(0px)', duration: .48, ease: 'expo.out', clearProps: 'transform,opacity,visibility,filter' }
          )),
          ...(targets.length ? [gsap.fromTo(targets,
            { autoAlpha: .01, x: direction * 18, y: 16 },
            { autoAlpha: 1, x: 0, y: 0, duration: .56, stagger: .04, ease: 'expo.out', overwrite: 'auto', clearProps: 'transform,opacity,visibility' }
          )] : [])
        ]
      })
    }

    const timeline = gsap.timeline({ onComplete: finish })
    if (previousPanel) {
      timeline.to(previousPanel,
        { autoAlpha: 0, x: direction * -24, duration: .2, ease: 'power2.in' }
      )
      if (headerItems.length) {
        timeline.to(headerItems, { autoAlpha: 0, x: direction * -14, duration: .16, stagger: .02, ease: 'power2.in' }, 0)
      }
    }
    timeline.call(revealScene)
    timelineRef.current = timeline
  }, [enabled, onSceneChange, rootRef])
}
