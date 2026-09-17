import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8')
const [dialog, hook, worker, ledger, orderBoard, pipelineBoard, css, endfieldCss, styleIndex] = await Promise.all([
  read('apps/web/src/components/dialogs/ShipHubSettingsDialog.jsx'),
  read('apps/web/src/hooks/useShipHub.js'),
  read('apps/worker/src/services/shiphub-sync.ts'),
  read('apps/web/src/components/pickup/PickupLedger.jsx'),
  read('apps/web/src/components/shiphub/ShipHubOrderBoard.jsx'),
  read('apps/web/src/components/shiphub/ShipHubPipelineBoard.jsx'),
  read('apps/web/src/styles/pickup-ledger.css'),
  read('apps/web/src/styles/endfield.css'),
  read('apps/web/src/styles/index.css')
])

const stripComments = (source) => source.replace(/\/\*[\s\S]*?\*\//gu, '').replace(/^\s*\/\/.*$/gmu, '')
const MOCK = 'apps/web/src/components/dialogs/ShipHubSettingsDialog.jsx'

// Shiphub 连接对话框的账号表单形态（2026-09-18 用户定案）：
//   已配置本店账号 → 只给一个「更改账号密码」按钮，点开才展开账号表单；
//   未配置        → 表单默认展开（新门店接入的唯一入口，不能折叠）。

test('已配置本店账号时折叠账号表单，改由「更改账号密码」按钮展开', () => {
  const src = stripComments(dialog)

  // 判定来源：服务端 connection.hasPerStoreLogin（经 hook 归一为 storeLoginConfigured）
  assert.match(worker, /hasPerStoreLogin: connection\.hasPerStoreLogin/u, 'summary 必须下发本店账号配置状态')
  assert.match(
    hook,
    /storeLoginConfigured: simulatedStoreLogin\s*\n?\s*\?\s*simulatedStoreLogin === 'configured'\s*\n?\s*:\s*Boolean\(summary\?\.connection\?\.hasPerStoreLogin\)/u,
    'hook 必须把 hasPerStoreLogin 归一为 storeLoginConfigured'
  )
  assert.match(src, /const storeLoginConfigured = Boolean\(shiphub\?\.storeLoginConfigured\)/u)

  // 折叠判据：已配置且未点「更改」→ 不渲染表单；未配置 → 始终渲染表单
  assert.match(
    src,
    /const showLoginForm = canManage && \(!storeLoginConfigured \|\| editingLogin\)/u,
    '表单可见性 = 管理员 && (未配置 || 正在编辑)'
  )
  assert.match(src, /const \[editingLogin, setEditingLogin\] = useState\(false\)/u, '必须有独立的展开态')

  // 紧凑态：说明 + 「更改账号密码」按钮；点按钮进入编辑态并把焦点交给用户名字段
  assert.match(src, /className="shiphub-store-login"/u, '紧凑态必须有独立容器')
  assert.match(src, /<button type="button" className="shiphub-connect-btn shiphub-connect-btn--ghost" onClick=\{openLoginEditor\}/u)
  assert.match(src, /更改账号密码/u)
  assert.match(src, /setEditingLogin\(true\)/u, '点击按钮必须展开表单')
  assert.match(src, /requestAnimationFrame\(\(\) => usernameRef\.current\?\.focus\(\)\)/u, '展开后必须把焦点交给用户名字段')
  assert.match(src, /<input ref=\{usernameRef\}/u, '用户名输入框必须持有 ref')

  // 三个账号字段只存在于表单分支里——折叠态不得残留任何输入框
  const compact = src.slice(src.indexOf('className="shiphub-store-login"'), src.indexOf('{shiphub?.summary?.cubeAuth?.hasCredentials'))
  assert.doesNotMatch(compact, /<input/u, '紧凑态不得包含任何输入框')

  // 旧实现（无条件铺开表单，靠一个从未被使用的 effectiveShowStoreLogin）必须整体消失：
  // 用新规则覆盖旧规则 = 两套判据打架，是本项目反复踩过的坑。
  assert.doesNotMatch(src, /effectiveShowStoreLogin/u, '未使用的旧展开判据必须删除，不得与新判据并存')
  assert.doesNotMatch(src, /showStoreLogin/u, '旧 showStoreLogin 状态必须删除')
})

test('未配置本店账号（新店接入）与操作员各有明确路径', () => {
  const src = stripComments(dialog)
  // 未配置且是管理员 → 表单默认展开（新店管理员找不到入口就会误用共享凭据被互斥拒绝）
  assert.match(src, /showLoginForm \? \(/u, '表单分支必须由 showLoginForm 决定')
  // 操作员：不显示表单，给出说明（维持既有行为）
  assert.match(src, /本店 ShipHub 账号由门店管理员设置；操作员可直接重新连接。/u)
  // 管理员但未配置时不得出现「更改账号密码」按钮（没有可改的东西）
  assert.match(src, /\{storeLoginConfigured \? <button[^>]*onClick=\{\(\) => setEditingLogin\(false\)\}/u, '「取消更改」只在已配置门店出现')
  assert.match(src, /取消更改/u)
})

test('展开态是一次性的：关闭对话框即收起，提交成功后收起并清空明文', () => {
  const src = stripComments(dialog)
  assert.match(src, /if \(!open\) setEditingLogin\(false\)/u, '关闭即收起编辑态')
  assert.match(
    src,
    /setEditingLogin\(false\)\s*\n\s*setStoreLogin\(\{ username: '', password: '', locationNum: '' \}\)/u,
    '连接成功后必须收起表单并清空输入（界面上不留明文）'
  )
})

test('主按钮文案随形态变化：紧凑态是「重新连接」，展开态是「更新账号并重连」', () => {
  const src = stripComments(dialog)
  assert.match(src, /const primaryLabel = fixture/u)
  assert.match(src, /showLoginForm \? '更新账号并重连' : '重新连接'/u)
  assert.match(src, /: '连接 Shiphub'/u)
  assert.match(src, /\{primaryLabel\}/u, '按钮必须渲染计算出的文案')
})

test('连接按钮样式住在被加载的样式表里（不得再依赖未引入的 endfield.css）', () => {
  // 事故（2026-09-18）：.shiphub-connect-btn 的规则一直住在 endfield.css ——
  // 一个没有被 index.css 引入的独立主题文件，于是生产里按钮零样式，
  // 渲染成一行裸文字（用户截图里的「Preview 下不可用」）。
  // 断言要落在「真的是一条声明块」上：`.shiphub-connect-btn + .shiphub-connect-btn`
  // 这种相邻兄弟选择器也会让 `\.shiphub-connect-btn {` 命中（类名之后还有第二个类名
  // 加空格加花括号），据此判绿会漏掉主规则被删的情况——注入实验实测过一次假绿。
  assert.match(
    css,
    /\.shiphub-connect-btn \{[^}]*border-radius: 999px[^}]*background: var\(--ink\)/u,
    '主按钮规则必须住在 pickup-ledger.css（被 index.css 引入）且是完整的胶囊声明块'
  )
  assert.match(css, /\.shiphub-connect-btn--ghost \{[^}]*background: var\(--surface\)/u, 'ghost 变体同样要搬过来')
  assert.match(css, /\.shiphub-store-login \{/u, '紧凑态容器必须有样式落地')
  assert.doesNotMatch(endfieldCss, /\.shiphub-connect-btn/u, '旧位置不得保留第二份声明')
  assert.doesNotMatch(styleIndex, /endfield\.css/u, 'endfield.css 依然不得被引入（独立主题，非本仓库当前主题）')
})

test('preview 可切换「本店账号」模拟维度（真实状态不受影响）', () => {
  const hookSrc = stripComments(hook)
  // 第二个模拟维度与状态模拟同一纪律：只在 preview 主机、只写 localStorage、白名单校验
  assert.match(hook, /export const SIMULATED_STORE_LOGIN = \['configured', 'none'\]/u)
  assert.match(hook, /export function readSimulatedStoreLogin\(\) \{\s*if \(!isPreviewHost\(\)\) return ''/u)
  assert.match(hook, /export function writeSimulatedStoreLogin\(value\) \{\s*if \(!isPreviewHost\(\)\) return ''/u)
  assert.match(hook, /SIMULATED_STORE_LOGIN\.includes\(raw\) \? raw : ''/u)
  assert.match(hook, /SIMULATED_STORE_LOGIN\.includes\(value\) \? value : ''/u)
  assert.match(hookSrc, /simulateStoreLogin: \(value\) => setSimulatedStoreLogin\(writeSimulatedStoreLogin\(value\)\)/u)
  // 提交给服务端的账号密码永远来自表单输入，与模拟值无关：
  // 连接动作只是把调用方给的 login 原样转发，展示值（storeLoginConfigured）
  // 在整个 hook 里只出现在返回值中，不得参与任何动作路径。
  assert.match(
    hookSrc,
    /const connect = useCallback\(\(returnTo = '\/', login = null\) => startShipHubConnection\(returnTo, login\), \[\]\)/u,
    '连接动作只转发调用方给的 login'
  )
  assert.equal(
    (hookSrc.match(/storeLoginConfigured/gu) || []).length,
    1,
    'storeLoginConfigured 只应出现在返回值里（展示层），不得参与动作路径'
  )
  assert.equal(
    (hookSrc.match(/simulatedStoreLogin/gu) || []).length,
    4,
    '模拟值只应有：state / 归一化读取 / 返回值 / 返回的写入口'
  )
  // 透传到看板
  assert.match(ledger, /simulatedStoreLogin=\{shiphub\?\.simulatedStoreLogin \|\| ''\}/u)
  assert.match(ledger, /onSimulateStoreLogin=\{shiphub\?\.simulateStoreLogin\}/u)
  for (const board of [orderBoard, pipelineBoard]) {
    assert.match(board, /simulatedStoreLogin = ''/u)
    assert.match(board, /activeLogin=\{simulatedStoreLogin\} onSimulateLogin=\{onSimulateStoreLogin\}/u)
  }
})

test('断言对象仍是真实文件（防止测试对着空气断言）', () => {
  assert.ok(dialog.includes('ShipHubSettingsDialog'))
  assert.ok(MOCK.endsWith('ShipHubSettingsDialog.jsx'))
})
