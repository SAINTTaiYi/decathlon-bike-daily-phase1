import { useCallback, useEffect, useRef } from 'react'
import { gsap } from 'gsap'

/* 分段切换的滑动指示块（sliding pill）。
 *
 * 起因（2026-08-29 用户反馈「切换想要丝滑动效」）：原实现靠
 * `transition: background-color` 把选中段的底色直接换掉，黄块是原地闪现，
 * 段与段之间没有位移连续性，观感是「跳」。同时那版还给选中段加了 scale pop，
 * 违反 memory 22「大面积表面禁 scale」——文字会跟着糊一下。
 *
 * 做法：黄块从「段的背景」抽出来，变成轨道里一个独立的绝对定位元素，
 * 每次选中变化时量测目标段的位置与宽度，GSAP tween x / width。
 * 位移用 transform（合成层，不触发 layout），宽度变化范围小可以接受。
 *
 * 三个细节：
 * ① 首次挂载与视口变化只 set 不 tween，避免黄块从左上角飞进来；
 * ② 每次 tween 前 kill 上一条，快速连点不会叠加抖动；
 * ③ reduced-motion 与轨道未布局（宽度 0，例如模块尚未展开）时只做 set。
 */
const reduced = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches || false

export default function useSegmentedPill(activeKey) {
  const trackRef = useRef(null)
  const pillRef = useRef(null)
  const tweenRef = useRef(null)
  const placedRef = useRef(false)

  const place = useCallback((animate) => {
    const track = trackRef.current
    const pill = pillRef.current
    if (!track || !pill) return
    const active = track.querySelector('[data-active="true"]')
    if (!active) { gsap.set(pill, { autoAlpha: 0 }); return }

    const trackBox = track.getBoundingClientRect()
    const box = active.getBoundingClientRect()
    if (!trackBox.width || !box.width) return  // 未布局，等下一次

    // 轨道有 padding，x 以轨道内容盒左边为基准
    const style = getComputedStyle(track)
    const padLeft = parseFloat(style.paddingLeft) || 0
    const x = box.left - trackBox.left - padLeft
    const width = box.width

    tweenRef.current?.kill()
    if (animate && !reduced()) {
      tweenRef.current = gsap.to(pill, {
        x, width, autoAlpha: 1,
        duration: .42,
        ease: 'expo.out'
      })
    } else {
      gsap.set(pill, { x, width, autoAlpha: 1 })
    }
  }, [])

  useEffect(() => {
    place(placedRef.current)
    placedRef.current = true
  }, [activeKey, place])

  useEffect(() => {
    const track = trackRef.current
    if (!track || typeof ResizeObserver === 'undefined') return undefined
    // 轨道尺寸变化（旋屏、模块展开、字体加载）重新贴合，不做动画
    const observer = new ResizeObserver(() => place(false))
    observer.observe(track)
    return () => observer.disconnect()
  }, [place])

  useEffect(() => () => { tweenRef.current?.kill(); tweenRef.current = null }, [])

  return { trackRef, pillRef }
}
