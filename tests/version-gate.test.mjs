import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { APP_VERSION } from '../apps/web/src/data/releaseNotes.js'
import { isRemoteNewer, isValidVersion, parseVersion } from '../apps/web/src/utils/appVersion.js'

/**
 * 版本闸门（2026-09-18 用户定案 B）回归防线。
 *
 * 背景：日报图由本地代码绘制，门店设备长期挂着页面不重载，V6.8.3 的页面在
 * V6.8.6 上线后仍导出黑色主题日报图。闸门在闭店与导出日报图前校验页面版本。
 */
const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')
const hookSource = read('apps/web/src/hooks/useVersionGate.js')
const dialogSource = read('apps/web/src/components/dialogs/VersionGateDialog.jsx')
const appSource = read('apps/web/src/App.jsx')
const css = read('apps/web/src/styles/version-gate.css')
const indexCss = read('apps/web/src/styles/index.css')

test('版本比较：只有远端三段式版本严格更大才算「页面落后」', () => {
  assert.equal(isRemoteNewer('6.8.6', '6.8.3'), true)
  assert.equal(isRemoteNewer('7.0.0', '6.9.9'), true)
  // 数字逐段比较：字符串比较会把 6.8.10 判成小于 6.8.9。
  assert.equal(isRemoteNewer('6.8.10', '6.8.9'), true)
  assert.equal(isRemoteNewer('6.8.6', '6.8.6'), false)
  // 本地比远端新（回滚场景）不拦。
  assert.equal(isRemoteNewer('6.8.3', '6.8.6'), false)
})

