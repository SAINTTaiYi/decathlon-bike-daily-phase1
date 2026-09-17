// 更新公告弹窗稳定性冒烟（2026-09-18「弹窗抽搐」修复）。
//
// 覆盖：真实浏览器冷启动 → 版本公告自动弹出 → 入场动画只播一次、DOM 节点不被重建。
//
// 为什么必须用真实浏览器：抽搐的根因是 React 的**协调行为**——App 有多个早期 return
// 分支，每个分支各自挂一份 <UpdateRefreshDialog>，分支切换时组件被卸载重建，
// 内部 useState(open) 与 GSAP 入场时间线一并重来。静态断言只能证明「源码里只有一处
// 挂载」；真正的判据是运行时的：同一个 <dialog> 节点 + 入场补间只播一次。
//
// 回归信号（修复前实测，1425×900 与 390×844 均复现）：
//   entrance ramps = 2（面板淡出 18px 后又淡回）、dialog 节点 = 2 个、body.dialog-open
//   在启动过程中 true→false→true 闪一次。
//
// 依赖：puppeteer-core（与 browser-smoke 共用 /tmp/ws-smoke 安装目录）。
import { createRequire } from 'node:module'

// 依赖目录与浏览器可执行文件都可覆盖：
//   CI（部署 workflow）用 /tmp/ws-smoke + runner 预装 Chrome；
//   本地回归用 SMOKE_REQUIRE_BASE / PUPPETEER_EXECUTABLE_PATH 指向本机安装。
const requireWs = createRequire(process.env.SMOKE_REQUIRE_BASE || '/tmp/ws-smoke/')
const puppeteer = requireWs('puppeteer-core')

const base = (process.env.SMOKE_BASE_URL || '').replace(/\/$/u, '')
const username = process.env.SMOKE_USERNAME || ''
const password = process.env.SMOKE_PASSWORD || ''
const failures = []

function log(...args) { console.log('[announcement-smoke]', ...args) }
function pass(message) { log('ok ·', message) }
function fail(message) { failures.push(message); log('FAIL ·', message) }

// 采样器：从文档第一帧起记录公告弹窗的节点身份与面板透明度。
// 节点身份用 WeakMap 编号——同一个 DOM 节点永远同一个编号，重建则换号。
const sampler = `
(() => {
  // 直接进 Ops 工作台（默认会停在应用选择屏），并确保公告未被标记为已读 ——
  // 这样每次冒烟测量的都是完整链路：验证会话 → 引导页 → 读取台账 → 工作台。
  try { sessionStorage.setItem('bike-ops-active-app', 'ops') } catch (error) {}
  try { localStorage.removeItem('workshop.ledger.seen-app-version') } catch (error) {}
  const state = { frames: [], seq: 0 }
  window.__announcementProbe = state
  const ids = new WeakMap()
  const idOf = (node) => {
    let value = ids.get(node)
    if (!value) { value = 'N' + (++state.seq); ids.set(node, value) }
    return value
  }
  const sample = () => {
    const dialog = document.querySelector('dialog.update-refresh-dialog')
    const panel = dialog ? dialog.querySelector('[data-dialog-panel]') : null
    state.frames.push({
      t: Math.round(performance.now()),
      node: dialog ? idOf(dialog) : null,
      open: dialog ? Boolean(dialog.open) : null,
      op: panel ? Number(getComputedStyle(panel).opacity) : null,
      dim: document.body.classList.contains('dialog-open')
    })
    if (state.frames.length < 1200) requestAnimationFrame(sample)
  }
  requestAnimationFrame(sample)
})()
`

