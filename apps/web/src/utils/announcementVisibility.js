/*
 * 更新公告的占位广播。
 *
 * 为什么需要它：UpdateRefreshDialog 在 App.jsx 有多个渲染点（引导页、会话恢复
 * 页、同步页、工作台），彼此是独立实例，各自持有自己的 open state。用户往往在
 * 登录界面就把公告关掉了，而那个渲染点并不接 onDismissed 回调，所以「公告关闭
 * 事件」不是一个可靠的编排信号。
 *
 * 这里把公告的占位状态提到模块级，分两种登记：
 *
 * - pending（判定中）：实例已挂载但还不知道要不要弹。远端版本检查要等一次
 *   fetch 往返才会把弹窗切到 open，这段空窗里公告尚未显示，如果其他提示此时
 *   把自己弹出来，随后公告会直接覆盖上去（用户实测到的现象）。
 * - visible（正在显示）：公告已经在屏幕上。
 *
 * 其他提示（Shiphub 重连）读的是「公告是否已让开」——两种登记都为零才算让开，
 * 与哪个实例、是否曾经出现过无关。
 *
 * 纯内存，不落 localStorage —— 它描述的是当前这一刻的 UI 状态，刷新即重置。
 */
let visibleCount = 0
let pendingCount = 0
const listeners = new Set()

function emit() {
  const blocking = visibleCount > 0 || pendingCount > 0
  for (const listener of listeners) listener(blocking)
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

/**
 * 登记一个「还在判定要不要弹」的公告实例。返回注销函数。
 * 判定期间同样占位，避免其他提示抢在公告之前弹出后被覆盖。
 */
export function registerPendingAnnouncement() {
  pendingCount += 1
  emit()
  let released = false
  return () => {
    if (released) return
    released = true
    pendingCount = Math.max(0, pendingCount - 1)
    emit()
  }
}

/** 公告是否仍占位（正在显示，或仍在判定要不要弹）。 */
export function isAnnouncementBlocking() {
  return visibleCount > 0 || pendingCount > 0
}

export function subscribeAnnouncementBlocking(listener) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** 仅供测试：重置模块状态。 */
export function resetAnnouncementVisibility() {
  visibleCount = 0
  pendingCount = 0
  listeners.clear()
}