test('版本闸门 fail-open：取不到 / 非法 / 后端后缀版本一律不拦', () => {
  assert.equal(isRemoteNewer('', '6.8.6'), false)
  assert.equal(isRemoteNewer('unknown', '6.8.6'), false)
  // 后端构建版本带后缀（6.8.6-1）不是三段式 → 视为无需处理，见 backend-version-suffix 约定。
  assert.equal(isRemoteNewer(`${APP_VERSION}-1`, APP_VERSION), false)
  assert.equal(isValidVersion('6.8.6'), true)
  assert.equal(isValidVersion('6.8.6-1'), false)
  assert.deepEqual(parseVersion('6.8.6'), [6, 8, 6])

  // 结构护栏：hook 里只有「明确判定落后」才挂起动作，其余路径直接执行 run()。
  assert.match(hookSource, /if \(!remoteVersion \|\| !isRemoteNewer\(remoteVersion, APP_VERSION\)\) \{/u)
  // 取版本失败（离线/超时）必须降级为空串而不是抛出。
  assert.match(hookSource, /catch \{\s*\n\s*return ''/u)
  assert.match(hookSource, /CHECK_TIMEOUT_MS/u)
})

test('闸门在闭店入口、闭店确认与导出日报图三处生效', () => {
  assert.match(appSource, /const versionGate = useVersionGate\(\)/u)
  // 闭店入口（点「闭店」→ 最终确认页）
  assert.match(appSource, /versionGate\.guard\(\(\) => setConfirmOpen\(true\), \{ label: '闭店' \}\)/u)
  // 闭店确认（真正写入 + 自动生成日报图的那一步）
  assert.match(appSource, /const performClose = async \(\) => \{/u)
  assert.match(appSource, /await workflow\.completeClosing\(\)/u)
  assert.match(appSource, /const confirmClose = \(\) => versionGate\.guard\(performClose, \{ label: '闭店' \}\)/u)
  // 导出日报图
  assert.match(appSource, /const exportClosingReport = \(\) => versionGate\.guard\(\(\) => generateClosingReport\(\), \{ label: '导出日报图' \}\)/u)
  // 闸门对话框全 App 只有一个挂载点，且用 dialogProps 驱动。
  const mounts = appSource.match(/<VersionGateDialog\b/gu) || []
  assert.equal(mounts.length, 1, `App 只允许一处挂载版本闸门，实际 ${mounts.length} 处`)
  assert.match(appSource, /<VersionGateDialog \{\.\.\.versionGate\.dialogProps\} \/>/u)
})

test('同一轮操作 5 分钟内不重复拦截，取消不写记忆', () => {
  assert.match(hookSource, /const MEMO_MS = 5 \* 60 \* 1000/u)
  assert.match(hookSource, /if \(Date\.now\(\) - settledAtRef\.current < MEMO_MS\) return Promise\.resolve\(\)\.then\(run\)/u)
  // 逃生门（继续）要写记忆，避免「入口 → 确认」被连环拦两次。
  const continueBlock = hookSource.slice(hookSource.indexOf('const continueGate'), hookSource.indexOf('const cancelGate'))
  assert.match(continueBlock, /settledAtRef\.current = Date\.now\(\)/u)
  // 取消（背景 / Esc / 关闭按钮）不写记忆：下次动作仍要校验。
  const cancelBlock = hookSource.slice(hookSource.indexOf('const cancelGate'))
  assert.doesNotMatch(cancelBlock, /settledAtRef\.current = Date\.now\(\)/u)
  assert.match(cancelBlock, /pending\?\.resolve\(undefined\)/u)
})

test('闸门对话框：立即刷新（记 seen 防连弹）+ 逃生门按钮，且不写静默 key', () => {
  assert.match(dialogSource, /import AppDialog from '\.\/AppDialog\.jsx'/u)
  assert.match(dialogSource, /立即刷新/u)
  assert.match(dialogSource, /writeSeenVersion\(remoteVersion\)/u)
  assert.match(dialogSource, /window\.location\.reload\(\)/u)
  // 逃生门按钮文案带动作标签（仍要闭店 / 仍要导出日报图）——必须落在按钮上，
  // 只写在说明文字里等于没有逃生门。
  assert.match(dialogSource, /onClick=\{onContinue\}>\{`仍要\$\{label\}`\}<\/button>/u)
  assert.match(dialogSource, /label = '继续'/u)
  // 说明必须点出「日报图」这一真实原因。
  assert.match(dialogSource, /日报图/u)
  // 闸门不消费 dismissed-remote-version：公告的「稍后」不得静默掉闸门的拦截。
  assert.doesNotMatch(dialogSource, /dismissed-remote-version/u)
})

test('闸门样式：类名全部落地、无孤儿规则，且样式表被引入', () => {
  assert.match(indexCss, /@import '\.\/version-gate\.css';/u)

  const used = new Set()
  for (const match of dialogSource.matchAll(/className="([^"]+)"/gu)) {
    for (const token of match[1].split(/\s+/u)) {
      if (token.startsWith('version-gate')) used.add(token)
    }
  }
  assert.deepEqual([...used].sort(), ['version-gate-actions', 'version-gate-card', 'version-gate-copy', 'version-gate-dialog'])

  const styled = new Set([...css.matchAll(/\.(version-gate-[a-z-]+)/gu)].map((m) => m[1]))
  for (const token of used) {
    assert.ok(styled.has(token), `类名 ${token} 在 version-gate.css 里没有规则（测试全绿但界面是裸的）`)
  }
  const orphans = [...styled].filter((token) => !used.has(token))
  assert.deepEqual(orphans, [], `version-gate.css 存在没有 JSX 消费者的孤儿规则：${orphans.join(', ')}`)

  // 单一定义点：其余样式表不得再声明同名类（历史教训：两处定义互相覆盖）。
  const stylesDir = new URL('../apps/web/src/styles/', import.meta.url)
  for (const file of readdirSync(stylesDir)) {
    if (!file.endsWith('.css') || file === 'version-gate.css') continue
    const other = readFileSync(new URL(file, stylesDir), 'utf8')
    assert.doesNotMatch(other, /\.version-gate-[a-z-]+/u, `${file} 里出现了 version-gate 规则，定义必须唯一`)
  }
})
