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
    const wipe = root.querySelector('.desktop-scene-transition-wipe')
    const headerItems = [...root.querySelectorAll('.workshop-module-header > *')]
    const previousPanel = root.querySelector(`.workshop-module-panel[data-scene-id="${currentScene}"]`)
    gsap.killTweensOf([wipe, previousPanel, ...headerItems].filter(Boolean))
    gsap.killTweensOf(entranceTargets(previousPanel))
    if (!wipe) {
      activeSceneRef.current = nextScene
      onSceneChange(nextScene)
      return
    }

    root.dataset.desktopSceneDirection = direction > 0 ? 'forward' : 'backward'
    root.dataset.desktopSceneTransitioning = 'true'
    gsap.set(wipe, { autoAlpha: 1, scaleX: 0, transformOrigin: direction > 0 ? 'left center' : 'right center' })

    const finish = () => {
      delete root.dataset.desktopSceneTransitioning
      gsap.set(wipe, { clearProps: 'transform,opacity,visibility,transformOrigin' })
    }
    const revealScene = () => {
      activeSceneRef.current = nextScene
      onSceneChange(nextScene)
      window.requestAnimationFrame(() => {
        const panel = root.querySelector(`.workshop-module-panel[data-scene-id="${nextScene}"]`)
        const targets = entranceTargets(panel)
        gsap.fromTo(panel,
          { autoAlpha: .01, x: direction * 58, scale: .975, clipPath: direction > 0 ? 'inset(0 0 0 14%)' : 'inset(0 14% 0 0)' },
          { autoAlpha: 1, x: 0, scale: 1, clipPath: 'inset(0 0% 0 0%)', duration: .72, ease: 'expo.out', clearProps: 'transform,opacity,visibility,clipPath' }
        )
        if (targets.length) gsap.fromTo(targets,
          { autoAlpha: .01, x: direction * 26, y: 32, scale: .965 },
          { autoAlpha: 1, x: 0, y: 0, scale: 1, duration: .78, stagger: .055, ease: 'power4.out', clearProps: 'transform,opacity,visibility' }
        )
        gsap.fromTo(headerItems,
          { autoAlpha: .01, x: direction * 34 },
          { autoAlpha: 1, x: 0, duration: .55, stagger: .045, ease: 'power4.out', clearProps: 'transform,opacity,visibility' }
        )
        const activeButton = root.querySelector('.look-dock button[data-active="true"]')
        if (activeButton) gsap.fromTo(activeButton, { scale: .88 }, { scale: 1, duration: .58, ease: 'back.out(1.9)', clearProps: 'scale' })
      })
    }

    const timeline = gsap.timeline({ onComplete: finish })
      .to(wipe, { scaleX: 1, duration: .34, ease: 'power4.inOut' })
      .call(revealScene)
      .set(wipe, { transformOrigin: direction > 0 ? 'right center' : 'left center' })
      .to(wipe, { scaleX: 0, duration: .54, ease: 'expo.inOut' }, '+=.04')
    timelineRef.current = timeline
  }, [enabled, onSceneChange, rootRef])
}
