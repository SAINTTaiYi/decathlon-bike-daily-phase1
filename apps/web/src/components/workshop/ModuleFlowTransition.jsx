import { useLayoutEffect, useRef } from 'react'
import { gsap } from 'gsap'
import { sceneById } from '../../data/lookbookScenes.js'

function Chapter({ scene, kind }) {
  const Icon = scene.NavIcon
  return (
    <section className={`module-flow-chapter module-flow-chapter-${kind}`} data-flow-chapter={kind} aria-hidden="true">
      <div className="module-flow-chapter-mark"><Icon width={28} height={28} strokeWidth={1.6} /><span>{scene.no} / 06</span></div>
      <div className="module-flow-chapter-copy"><small>{scene.label}</small><strong>{scene.title}</strong><span>{scene.cn}</span></div>
      <i className="module-flow-progress" />
    </section>
  )
}

export default function ModuleFlowTransition({ transition, onComplete }) {
  const rootRef = useRef(null)

  useLayoutEffect(() => {
    if (!transition || !rootRef.current) return undefined
    const root = rootRef.current
    const from = root.querySelector('[data-flow-chapter="from"]')
    const to = root.querySelector('[data-flow-chapter="to"]')
    const progress = root.querySelectorAll('.module-flow-progress')
    const direction = transition.direction

    if (transition.reduced) {
      gsap.set(root, { autoAlpha: 1 })
      const tween = gsap.to(root, { autoAlpha: 0, duration: .12, delay: .06, onComplete })
      return () => tween.kill()
    }

    const timeline = gsap.timeline({ defaults: { ease: 'power4.inOut' }, onComplete })
    timeline
      .set(root, { autoAlpha: 1, pointerEvents: 'all' })
      .set(from, { yPercent: 0, scale: 1 })
      .set(to, { yPercent: direction > 0 ? 100 : -100, scale: .985 })
      .set(progress, { scaleX: 0, transformOrigin: direction > 0 ? 'left center' : 'right center' })
      .to(progress, { scaleX: 1, duration: .5, ease: 'power2.inOut' }, 0)
      .to(from, { yPercent: direction > 0 ? -28 : 28, scale: .975, autoAlpha: .28, duration: .54 }, 0)
      .to(to, { yPercent: 0, scale: 1, duration: .62 }, .04)
      .to(root, { autoAlpha: 0, duration: .16, ease: 'power2.out' }, .58)
    return () => timeline.kill()
  }, [onComplete, transition])

  if (!transition) return null
  return (
    <div ref={rootRef} className="module-flow-transition" role="status" aria-live="polite" aria-label={`正在切换到${sceneById(transition.to).cn}`}>
      <Chapter scene={sceneById(transition.from)} kind="from" />
      <Chapter scene={sceneById(transition.to)} kind="to" />
    </div>
  )
}