async function main() {
  if (!base || !username || !password) {
    fail('缺少 SMOKE_BASE_URL / SMOKE_USERNAME / SMOKE_PASSWORD 环境变量')
    return
  }
  const browser = await puppeteer.launch({
    channel: process.env.PUPPETEER_EXECUTABLE_PATH ? undefined : 'chrome',
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
    headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage']
  })
  const pageErrors = []
  try {
    const page = await browser.newPage()
    await page.setViewport({ width: 1425, height: 900 })
    page.on('pageerror', (error) => pageErrors.push(String(error && error.message ? error.message : error)))
    await page.evaluateOnNewDocument(sampler)

    // 冷启动（全新 profile，localStorage 为空 → 公告必然自动弹出）。
    await page.goto(base + '/', { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => {})
    const loginStatus = await page.evaluate(async (b, u, p) => {
      const response = await fetch(b + '/api/v1/auth/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ username: u, password: p }),
        credentials: 'same-origin'
      })
      return response.status
    }, base, username, password).catch(() => 0)
    if (loginStatus !== 200) { fail('页面内登录失败：HTTP ' + loginStatus); return }
    pass('页面内登录成功（浏览器会话就绪）')

    // 带会话重新加载：这里测量的是登录后的启动链路（验证会话 → 读取台账 → 工作台）。
    // 每次导航都会重新注入采样器，计数器从零开始。
    await page.goto(base + '/', { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => {})
    // 等真正进入工作台：抽搐发生在「验证会话 → 引导页 → 工作台」这些界面切换上，
    // 停在中间态测不到完整链路。
    await page.waitForFunction(
      () => Boolean(document.querySelector('.ops-index')),
      { timeout: 40000, polling: 250 }
    ).catch(() => {})
    await new Promise((resolve) => setTimeout(resolve, 4000))

    const result = await page.evaluate(() => {
      const state = window.__announcementProbe
      if (!state) return null
      const ramps = []
      const nodes = []
      const dimTimeline = []
      let prevOpacity = null
      for (const frame of state.frames) {
        if (frame.node && (nodes.length === 0 || nodes[nodes.length - 1] !== frame.node)) nodes.push(frame.node)
        if (frame.op === null) { prevOpacity = null } else {
          if (prevOpacity !== null && prevOpacity <= 0.05 && frame.op >= 0.5) ramps.push(frame.t)
          prevOpacity = frame.op
        }
        if (dimTimeline.length === 0 || dimTimeline[dimTimeline.length - 1].dim !== frame.dim) {
          dimTimeline.push({ t: frame.t, dim: frame.dim })
        }
      }
      const screen = (() => {
        if (document.querySelector('.ops-index')) return 'WORKSPACE'
        const hydration = document.querySelector('.hydration-state strong')
        if (hydration) return hydration.textContent
        if (document.querySelector('.appselect, [data-app-card]')) return 'APPSELECT'
        return 'UNKNOWN'
      })()
      return { ramps, nodes, dimTimeline, frames: state.frames.length, screen }
    })

    if (!result || result.frames < 30) {
      fail('采样数据不足（frames=' + (result ? result.frames : 'null') + '），无法判定')
      return
    }
    log('采样帧数=' + result.frames + ' · 到达界面=' + result.screen)
    log('入场时刻(ms)=' + JSON.stringify(result.ramps) + ' · 弹窗节点=' + JSON.stringify(result.nodes))
    log('dialog-open 时间线=' + JSON.stringify(result.dimTimeline.slice(0, 6)))

    if (result.ramps.length === 0) {
      fail('启动过程中公告没有弹出：无法验证（检查 APP_VERSION 与 localStorage 初始化）')
    } else if (result.ramps.length === 1) {
      pass('公告入场动画只播一次（无重建重播）')
    } else {
      fail('公告入场动画播了 ' + result.ramps.length + ' 次：组件在启动过程中被重建（抽搐回归）')
    }

    if (result.nodes.length <= 1) {
      pass('公告弹窗全程为同一个 DOM 节点（挂载点稳定）')
    } else {
      fail('公告弹窗节点被替换 ' + result.nodes.length + ' 次（' + JSON.stringify(result.nodes) + '）：App 分支各挂一份的回归')
    }

    if (pageErrors.length) fail('页面 JS 异常：' + pageErrors.slice(0, 3).join(' | '))
    else pass('无页面级 JS 异常')
  } finally {
    await browser.close().catch(() => {})
  }
}

const guard = setTimeout(() => {
  fail('整体超时（120s）')
  finish()
}, 120000)

function finish() {
  clearTimeout(guard)
  const ok = failures.length === 0
  console.log(JSON.stringify({ ok, failures }))
  process.exit(ok ? 0 : 1)
}

main().then(finish).catch((error) => {
  fail('未捕获异常：' + String(error && error.message ? error.message : error))
  finish()
})
