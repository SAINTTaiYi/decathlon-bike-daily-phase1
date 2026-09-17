// 门店设计实时协作 · 真实浏览器冒烟（2026-09-17）
//
// 由部署 workflow 在 GitHub runner 上执行（runner 预装 Chrome，网络可直达站点）。
// 覆盖客户端侧链路（服务端协议由 ws-smoke 覆盖）：
//   工具页真实加载 → 会话就绪（页面内登录，浏览器自行落 cookie）→
//   SDCollab 连接到 online → 状态胶囊显示「在线」→ 第二标签页上线后双端名单同步。
//
// 依赖：puppeteer-core（脚本自行从 /tmp/ws-smoke 解析）。
import { createRequire } from 'node:module'

const requireWs = createRequire('/tmp/ws-smoke/')
const puppeteer = requireWs('puppeteer-core')

const base = (process.env.SMOKE_BASE_URL || '').replace(/\/$/u, '')
const username = process.env.SMOKE_USERNAME || ''
const password = process.env.SMOKE_PASSWORD || ''
const failures = []

function log(...args){ console.log('[browser-smoke]', ...args) }
function pass(message){ log('ok ·', message) }
function fail(message){ failures.push(message); log('FAIL ·', message) }

async function main(){
  if (!base || !username || !password){
    fail('缺少 SMOKE_BASE_URL / SMOKE_USERNAME / SMOKE_PASSWORD 环境变量')
    return
  }
  const browser = await puppeteer.launch({
    channel: 'chrome',
    headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage']
  })
  const pageErrors = []
  try {
    const pageA = await browser.newPage()
    pageA.on('pageerror', (error) => pageErrors.push('A: ' + String(error && error.message ? error.message : error)))
    await pageA.goto(base + '/', { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => {})
    const loginStatus = await pageA.evaluate(async (b, u, p) => {
      const response = await fetch(b + '/api/v1/auth/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ username: u, password: p }),
        credentials: 'same-origin'
      })
      return response.status
    }, base, username, password).catch(() => 0)
    if (loginStatus !== 200){ fail('页面内登录失败：HTTP ' + loginStatus); return }
    pass('页面内登录成功（浏览器会话就绪）')

    async function openDesign(page, label){
      await page.goto(base + '/store-design/', { waitUntil: 'domcontentloaded', timeout: 60000 })
      await page.waitForFunction(
        'window.SDCollab && window.SDCollab.state().status === "online"',
        { timeout: 45000 }
      )
      pass(label + ' 工具页加载完成且实时协作已连接（online）')
    }

    await openDesign(pageA, 'A')
    const chipA = await pageA.$eval('.sd-collab-chip', (el) => el.textContent).catch(() => '')
    if (/在线/u.test(chipA)) pass('A 状态胶囊：' + chipA)
    else fail('A 状态胶囊未显示在线：' + JSON.stringify(chipA))

    const pageB = await browser.newPage()
    pageB.on('pageerror', (error) => pageErrors.push('B: ' + String(error && error.message ? error.message : error)))
    await openDesign(pageB, 'B')

    await pageA.waitForFunction(
      'window.SDCollab.state().peers.length >= 2',
      { timeout: 20000 }
    ).catch(() => {})
    const stateA = await pageA.evaluate(() => window.SDCollab.state())
    const stateB = await pageB.evaluate(() => window.SDCollab.state())
    if (stateA.peers.length >= 2 && stateB.peers.length >= 2){
      pass('双端在线名单同步：' + JSON.stringify(stateA.peers))
    } else {
      fail('双端在线名单未同步：A=' + JSON.stringify(stateA.peers) + ' / B=' + JSON.stringify(stateB.peers))
    }
    // 工作室选中 → 属性栏可编辑（2026-09-17 用户报障的回归；只读检查，不改动房间数据）。
    // 用已在线的 B 页做（重新导航后再等连接在 CI 里会超时，2026-09-17 实测）。
    await pageB.evaluate(() => {
      const tab = document.querySelector('button[data-tab="tplan"]')
      if (tab) tab.click()
    })
    await new Promise((resolve) => setTimeout(resolve, 400))
    const clicked = await pageB.evaluate(() => {
      const g = document.querySelector('#tabplan [data-id="st"]')
      if (!g) return false
      const r = g.getBoundingClientRect()
      const o = { bubbles: true, cancelable: true, clientX: r.x + r.width / 2, clientY: r.y + r.height / 2, pointerId: 9, button: 0, isPrimary: true }
      g.dispatchEvent(new PointerEvent('pointerdown', o))
      window.dispatchEvent(new PointerEvent('pointerup', o))
      return true
    })
    if (!clicked){
      fail('平面视图里缺少工作室元素（data-id=st）')
    } else {
      await new Promise((resolve) => setTimeout(resolve, 500))
      const probe = await pageB.evaluate(() => ({
        field: !!document.querySelector('input[data-path="studio.w"]'),
        sel: (window.SDCollab && window.SDCollab.state) ? window.SDCollab.state().status : 'n/a'
      }))
      if (probe.field) pass('选中工作室后属性栏可编辑（studio.w 字段在位）')
      else fail('选中工作室后属性栏没有尺寸字段（平面 / 大纲 id 匹配回归？status=' + probe.sel + '）')
    }
    /* 跨端实时内容（2026-09-17 数据丢失事故的回归）：A 在房间里新增一个组件，
       B 必须看到；新设备连上后房间内容也不得被「云端首载」竞态清掉。
       用一次性组件验证并在最后还原，保证共享房间不留痕。 */
    const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
    const countItems = (page) => page.evaluate(() => document.querySelectorAll('#tabplan [data-id^="si:"]').length)
    async function selectStudio(page){
      await page.evaluate(() => {
        const tab = document.querySelector('button[data-tab="tplan"]')
        if (tab) tab.click()
      })
      await sleep(300)
      const hit = await page.evaluate(() => {
        const g = document.querySelector('#tabplan [data-id="st"]')
        if (!g) return false
        const r = g.getBoundingClientRect()
        const o = { bubbles: true, cancelable: true, clientX: r.x + r.width / 2, clientY: r.y + r.height / 2, pointerId: 9, button: 0, isPrimary: true }
        g.dispatchEvent(new PointerEvent('pointerdown', o))
        window.dispatchEvent(new PointerEvent('pointerup', o))
        return true
      })
      await sleep(300)
      return hit
    }
    if (await selectStudio(pageA)){
      const before = await countItems(pageA)
      const idsBefore = await pageA.evaluate(() =>
        Array.prototype.slice.call(document.querySelectorAll('[data-act="delStudioItem"]')).map((b) => b.getAttribute('data-id'))
      )
      const added = await pageA.evaluate(() => {
        const button = document.querySelector('[data-act="addStudioItem"][data-id="stuBench"]')
        if (!button) return false
        button.click()
        return true
      })
      if (!added){
        fail('属性栏缺少「＋工作台」入口（工作室内组件编辑回归？）')
      } else {
        await pageB.waitForFunction(
          (target) => document.querySelectorAll('#tabplan [data-id^="si:"]').length >= target,
          { timeout: 8000 },
          before + 1
        ).catch(() => {})
        const seen = await countItems(pageB)
        if (seen >= before + 1) pass('跨端内容：A 新增组件，B 实时看到（' + before + ' → ' + seen + '）')
        else fail('跨端内容未同步：A=' + before + ' / B=' + seen)
        /* 还原：删掉刚加的组件（避免污染共享房间的后续验证）。
           按「新增前不存在的 data-id」定位，避免误删别人的组件。 */
        const removed = await pageA.evaluate((known) => {
          const buttons = Array.prototype.slice.call(document.querySelectorAll('[data-act="delStudioItem"]'))
          const fresh = buttons.filter((b) => known.indexOf(b.getAttribute('data-id')) < 0)
          if (!fresh.length) return false
          fresh[0].click()
          return true
        }, idsBefore)
        await sleep(600)
        if (removed) pass('房间已还原（临时组件已删除）')
      }
    } else {
      fail('A 页无法选中工作室，跨端内容验证未执行')
    }

    if (pageErrors.length){
      fail('页面 JS 异常：' + pageErrors.slice(0, 3).join(' | '))
    } else {
      pass('无页面级 JS 异常')
    }
  } finally {
    await browser.close().catch(() => {})
  }
}

const guard = setTimeout(() => {
  fail('整体超时（120s）')
  finish()
}, 120000)

function finish(){
  clearTimeout(guard)
  const ok = failures.length === 0
  console.log(JSON.stringify({ ok, failures }))
  process.exit(ok ? 0 : 1)
}

main().then(finish).catch((error) => {
  fail('未捕获异常：' + String(error && error.message ? error.message : error))
  finish()
})
