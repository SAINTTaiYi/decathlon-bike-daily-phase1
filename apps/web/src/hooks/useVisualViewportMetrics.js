import { useEffect } from 'react'

// 视觉视口度量（2026-09-18 重做）。
//
//   --visual-viewport-height / --visual-viewport-top
//     模态对话框的可用高度与顶部内缩。锁定滚动（body.dialog-open）期间页面不会滚动，
//     不存在地址栏动画，取视觉视口的实时值是对的。
//
//   --keyboard-inset-bottom（本轮由 --visual-viewport-bottom 改名而来）
//     软键盘占用的高度，用于把底栏 / 状态条 / 对话框抬到键盘之上。
//
// 为什么必须与「地址栏动画」区分开（用户 2026-09-18 报障，安卓 Edge 必现）：
// 地址栏（Edge 是底部工具栏）的显示与隐藏会同时改变布局视口（window.innerHeight）与
// 视觉视口（visualViewport.height），但两者的动画时序**不同步**——滚动过程中
// `innerHeight - visualViewport.height` 会瞬间等于一条工具栏的高度（约 50–80px）。
// 旧实现直接把这个差值当成底部内缩，于是滚动时底栏被顶到半空、内容 padding 同步变大
// （松手后动画结束、差值归零，才「吸附」回底部）。
//
// 区分依据：软键盘只在**有可编辑元素聚焦**时出现。没有输入焦点时该内缩恒为 0，
// 底栏贴底完全交给浏览器原生处理，天然跟得上地址栏动画。
function hasEditableFocus() {
  const active = typeof document === 'undefined' ? null : document.activeElement
  if (!active || active === document.body || active === document.documentElement) return false
  const tag = String(active.tagName || '').toLowerCase()
  if (tag === 'textarea' || tag === 'select') return true
  if (tag === 'input') {
    const type = String(active.getAttribute('type') || 'text').toLowerCase()
    // 这些 input 类型不唤起软键盘，聚焦不构成键盘内缩。
    return !['button', 'submit', 'reset', 'checkbox', 'radio', 'file', 'range', 'color', 'hidden', 'image'].includes(type)
  }
  return Boolean(active.isContentEditable)
}

export default function useVisualViewportMetrics() {
  useEffect(() => {
    const root = document.documentElement
    const viewport = window.visualViewport
    let frame = 0

    const apply = () => {
      frame = 0
      const height = Math.max(1, Math.round(viewport?.height || window.innerHeight || root.clientHeight || 1))
      const offsetTop = Math.max(0, Math.round(viewport?.offsetTop || 0))
      root.style.setProperty('--visual-viewport-height', `${height}px`)
      root.style.setProperty('--visual-viewport-top', `${offsetTop}px`)
      // 键盘内缩：只有可编辑元素持有焦点时才可能非零（见文件头注释）。
      const keyboardInset = hasEditableFocus()
        ? Math.max(0, Math.round((window.innerHeight || height) - height - offsetTop))
        : 0
      root.style.setProperty('--keyboard-inset-bottom', `${keyboardInset}px`)
    }
    const schedule = () => {
      if (!frame) frame = window.requestAnimationFrame(apply)
    }

    apply()
    window.addEventListener('resize', schedule, { passive: true })
    viewport?.addEventListener('resize', schedule, { passive: true })
    viewport?.addEventListener('scroll', schedule, { passive: true })
    // 焦点变化立即重算：键盘开合不一定伴随 resize（例如在已缩小的视口内切换输入框）。
    document.addEventListener('focusin', schedule)
    document.addEventListener('focusout', schedule)
    return () => {
      window.removeEventListener('resize', schedule)
      viewport?.removeEventListener('resize', schedule)
      viewport?.removeEventListener('scroll', schedule)
      document.removeEventListener('focusin', schedule)
      document.removeEventListener('focusout', schedule)
      if (frame) window.cancelAnimationFrame(frame)
      root.style.removeProperty('--visual-viewport-height')
      root.style.removeProperty('--visual-viewport-top')
      root.style.removeProperty('--keyboard-inset-bottom')
    }
  }, [])
}
