import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const read = (p) => readFile(new URL(`../apps/web/src/${p}`, import.meta.url), 'utf8')
const readStyle = (p) => readFile(new URL(`../apps/web/src/styles/${p}`, import.meta.url), 'utf8')

const hookSource = await read('hooks/useBootAuthPanel.js')
const mobileSource = await read('components/boot/BootLoaderMobile.jsx')
const desktopSource = await read('components/boot/BootLoaderDesktop.jsx')
const fieldsSource = await read('components/boot/BootAuthStepFields.jsx')
const dialogSource = await read('components/dialogs/GovernanceDialog.jsx')
const appSource = await read('App.jsx')
const apiSource = await read('api/auth.js')
const mobileStyle = await readStyle('boot-mobile.css')
const desktopStyle = await readStyle('boot-desktop.css')

// ── 注册 hook：加入完成态 ──
test('注册完成返回 joinPending 时，不进入工作台、不触发 onRegistered', () => {
  assert.match(hookSource, /const \[joinPending, setJoinPending\] = useState\(null\)/u)
  assert.match(hookSource, /if \(result\.data\?\.joinPending\) \{\s*\n\s*setJoinPending\(\{ storeName: result\.data\.storeName \|\| '', storeCode: result\.data\.storeCode \|\| '', message: result\.data\.message \|\| '' \}\)\s*\n\s*return undefined\s*\n\s*\}\s*\n\s*onRegistered\?\.\(result\.data\)/u)
  // 切换模式与返回登录都要清理等待态
  assert.match(hookSource, /const clearJoinPending = useCallback\(\(\) => setJoinPending\(null\), \[\]\)/u)
  const switchIdx = hookSource.indexOf('const switchMode = useCallback')
  const modeIdx = hookSource.indexOf('setJoinPending(null)', switchIdx)
  assert.ok(modeIdx > switchIdx, 'switchMode 必须重置 joinPending')
  assert.match(hookSource, /joinPending,\s*\n\s*clearJoinPending,/u)
})

test('双端注册卡：等待审批态复用既有样式类，提供返回登录出口', () => {
  for (const source of [mobileSource, desktopSource]) {
    assert.ok(source.includes('panel.joinPending ? ('), '必须有 joinPending 分支')
    assert.ok(source.includes('加入「{panel.joinPending.storeName}」的申请已提交'), '必须有申请门店回显')
    assert.ok(source.includes('panel.clearJoinPending(); panel.backToLogin()'), '必须有返回登录出口')
    assert.ok(source.includes('等待门店审批'), '必须有等待审批标题')
    assert.ok(source.includes('role="status"'), '等待态必须是状态提示而非错误')
  }
  // CSS 落地：等待态复用的每个类名都必须在对应样式表里有声明（memory 26/27 教训）
  // bootm-item/bootd-item 是仓库既有结构标记类（现有登录卡全体元素都在用，
  // 样式表零声明，作动效/结构钩子），不在此清单内。
  const mobileClasses = ['bootm-panel-head', 'bootm-panel-title', 'bootm-panel-hint', 'bootm-notice', 'bootm-actions', 'bootm-btn-primary']
  const desktopClasses = ['bootd-panel-head', 'bootd-panel-title', 'bootd-panel-hint', 'bootd-notice', 'bootd-actions', 'bootd-btn-primary']
  for (const cls of mobileClasses) assert.ok(mobileStyle.includes('.' + cls), `${cls} 缺少样式`)
  for (const cls of desktopClasses) assert.ok(desktopStyle.includes('.' + cls), `${cls} 缺少样式`)
})

test('注册提示：说明已有门店会转为加入申请', () => {
  assert.match(fieldsSource, /填写已有门店编号将转为「申请加入」该门店（等待店长审批）；新编号则注册创建新门店/u)
})

// ── 治理弹窗：审批面 ──
test('治理弹窗：待审批加入区 + 审批动作接线', () => {
  const importBlock = dialogSource.slice(0, dialogSource.indexOf("from '../../api/auth.js'"))
  assert.ok(importBlock.includes('decideJoinRequest,'), '必须导入 decideJoinRequest')
  assert.ok(importBlock.indexOf('decideJoinRequest,') < importBlock.indexOf('decideTransferRequest,'), '导入顺序保持字母序')
  assert.match(dialogSource, /<section className="governance-section"><h3>待审批加入<\/h3>/u)
  assert.match(dialogSource, /decideJoinRequest\(item\.id, \{ \.\.\.emptyDecision, approve, expectedRevision: item\.revision,/u)
  assert.match(dialogSource, /data\.joinRequests\?\.length \? <section className="governance-section">/u)
  // 描述文案同步审批规则
  assert.match(dialogSource, /跨店调动与加入申请由目标门店的有效管理员审批（平台管理员兜底）/u)
})

test('API 客户端与徽章接线', () => {
  assert.match(apiSource, /export const decideJoinRequest = \(id, body\) => api\(`\/api\/v1\/governance\/join-requests\/\$\{id\}\/decision`, \{ method: 'POST', body \}\)/u)
  assert.match(appSource, /setAdminPending\(result\.roleRequests \+ result\.transferRequests \+ result\.storesPending \+ \(result\.joinRequests \?\? 0\)\)/u)
})

// ── 复用类名的治理区样式存在性 ──
test('治理区新标记只复用既有样式类', async () => {
  const styles = ['workshop-system.css', 'endfield.css', 'workshop-runtime.css', 'mobile-overview.css']
  let css = ''
  for (const file of styles) {
    try { css += await readStyle(file) } catch { /* 可选文件 */ }
  }
  for (const cls of ['governance-section', 'governance-request-list', 'governance-decisions', 'primary-action', 'secondary-action']) {
    assert.ok(css.includes('.' + cls), `${cls} 缺少样式`)
  }
})
