import { useCallback, useEffect, useRef, useState } from 'react'
import { gsap } from 'gsap'
import { getFoodOverview } from '../../api/food.js'
import { useViewportKind } from '../../hooks/useViewportKind.js'
import AppSelectDesktop from './AppSelectDesktop.jsx'
import AppSelectMobile from './AppSelectMobile.jsx'

/**
 * 应用选择屏（2026-09-13）：登录之后、进入具体应用之前的一次选择。
 *
 * 「Ops 六模块」与「食品台账」是两套独立的应用壳，用户在登录后选择进入哪一个，
 * 选择结果记进 sessionStorage（每个会话一次；刷新沿用，新开标签重新选择）。
 *
 * 双端按项目规则拆成两套独立实现（AppSelectMobile / AppSelectDesktop），
 * 本文件只负责：拉食品红标摘要（卡片副状态）、入场/选中动效、把选择交回父级。
 */
export default function AppSelect({ userName, storeName, closeState, onChoose }) {
  const viewport = useViewportKind()
  const rootRef = useRef(null)
  const [flagged, setFlagged] = useState(null)
  const [leaving, setLeaving] = useState('')

  // 卡片上的「N 条红标待处理」：登录后顺手预热一次，失败静默（进入应用还有一次正式加载）。
  useEffect(() => {
    let alive = true
    getFoodOverview()
      .then((payload) => { if (alive) setFlagged(payload?.counts?.flagged ?? 0) })
      .catch(() => { if (alive) setFlagged(null) })
    return () => { alive = false }
  }, [])

  useEffect(() => {
    const root = rootRef.current
    if (!root) return undefined
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return undefined
    const context = gsap.context(() => {
      gsap.from('[data-app-select-head]', { y: 14, autoAlpha: 0, duration: .5, ease: 'expo.out' })
      gsap.from('[data-app-card]', { y: 20, autoAlpha: 0, duration: .55, stagger: .07, delay: .1, ease: 'expo.out' })
    }, root)
    return () => context.revert()
  }, [viewport])

  const choose = useCallback((appId) => {
    if (leaving) return
    setLeaving(appId)
    const root = rootRef.current
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    const finish = () => onChoose(appId)
    if (!root || reduced) { finish(); return }
    const target = root.querySelector(`[data-app-card="${appId}"]`)
    const others = root.querySelectorAll(`[data-app-card]:not([data-app-card="${appId}"])`)
    const timeline = gsap.timeline({ onComplete: finish })
    // 大面积卡片只用位移与透明度（memory 22：大表面禁 scale / blur）。
    if (others.length) timeline.to(others, { autoAlpha: 0, y: 10, duration: .24, ease: 'power2.in' }, 0)
    if (target) timeline.to(target, { y: -10, duration: .3, ease: 'expo.out' }, 0)
    timeline.to({}, { duration: .16 })
  }, [leaving, onChoose])

  const shared = { rootRef, userName, storeName, closeState, flagged, leaving, onChoose: choose }
  return viewport === 'mobile' ? <AppSelectMobile {...shared} /> : <AppSelectDesktop {...shared} />
}
