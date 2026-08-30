/*
 * 更新公告的可见性广播。
 *
 * 为什么需要它：UpdateRefreshDialog 在 App.jsx 有多个渲染点（引导页、会话恢复
 * 页、同步页、工作台），彼此是独立实例，各自持有自己的 open state。用户往往在
 * 登录界面就把公告关掉了，而那个渲染点并不接 onDismissed 回调，所以「公告关闭
 * 事件」不是一个可靠的编排信号。
 *
 * 这里把公告的显示状态提到模块级：任意实例在显示期间登记一次，其他 hook 读的
 * 是「此刻是否有公告在显示」这个状态，与哪个实例、是否曾经出现过无关。
 *
 * 纯内存，不落 localStorage —— 它描述的是当前这一刻的 UI 状态，刷新即重置。
 */
let visibleCount = 0
const listeners = new Set()

function emit() {
  const visible = visibleCount > 0
  for (const listener of listeners) listener(visible)
}

/**
 * 登记一个正在显示的公告实例。返回注销函数。
 * 组件在 effect 里调用，靠 effect 的清理保证配对，不需要调用方记账。
 */
export function registerVisibleAnnouncement() {
  visibleCount += 1
  emit()
  let released = false
  return () => {
    if (released) return
    released = true
    visibleCount = Math.max(0, visibleCount - 1)
    emit()
  }
}

export function isAnnouncementVisible() {
  return visibleCount > 0
}

export function subscribeAnnouncementVisibility(listener) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** 仅供测试：重置模块状态。 */
export function resetAnnouncementVisibility() {
  visibleCount = 0
  listeners.clear()
}
