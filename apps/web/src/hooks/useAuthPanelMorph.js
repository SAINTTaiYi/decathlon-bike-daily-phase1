import { useEffect, useLayoutEffect, useRef } from 'react'
import { gsap } from 'gsap'

/**
 * 登录卡「就地变形」动效：登录 ⇄ 注册 ⇄ 找回密码 之间不跳页、不闪断。
 *
 * 做法是高度 FLIP：
 *   1. transitionKey 变化前，记录卡片当前高度（First）
 *   2. React 换完内容后，在浏览器绘制前读取新高度（Last）
 *   3. 把高度从旧值补回新值（Invert → Play），同时旧内容淡出、新内容淡入下沉
 *
 * 项目规则：动效统一 GSAP；大面积表面禁用 filter blur 与 scale
 * （重栅格化会让文字"跳回清晰"发生抽搐），所以这里只动 height / y / opacity。
 * prefers-reduced-motion 下直接跳过，只保证结构正确。
 *
 * @param {object} options
 * @param {string} options.transitionKey  模式:步骤 组合键，变化即触发变形
 * @param {import('react').RefObject<HTMLElement>} options.cardRef   卡片容器（量高度的对象）
 * @param {import('react').RefObject<HTMLElement>} options.bodyRef   会被替换的内容容器
 * @param {string} options.itemSelector   进场 stagger 的子项选择器
 */
export function useAuthPanelMorph({ transitionKey, cardRef, bodyRef, itemSelector }) {
  const previousKeyRef = useRef(transitionKey)
  const previousHeightRef = useRef(null)
  const tlRef = useRef(null)
  const reduceMotionRef = useRef(false)

  useEffect(() => {
    if (typeof window === 'undefined') return
    reduceMotionRef.current = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches || false
  }, [])

  // 内容替换前抓一次旧高度。useLayoutEffect 的 cleanup 跑在 DOM 更新前，
  // 正好是 FLIP 的 First 采样点。
  useLayoutEffect(() => {
    const card = cardRef.current
    if (!card) return undefined
    return () => {
      previousHeightRef.current = card.getBoundingClientRect().height
    }
  }, [transitionKey, cardRef])

  useLayoutEffect(() => {
    const card = cardRef.current
    const body = bodyRef.current
    if (!card || !body) return undefined

    // 首次挂载不播变形（登录卡自身的入场动画由两端各自负责）
    if (previousKeyRef.current === transitionKey) return undefined
    previousKeyRef.current = transitionKey

    if (reduceMotionRef.current) return undefined

    const fromHeight = previousHeightRef.current
    const toHeight = card.getBoundingClientRect().height

    tlRef.current?.kill()

    const items = itemSelector ? body.querySelectorAll(itemSelector) : []
    const tl = gsap.timeline({
      defaults: { ease: 'expo.out' },
      onComplete: () => {
        // 清掉内联高度，交还给正常文档流；否则后续内容变化会被锁死
        gsap.set(card, { clearProps: 'height,overflow' })
      }
    })
    tlRef.current = tl

    if (fromHeight != null && Math.abs(toHeight - fromHeight) > 0.5) {
      tl.fromTo(
        card,
        { height: fromHeight, overflow: 'hidden' },
        { height: toHeight, duration: 0.52 },
        0
      )
    }

    tl.fromTo(body, { autoAlpha: 0, y: 14 }, { autoAlpha: 1, y: 0, duration: 0.42 }, 0.04)

    if (items.length) {
      tl.fromTo(
        items,
        { autoAlpha: 0, y: 12 },
        { autoAlpha: 1, y: 0, duration: 0.4, stagger: 0.05 },
        0.12
      )
    }

    return undefined
  }, [transitionKey, cardRef, bodyRef, itemSelector])

  useEffect(() => () => tlRef.current?.kill(), [])
}

export default useAuthPanelMorph
