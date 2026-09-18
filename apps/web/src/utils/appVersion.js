/*
 * 版本校验共享模块（2026-09-18）。
 *
 * 两个消费者：
 * 1) UpdateRefreshDialog —— 被动公告：轮询到服务端发布新版本时提示刷新；
 * 2) useVersionGate —— 主动闸门：闭店 / 导出日报图这类「产出物会落进门店记录」
 *    的动作之前，先确认页面不是旧缓存。
 *
 * 为什么要闸门：日报图是**客户端本地代码**画的（canvas）。设备长期挂着页面时
 * 服务端已发新版、本地仍是旧 bundle，于是 V6.8.3 的页面在 V6.8.6 上线后仍导出
 * 黑色主题的日报图（2026-09-18 门店实测）。
 *
 * 版本判定只有一条规则：三段式公开版本做数字比较，远端更大才算「页面落后」。
 * 后端构建版本带后缀（6.8.6-1）不是三段式 → 一律视为「无需处理」，与前端刷新
 * 提示的既有约定一致（见 tests/backend-version-suffix.test.mjs）。
 * 判定端一律 fail-open：取不到、解析不了、不确定，都不拦。
 */

export const VERSION_STORAGE_KEY = 'workshop.ledger.seen-app-version'
export const DISMISSED_REMOTE_KEY = 'workshop.ledger.dismissed-remote-version'
export const VERSION_ENDPOINT = '/api/v1/meta/version'

export function readStorage(key) {
  try {
    return window.localStorage.getItem(key) || ''
  } catch {
    return ''
  }
}

export function writeStorage(key, value) {
  try {
    window.localStorage.setItem(key, value)
  } catch {
    // Ignore private-mode / storage failures; the prompt may reappear.
  }
}

export function readSeenVersion() {
  return readStorage(VERSION_STORAGE_KEY)
}

export function writeSeenVersion(version) {
  writeStorage(VERSION_STORAGE_KEY, version)
}

/** 只认三段式公开版本；后端后缀（6.8.6-1）在这里即被排除。 */
export function isValidVersion(value) {
  return typeof value === 'string' && /^\d+\.\d+\.\d+$/u.test(value)
}

/** 解析三段式版本为数字数组；非法返回 null。 */
export function parseVersion(value) {
  if (!isValidVersion(value)) return null
  return value.split('.').map((part) => Number.parseInt(part, 10))
}

/**
 * 远端是否比本地新。只有「明确判定为更新」才返回 true：
 * 任一侧版本号非法（含后端后缀构建版本）→ false，交由调用方放行。
 * 数字逐段比较，避免字符串比较把 6.8.10 判成小于 6.8.9。
 */
export function isRemoteNewer(remote, local) {
  const next = parseVersion(remote)
  const current = parseVersion(local)
  if (!next || !current) return false
  for (let index = 0; index < 3; index += 1) {
    if (next[index] !== current[index]) return next[index] > current[index]
  }
  return false
}

export async function fetchRemoteAppVersion(signal) {
  const response = await fetch(`${VERSION_ENDPOINT}?_=${Date.now()}`, {
    method: 'GET',
    credentials: 'same-origin',
    cache: 'no-store',
    headers: { accept: 'application/json' },
    signal
  })
  if (!response.ok) return ''
  const payload = await response.json().catch(() => null)
  const version = payload?.appVersion || payload?.version || ''
  return isValidVersion(version) ? version : ''
}
