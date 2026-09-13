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

  // 入场动画是纯装饰：用 fromTo + clearProps 收尾，动画结束后元素上不留任何
  // 内联样式。此前用 gsap.from + context.revert()，一旦 effect 重跑（视口变化）
  // 就会把卡片还原成 from 的初始态（opacity 0）——2026-09-13 用户截图里整块
  // 卡片消失正是这个原因。关键 UI 的入场绝不能留下「可能不可见」的状态。
  useEffect(() => {
    const root = rootRef.current
    if (!root) return undefined
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return undefined
    const context = gsap.context(() => {
      gsap.fromTo('[data-app-select-head]',
        { y: 14, autoAlpha: 0 },
        { y: 0, autoAlpha: 1, duration: .5, ease: 'expo.out', clearProps: 'transform,opacity,visibility' })
      gsap.fromTo('[data-app-card]',
        { y: 20, autoAlpha: 0 },
        { y: 0, autoAlpha: 1, duration: .55, stagger: .07, delay: .1, ease: 'expo.out', clearProps: 'transform,opacity,visibility' })
    }, root)
    return () => context.revert()
    // 只在挂载时跑一次：视口变化重跑会把卡片重置回初始态。
  }, [])

  const choose = useCallback((appId) => {
    if (leaving) return
    setLeaving(appId)
    const root = rootRef.current
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    // 跳转由定时器兜底，绝不挂在 GSAP 的 onComplete 上：动画一旦被打断
    // （标签切后台、ticker 暂停、组件卸载）onComplete 永不触发，用户看到的就是
    // 「点了没反应」——2026-09-13 实测报告。动画在这里只是视觉过渡。
    const delay = reduced ? 0 : 240
    window.setTimeout(() => onChoose(appId), delay)
    if (!root || reduced) return
    const target = root.querySelector(`[data-app-card="${appId}"]`)
    const others = root.querySelectorAll(`[data-app-card]:not([data-app-card="${appId}"])`)
    // 大面积卡片只用位移与透明度（memory 22：大表面禁 scale / blur）。
    if (others.length) gsap.to(others, { autoAlpha: 0, y: 10, duration: .2, ease: 'power2.in' })
    if (target) gsap.to(target, { y: -10, duration: .24, ease: 'expo.out' })
  }, [leaving, onChoose])

  const shared = { rootRef, userName, storeName, closeState, flagged, leaving, onChoose: choose }
  return viewport === 'mobile' ? <AppSelectMobile {...shared} /> : <AppSelectDesktop {...shared} />
}
