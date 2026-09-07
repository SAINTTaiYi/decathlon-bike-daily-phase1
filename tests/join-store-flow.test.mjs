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
test('注册完成返回等待态（join / review）时，不进入工作台、不触发 onRegistered', () => {
  assert.match(hookSource, /const \[pendingApproval, setPendingApproval\] = useState\(null\)/u)
  assert.match(hookSource, /if \(result\.data\?\.joinPending\) \{\s*\n\s*setPendingApproval\(\{ kind: 'join',/u)
  assert.match(hookSource, /if \(result\.data\?\.storeReviewPending\) \{\s*\n\s*setPendingApproval\(\{ kind: 'review',/u)
  // 切换模式与返回登录都要清理等待态
  assert.match(hookSource, /const clearPendingApproval = useCallback\(\(\) => setPendingApproval\(null\), \[\]\)/u)
  const switchIdx = hookSource.indexOf('const switchMode = useCallback')
  const modeIdx = hookSource.indexOf('setPendingApproval(null)', switchIdx)
  assert.ok(modeIdx > switchIdx, 'switchMode 必须重置 pendingApproval')
  assert.match(hookSource, /pendingApproval,\s*\n\s*clearPendingApproval,/u)
})

test('注册双路径：默认门店下拉（join），可切换新店注册（create），下拉数据来自公开目录', () => {
  assert.match(hookSource, /const \[registerPath, setRegisterPathState\] = useState\('join'\)/u)
  assert.match(hookSource, /getRegistrationStores\(\)\.then/u)
  // join 提交必须带 intent；create 同理
  assert.match(hookSource, /intent: registerPath/u)
  assert.match(fieldsSource, /const joinMode = registerPath === 'join'/u)
  assert.match(fieldsSource, /<ProjectSelect/u)
  assert.match(fieldsSource, /请选择你的门店/u)
  // 用户定案文案：没有你的门店？点击此处进行门店注册 / 平台管理员审核
  assert.ok(fieldsSource.includes('没有你的门店？'), '必须有「没有你的门店？」提示')
  assert.match(fieldsSource, /点击此处进行门店注册/u)
  assert.match(fieldsSource, /门店注册需要经过平台管理员审核。/u)
  assert.match(fieldsSource, /返回选择门店/u)
})

test('双端注册卡：等待审批态分 kind（join=店长 / review=平台），提供返回登录出口', () => {
  for (const source of [mobileSource, desktopSource]) {
    assert.ok(source.includes('panel.pendingApproval ? ('), '必须有 pendingApproval 分支')
    assert.ok(source.includes("panel.pendingApproval.kind === 'join' ? '等待门店审批' : '等待平台审核'"), '标题必须分 kind')
    assert.ok(source.includes('panel.clearPendingApproval(); panel.backToLogin()'), '必须有返回登录出口')
    assert.ok(source.includes('role="status"'), '等待态必须是状态提示而非错误')
  }
  // CSS 落地：等待态复用的每个类名都必须在对应样式表里有声明（memory 26/27 教训）
  // bootm-item/bootd-item 是仓库既有结构标记类（现有登录卡全体元素都在用，
  // 样式表零声明，作动效/结构钩子），不在此清单内。
  const mobileClasses = ['bootm-panel-head', 'bootm-panel-title', 'bootm-panel-hint', 'bootm-notice', 'bootm-actions', 'bootm-btn-primary']
  const desktopClasses = ['bootd-panel-head', 'bootd-panel-title', 'bootd-panel-hint', 'bootd-notice', 'bootd-actions', 'bootd-btn-primary']
  for (const cls of mobileClasses) assert.ok(mobileStyle.includes('.' + cls), `${cls} 缺少样式`)
  for (const cls of desktopClasses) assert.ok(desktopStyle.includes('.' + cls), `${cls} 缺少样式`)
  // 路径切换与平台审核提示的新样式必须双端落地（memory 23：新元素要有真实样式）
  assert.ok(mobileStyle.includes('.bootm-path-switch') && mobileStyle.includes('.bootm-path-note'), 'bootm-path-* 缺少样式')
  assert.ok(desktopStyle.includes('.bootd-path-switch') && desktopStyle.includes('.bootd-path-note'), 'bootd-path-* 缺少样式')
})

test('注册提示：店长审批与平台审核规则对用户明示', () => {
  assert.match(fieldsSource, /加入申请将由该门店管理员审批，平台管理员兜底。/u)
  assert.match(fieldsSource, /门店编号需为公司内部唯一编号。/u)
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
  assert.match(apiSource, /export const getRegistrationStores = \(signal\) => api\('\/api\/v1\/registration\/stores', \{ signal \}\)/u)
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

// ── 门店下拉穿模修复（2026-09-08 用户报障：选择框透明、选项穿模）──
test('注册门店下拉：boot 语境 trigger 无边线灰底融合 + 菜单绝对定位限高实底', async () => {
  const fields = await read('components/boot/BootAuthStepFields.jsx')
  assert.match(fields, /<ProjectSelect/u, '注册 join 路径必须使用 ProjectSelect')
  const need = (css, frag, label) => assert.ok(css.includes(frag), `${label} 缺少：${frag}`)
  for (const [cssFile, box] of [
    ['styles/boot-mobile.css', 'bootm'],
    ['styles/boot-desktop.css', 'bootd']
  ]) {
    const css = await read(cssFile)
    const menuIdx = css.indexOf(`.${box}-input-box .project-select-menu {`)
    assert.ok(menuIdx > 0, `${cssFile} 必须有 ${box} 下拉菜单适配块`)
    const menuBlock = css.slice(menuIdx, css.indexOf('}', css.indexOf('overscroll-behavior', menuIdx)) + 1)
    const trigIdx = css.indexOf(`.${box}-input-box .project-select-trigger {`)
    assert.ok(trigIdx > 0, `${cssFile} 必须有 ${box} trigger 适配块`)
    const trigBlock = css.slice(trigIdx, css.indexOf('}', trigIdx) + 1)
    // trigger：清除通用样式的深色下划线（灰底输入盒里读作透明异样框）
    need(trigBlock, 'border-bottom: 0', `${cssFile} trigger`)
    // 菜单：绝对定位（不在文档流内被卡片 overflow:hidden 裁剪穿模）
    need(menuBlock, 'position: absolute', `${cssFile} 菜单`)
    need(menuBlock, 'max-height:', `${cssFile} 菜单限高`)
    need(menuBlock, 'overflow-y: auto', `${cssFile} 菜单滚动`)
    need(menuBlock, 'background: #fff', `${cssFile} 菜单实底`)
    assert.ok(!menuBlock.includes('var(--surface-raised)'), `${cssFile} 菜单不得依赖 boot 语境缺失的 token`)
  }
})

