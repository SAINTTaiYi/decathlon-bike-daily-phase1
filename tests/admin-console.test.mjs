import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { appendUniqueById, requestGate, selectedBatchTargets } from '../apps/web/src/components/admin/admin-state.js'
const read = (path) => readFile(new URL(path, import.meta.url), 'utf8')
const [consoleSource, approvalsSource, directorySource, usersSource, auditSource, apiSource, dialogSource, cssSource] = await Promise.all([
  read('../apps/web/src/components/admin/PlatformAdminConsole.jsx'), read('../apps/web/src/components/admin/AdminApprovalsSection.jsx'), read('../apps/web/src/components/admin/AdminDirectorySection.jsx'), read('../apps/web/src/components/admin/AdminUsersSection.jsx'), read('../apps/web/src/components/admin/AdminAuditSection.jsx'), read('../apps/web/src/api/admin.js'), read('../apps/web/src/components/dialogs/AppDialog.jsx'), read('../apps/web/src/styles/admin-console.css')
])

test('批量目标以当前参数计算：选中审批与本页全部审批都不会读取异步旧 state', () => {
  const items = [{ id: 'a' }, { id: 'b' }, { id: 'c' }]
  assert.deepEqual(selectedBatchTargets(items, new Set(['b']), false).map((item) => item.id), ['b'])
  assert.deepEqual(selectedBatchTargets(items, new Set(), true).map((item) => item.id), ['a', 'b', 'c'])
  assert.deepEqual(selectedBatchTargets(items, new Set(), false), [])
})

test('游标追加按 id 去重并用新结果覆盖同一实体', () => {
  assert.deepEqual(appendUniqueById([{ id: 'a', revision: 1 }, { id: 'b' }], [{ id: 'a', revision: 2 }, { id: 'c' }]), [{ id: 'a', revision: 2 }, { id: 'b' }, { id: 'c' }])
})

test('请求闸门中止旧请求且只接受最新序号', () => {
  const gate = requestGate(); const first = gate.next(); const second = gate.next()
  assert.equal(first.signal.aborted, true); assert.equal(second.signal.aborted, false)
  assert.equal(gate.isLatest(first.id), false); assert.equal(gate.isLatest(second.id), true)
  gate.cancel(); assert.equal(second.signal.aborted, true)
})

test('后台 shell 仍为六分区、深链、移动 dock，并在导航后把焦点送入主区', () => {
  for (const id of ['overview', 'approvals', 'directory', 'users', 'audit']) assert.match(consoleSource, new RegExp(`id: '${id}'`, 'u'))
  assert.match(consoleSource, /admin-dock/u); assert.match(consoleSource, /document\.getElementById\('admin-main'\)\?\.focus/u)
})

test('审批把门店/角色/调店统一送入明确批准或拒绝确认，并在批量后只刷新一次摘要', () => {
  assert.match(approvalsSource, /selectedBatchTargets/u); assert.match(approvalsSource, /确认批准/u); assert.match(approvalsSource, /确认拒绝/u)
  assert.match(approvalsSource, /shared\.reviewStore\(item/u); assert.match(approvalsSource, /await reloadAfterMutation\(\)/u)
  assert.match(approvalsSource, /拒绝时请填写至少 2 个字符的理由/u); assert.match(approvalsSource, /role="tabpanel"/u)
})

test('目录重命名与新增通过统一目录写入入口', () => {
  assert.match(directorySource, /const rename = async/u)
  assert.match(directorySource, /shared\.updateDirectory/u)
  assert.match(directorySource, /shared\.createDirectory/u)
})

test('用户写操作携带乐观锁、重置使用稳定幂等键，临时密码必须复制后关闭', () => {
  assert.match(apiSource, /expectedStatus: user\.status/u); assert.match(apiSource, /expectedUpdatedAt: user\.updatedAt/u); assert.match(apiSource, /idempotencyKey: resetKey/u)
  assert.match(usersSource, /key: idempotencyKey\(\)/u); assert.match(usersSource, /复制临时密码/u); assert.match(usersSource, /disabled=\{!copied\}/u)
  assert.match(usersSource, /maxLength="24"/u); assert.match(usersSource, /<form className="admin-toolbar" role="search"/u)
})

test('用户和审计在手机端渲染真实卡片，审计摘要不会被 nth-child 隐藏', () => {
  assert.match(usersSource, /admin-mobile-cards/u); assert.match(auditSource, /admin-audit-card/u); assert.match(auditSource, /event\.summary/u)
  assert.match(cssSource, /\.admin-desktop-table \{ display: none; \}/u); assert.match(cssSource, /\.admin-mobile-cards \{ display: grid;/u)
  const mobileCss = cssSource.slice(cssSource.indexOf('@media (max-width: 767px)'))
  assert.doesNotMatch(mobileCss, /nth-child\(6\)/u)
})

test('门店详情和筛选均使用可中止的 latest-request gate，切店先清除旧详情', () => {
    assert.match(auditSource, /requestGate\(\)/u); assert.match(usersSource, /requestGate\(\)/u); assert.match(approvalsSource, /requestGate\(\)/u)
})

test('AppDialog 使用 useId，支持不可关闭的敏感凭据流程并恢复焦点', () => {
  assert.match(dialogSource, /useId/u); assert.match(dialogSource, /dismissible = true/u); assert.match(dialogSource, /restoreFocusRef/u)
  assert.match(dialogSource, /if \(dismissible\) onClose/u)
})

test('后台 CSS 只有一组响应式/动效/forced-colors 门禁且补齐 44px 操作目标', () => {
  assert.equal((cssSource.match(/@media \(max-width: 1023px\)/gu) || []).length, 1)
  assert.equal((cssSource.match(/@media \(prefers-reduced-motion: reduce\)/gu) || []).length, 1)
  assert.equal((cssSource.match(/@media \(forced-colors: active\)/gu) || []).length, 1)
  assert.match(cssSource, /admin-directory-actions button,[\s\S]*min-height: 44px/u)
})

const [appSource, overviewSource, formatSource, menuSource, headerSource, indexCss, componentsCss, directoryMigration] = await Promise.all([
  read('../apps/web/src/App.jsx'),
  read('../apps/web/src/components/admin/AdminOverviewSection.jsx'),
  read('../apps/web/src/components/admin/admin-format.js'),
  read('../apps/web/src/components/dialogs/MenuDialog.jsx'),
  read('../apps/web/src/components/workshop/WorkshopShellHeader.jsx'),
  read('../apps/web/src/styles/index.css'),
  read('../apps/web/src/styles/components.css'),
  read('../migrations/d1/0010_admin_console_query_indexes.sql')
])

// Preserved baseline coverage from the accepted admin-console implementation.
test('平台管理后台仅在平台管理员且 hash 为 #admin 时渲染', () => {
  // 后台改为按需分包，入口由静态 import 变为 lazy 动态 import；权限与 hash 约束不变。
  assert.match(appSource, /lazy\(\(\) => import\('\.\/components\/admin\/PlatformAdminConsole\.jsx'\)\)/u)
  assert.match(appSource, /adminMode && auth\.user\?\.isPlatformAdmin/u)
  assert.match(appSource, /<PlatformAdminConsole/u)
  assert.match(appSource, /onExit=\{exitAdminMode\}/u)
})

test('菜单只对平台管理员显示平台管理后台入口，并显示待审批角标', () => {
  assert.match(menuSource, /canAdmin, onAdmin, adminPending = 0/u)
  assert.match(menuSource, /平台管理后台/u)
  assert.match(menuSource, /adminPending > 0 \? <b className="dialog-action-badge"/u)
  assert.match(appSource, /canAdmin=\{auth\.user\?\.isPlatformAdmin\}/u)
  assert.match(appSource, /window\.location\.hash = '#admin'/u)
})

test('门店工作台头部为平台管理员显示待审批角标并轮询轻量计数', () => {
  assert.match(headerSource, /pendingBadge = 0/u)
  assert.match(headerSource, /workshop-pending-badge/u)
  assert.match(appSource, /getAdminPendingCount\(\)/u)
  assert.match(appSource, /setInterval\(\(\) => void poll\(\), 60000\)/u)
  assert.match(appSource, /pendingBadge=\{adminPending\}/u)
  // 角标宿主是门店工作台头部（非后台页面），样式已移入常驻 components.css，
  // 以免随后台分包延迟加载导致无样式闪现。
  assert.match(componentsCss, /\.workshop-pending-badge/u)
})

test('管理台外壳包含五个分区与移动 dock', () => {
  for (const id of ['overview', 'approvals', 'directory', 'users', 'audit']) assert.match(consoleSource, new RegExp(`id: '${id}'`, 'u'))
  assert.match(consoleSource, /admin-dock/u); assert.match(consoleSource, /pendingTotal/u); assert.match(consoleSource, /Promise\.allSettled/u)
})

test('总览为驾驶舱：今日变化、7/30 天切换、权限变更与变化流均可点击跳转', () => {
  assert.match(overviewSource, /今日变化/u)
  assert.match(overviewSource, /admin-stat-link/u)
  assert.match(overviewSource, /admin-segmented/u)
  assert.match(overviewSource, /setPeriod\('d7'\)/u)
  assert.match(overviewSource, /setPeriod\('d30'\)/u)
  assert.match(overviewSource, /admin-role-stat-row/u)
  assert.match(overviewSource, /row\.initiated/u)
  assert.match(overviewSource, /onJump\(change\.type === 'new-user' \? 'users'/u)
  assert.match(overviewSource, /today\.items/u)
})

test('变化流与最近平台事件为阅读型两行结构：摘要整行换行、元信息带日锚点，宽卡真正跨列', () => {
  // 摘要独占一行且允许换行，元信息（标签/时间/门店/操作人）降为次级行。
  assert.match(overviewSource, /admin-change-summary/u)
  assert.match(overviewSource, /admin-change-meta/u)
  assert.match(overviewSource, /admin-audit-summary/u)
  assert.match(overviewSource, /admin-audit-meta/u)
  assert.match(overviewSource, /event\.actorNameSnapshot/u)
  assert.match(overviewSource, /event\.storeName/u)
  // 近三天用日锚点，完整时间进 title，避免只剩 月-日 时:分 难以定位。
  assert.match(formatSource, /'今天'/u)
  assert.match(formatSource, /'昨天'/u)
  assert.match(formatSource, /'前天'/u)
  assert.match(overviewSource, /from '\.\/admin-format\.js'/u)
  assert.match(overviewSource, /title=\{stamp\.full\}/u)
  // 变化流类型标签带语义色调。
  assert.match(overviewSource, /changeTones/u)
  assert.match(overviewSource, /data-tone=/u)
  // 事件条独占整行；两处摘要都不得回到 nowrap 截断。
  assert.match(cssSource, /\.admin-card-wide\s*\{[^}]*grid-column: 1 \/ -1/u)
  assert.match(cssSource, /\.admin-change-summary\s*\{[^}]*overflow-wrap: anywhere/u)
  assert.match(cssSource, /\.admin-audit-summary\s*\{[^}]*overflow-wrap: anywhere/u)
  assert.doesNotMatch(cssSource, /\.admin-audit-strip span:last-child/u)
  // 行分隔线让长列表可扫读。
  assert.match(cssSource, /\.admin-change-list li \+ li\s*\{[^}]*border-top/u)
  assert.match(cssSource, /\.admin-audit-strip li\s*\{[^}]*border-top/u)
})

test('审批行为阅读型结构：去向不截断、元信息分项、截止时间带紧迫度', () => {
  // 身份列此前是单行 nowrap + ellipsis，调店的「源店 → 目标店」两个中文店名必被截断。
  assert.match(approvalsSource, /admin-approval-move-from/u)
  assert.match(approvalsSource, /admin-approval-move-to/u)
  assert.match(cssSource, /\.admin-approval-identity span\s*\{[^}]*overflow-wrap: anywhere/u)
  assert.doesNotMatch(cssSource, /\.admin-approval-identity span\s*\{[^}]*white-space: nowrap/u)
  // 元信息原来用「·」串成一行，改为标签 + 值的分项结构。
  assert.match(approvalsSource, /function ApprovalMeta/u)
  assert.match(approvalsSource, /admin-approval-meta-label/u)
  // 审批会过期：截止时间必须显示剩余量并按紧迫度上色，否则容易漏批。
  assert.match(formatSource, /export function formatDeadline/u)
  assert.match(formatSource, /'urgent'/u)
  assert.match(formatSource, /'expired'/u)
  assert.match(formatSource, /已过期/u)
  assert.match(cssSource, /\[data-tone='urgent'\] time[\s\S]{0,120}?--ops-danger/u)
  // 与其余四个分区统一走共享格式化，不再各自实现 formatTime。
  assert.match(approvalsSource, /from '\.\/admin-format\.js'/u)
  assert.doesNotMatch(approvalsSource, /function formatTime/u)
  // 角色/调店申请的终态也要有状态标签，此前只有门店审核显示。
  assert.match(approvalsSource, /requestStatusLabels/u)
  // 三列高度不等时顶对齐，避免长理由把身份列压到视觉居中错位。
  assert.match(cssSource, /\.admin-approval-row\s*\{[^}]*align-items: start/u)
})

test('目录写操作失败必须可见：四处 catch 不再静默吞掉错误', () => {
  // 此前 createDirectory / updateDirectory(重命名) / updateDirectory(停用) / 成员变更
  // 全是 catch {}，失败后按钮恢复可点但界面无任何提示，用户会以为是自己操作错了。
  assert.doesNotMatch(directorySource, /catch \{\}/u)
  assert.match(directorySource, /const \[writeError, setWriteError\] = useState\(''\)/u)
  assert.match(directorySource, /admin-directory-write-error/u)
  assert.match(directorySource, /role="alert"/u)
  // 四处写操作都要落到 setWriteError
  assert.ok((directorySource.match(/setWriteError\(error\.message/gu) || []).length >= 4, '四处写操作都应上报错误原因')
})

test('后台按需分包：门店用户首屏不加载后台组件与样式，但非后台角标样式必须常驻全局', () => {
  // 后台入口切成异步 chunk
  assert.match(appSource, /lazy\(\(\) => import\('\.\/components\/admin\/PlatformAdminConsole\.jsx'\)\)/u)
  assert.match(appSource, /<Suspense fallback=/u)
  assert.doesNotMatch(appSource, /^import PlatformAdminConsole from/mu)
  // 后台样式随后台入口加载，已从全局 index.css 移除
  assert.doesNotMatch(indexCss, /@import '\.\/admin-console\.css'/u)
  assert.match(consoleSource, /import '\.\.\/\.\.\/styles\/admin-console\.css'/u)
  // 关键红线：这两个角标的宿主是门店工作台头部与菜单弹窗（非后台页面），
  // 规则必须留在常驻样式里，否则平台管理员在非后台页面会看到无样式角标。
  assert.match(componentsCss, /\.workshop-pending-badge\s*\{/u)
  assert.match(componentsCss, /\.dialog-action-badge\s*\{/u)
  assert.doesNotMatch(cssSource, /\.workshop-pending-badge\s*\{/u)
  assert.doesNotMatch(cssSource, /\.dialog-action-badge\s*\{/u)
  // 分包加载占位样式同样必须常驻，否则提示会无样式闪现
  assert.match(componentsCss, /\.admin-console-loading\s*\{/u)
  // 后台样式表必须 100% 锚定 admin 作用域，否则移出全局会影响其它页面
  const stripped = cssSource.replace(/\/\*[\s\S]*?\*\//gu, '')
  const selectors = [...stripped.matchAll(/(^|\})\s*([^{}@]+)\{/gu)].flatMap((m) => m[2].split(','))
  const leaked = selectors.map((s) => s.trim()).filter((s) => s && !/\.admin[-\w]*/u.test(s))
  assert.deepEqual(leaked, [], `后台样式表存在非 admin 作用域选择器：${leaked.join(' | ')}`)
})

test('后台查询索引迁移只保留 EXPLAIN 确认生效的索引', () => {
  // decided_at 此前完全无索引，总览每次加载都全表扫两张申请表
  assert.match(directoryMigration, /role_change_requests_status_decided_idx/u)
  assert.match(directoryMigration, /store_transfer_requests_status_decided_idx/u)
  assert.match(directoryMigration, /role_change_requests_store_created_idx/u)
  assert.match(directoryMigration, /users_created_id_idx/u)
  // 幂等，可安全重放
  assert.ok((directoryMigration.match(/CREATE INDEX IF NOT EXISTS/gu) || []).length === 4)
  // 实测未被 planner 选中的索引不得混进迁移：
  // status IN (三值) 跨值排序时 SQLite 必然走 TEMP B-TREE，加这两条索引无效。
  assert.doesNotMatch(directoryMigration, /CREATE INDEX IF NOT EXISTS role_change_requests_created_id_idx/u)
  assert.doesNotMatch(directoryMigration, /CREATE INDEX IF NOT EXISTS store_transfer_requests_created_id_idx/u)
  // store_members(user_id) 已有唯一分区索引，不得重复建
  assert.doesNotMatch(directoryMigration, /store_members_active_user_store_idx/u)
  // 纯追加：不得含任何结构或数据变更
  assert.doesNotMatch(directoryMigration, /\b(DROP|ALTER|DELETE|UPDATE|INSERT)\b/u)
})

test('目录展开态独占整行、折叠态标题不与状态操作抢宽度，门店与成员行为可读密度', () => {
  // 折叠态窄列（~260px）容不下「标题 + 状态 + 两个按钮」一行：状态与操作收进 meta 降到第二行。
  assert.match(directorySource, /admin-directory-module-meta/u)
  // 展开后必须跨满整行，否则门店行被压在窄列里 min-content 溢出数倍、逐字换行。
  assert.match(cssSource, /\.admin-directory-major-grid > \.admin-directory-module\[data-expanded='true'\]\s*\{[^}]*grid-column: 1 \/ -1/u)
  assert.match(cssSource, /\.admin-directory-module-head\s*\{[^}]*flex-wrap: wrap/u)
  assert.match(cssSource, /\.admin-directory-module-trigger\s*\{[^}]*flex: 1 1 100%/u)
  assert.match(cssSource, /\[data-expanded='true'\] > \.admin-directory-module-head > \.admin-directory-module-trigger\s*\{[^}]*flex: 1 1 auto/u)
  // 门店行与成员行提到可读密度并可扫读。
  assert.match(cssSource, /\.admin-directory-store-row\s*\{[^}]*font-size: 14px/u)
  assert.match(cssSource, /\.admin-directory-store-row:hover/u)
  assert.match(cssSource, /\.admin-directory-member-row > strong\s*\{[^}]*font-size: 14px/u)
  // SSR 暴露：module() 返回的根节点缺 key，React 无法按 id reconcile（重命名/刷新后可能错位）。
  assert.match(directorySource, /const module = \(kind, item, expanded, onClick, body\) => <div key=\{item\.id\}/u)
  // 门店行操作是嵌套的两层 .admin-directory-actions，窄屏必须按后代选择器等宽，否则只有「查看」被拉伸。
  assert.match(cssSource, /\.admin-directory-store-row \.admin-directory-actions>\*\{flex:1 1 80px\}/u)
})

test('用户表把门店与角色合并为配对列，最近登录带日锚点', () => {
  // 原先角色、门店各自一列用顿号拼接，多门店用户需要人工按位置对应。
  assert.match(usersSource, /门店与角色/u)
  assert.match(usersSource, /MembershipList/u)
  assert.match(usersSource, /membership\.storeName/u)
  assert.match(usersSource, /admin-membership-role/u)
  assert.doesNotMatch(usersSource, /<th>角色<\/th>/u)
  assert.doesNotMatch(usersSource, /<th>门店<\/th>/u)
  // 最近登录改日锚点，完整日期进 title；从未登录明确成文案而不是长横线。
  assert.match(usersSource, /formatDayStamp/u)
  assert.match(usersSource, /从未登录/u)
  assert.match(formatSource, /export function formatDayStamp/u)
  // 配对列样式：每条成员一行，角色用分隔线而非顿号堆叠。
  assert.match(cssSource, /\.admin-membership-list\s*\{[^}]*flex-direction: column/u)
  assert.match(cssSource, /\.admin-membership-role\s*\{[^}]*border-left/u)
  assert.match(cssSource, /\.admin-table td\s*\{[^}]*line-height: 1\.5/u)
})

test('目录分区承载门店行、成员详情与四级层级', () => {
  assert.match(directorySource, /admin-directory-major-grid/u)
  assert.match(directorySource, /shared\.getStore/u)
  assert.match(directorySource, /memberPanel/u)
  assert.match(directorySource, /成员 \{store\.memberCount/u)
  assert.match(directorySource, /编辑/u); assert.match(directorySource, /移除/u)
})

test('审批分区：三页签（角色/调店/门店）× 三组 + 批量 + 理由必填拒绝', () => {
  assert.match(approvalsSource, /id: 'role'/u)
  assert.match(approvalsSource, /id: 'transfer'/u)
  assert.match(approvalsSource, /id: 'store', label: '门店审核'/u)
  assert.match(approvalsSource, /id: 'pending'/u)
  assert.match(approvalsSource, /id: 'expired'/u)
  assert.match(approvalsSource, /id: 'decided'/u)
  assert.match(approvalsSource, /批量批准/u)
  assert.match(approvalsSource, /全部批准/u)
  assert.match(approvalsSource, /runBatch/u)
  assert.match(approvalsSource, /shared\.reviewStore\(item,/u)
  assert.match(approvalsSource, /DecisionDialog/u)
  assert.match(approvalsSource, /required=\{!approve\}/u)
  assert.match(approvalsSource, /拒绝必填/u)
  assert.match(approvalsSource, /shared\.decideRole\(item, approve, reason\)/u)
})

test('目录支持待审核状态、门店行查看与停用', () => {
  assert.match(directorySource, /待审核/u); assert.match(directorySource, /viewMembers/u); assert.match(directorySource, /item.status !== 'pending'/u); assert.match(directorySource, /void toggle/u)
})

test('用户分区支持创建账号、禁用/恢复（确认弹窗）与一次性临时密码', () => {
  assert.match(usersSource, /创建账号/u)
  assert.match(usersSource, /CreateUserDialog/u)
  assert.match(usersSource, /roleOptions/u)
  assert.match(usersSource, /toggleUserStatus\(user,/u)
  assert.match(usersSource, /禁用账号/u)
  assert.match(usersSource, /resetPassword\(state\.user, state\.key\)/u)
  assert.match(usersSource, /admin-temp-password/u)
  assert.match(usersSource, /强制修改密码/u)
  assert.match(usersSource, /minLength="10"/u)
  assert.match(usersSource, /受保护/u)
})

test('审计分区支持门店/操作人/动作类型筛选', () => {
  assert.match(auditSource, /placeholder="操作人"/u)
  assert.match(auditSource, /placeholder="动作类型/u)
  assert.match(auditSource, /shared\.getAudit\(\{ \.\.\.filters,/u)
  assert.match(auditSource, /actor: filters\.actor\.trim\(\)/u)
  assert.match(auditSource, /action: filters\.action\.trim\(\)/u)
  assert.match(consoleSource, /auditStoreOptions/u)
})

test('管理台 API 客户端覆盖只读与写操作端点', () => {
  assert.match(apiSource, /api\/v1\/admin\/overview/u)
  assert.match(apiSource, /api\/v1\/admin\/users/u)
  assert.match(apiSource, /api\/v1\/admin\/audit-events/u)
  assert.match(apiSource, /api\/v1\/admin\/stores\/\$\{encodeURIComponent\(storeId\)\}/u)
  assert.match(apiSource, /api\/v1\/admin\/approvals/u)
  assert.match(apiSource, /api\/v1\/admin\/pending-count/u)
  assert.match(apiSource, /method: 'POST', body/u)
  assert.match(apiSource, /idempotencyKey: resetKey/u)
  assert.match(apiSource, /adminResetPassword/u)
  assert.match(apiSource, /adminReviewStore/u)
  assert.match(apiSource, /params\.set\('storeId', filters\.storeId\)/u)
})

test('管理台样式注册且覆盖移动端底部标签栏与卡片化布局', () => {
  // 后台样式表改由后台入口引入，从而与后台组件同处一个异步 chunk。
  assert.match(consoleSource, /import '\.\.\/\.\.\/styles\/admin-console\.css'/u)
  assert.match(cssSource, /\.admin-dock/u)
  assert.match(cssSource, /@media \(max-width: 767px\)/u)
  assert.match(cssSource, /grid-template-columns: repeat\(5, minmax\(0, 1fr\)\)/u)
  assert.match(cssSource, /admin-decision-backdrop/u)
  assert.match(cssSource, /admin-temp-password/u)
  assert.match(cssSource, /prefers-reduced-motion/u)
  assert.match(cssSource, /forced-colors/u)
  assert.doesNotMatch(cssSource, /linear-gradient|backdrop-filter/u)
  assert.match(cssSource, /min-height: 44px/u)
})

test('移动端滚动结构：admin-body flex column + region 独立滚动容器', () => {
  const mobileBlock = cssSource.slice(cssSource.indexOf('@media (max-width: 767px)'))
  assert.match(mobileBlock, /\.admin-body \{\s*\n\s*display: flex;\s*\n\s*flex-direction: column;\s*\n\s*min-height: 0;/u)
  assert.match(mobileBlock, /\.admin-region \{\s*\n\s*flex: 1 1 auto;\s*\n\s*min-height: 0;\s*\n\s*overflow-y: auto;/u)
  assert.doesNotMatch(mobileBlock, /\.admin-body \{\s*\n\s*display: block;/u)
})

test('审批卡片移动端：详情与操作显式占用宽列（防竖排文本）', () => {
  const tabletBlock = cssSource.slice(cssSource.indexOf('@media (max-width: 1023px)'))
  assert.match(tabletBlock, /\.admin-approval-row \{\s*\n\s*grid-template-columns: 24px minmax\(0, 1fr\);/u)
  assert.match(tabletBlock, /\.admin-approval-row \.admin-approval-identity,\s*\n\s*\.admin-approval-row \.admin-approval-detail,\s*\n\s*\.admin-approval-row \.admin-approval-actions \{\s*\n\s*grid-column: 2;/u)
})

test('目录合并为五项导航与大区/小区/城市/门店行单路径展开', () => { assert.doesNotMatch(consoleSource, /id: 'stores'/u); assert.match(directorySource, /subregions/u); assert.match(directorySource, /setRegion/u); assert.match(directorySource, /memberPanel/u); assert.match(directorySource, /成员 \{store\.memberCount/u); assert.match(directorySource, /编辑/u); assert.match(directorySource, /移除/u); assert.match(cssSource, /\.admin-directory-major-grid\s*\{[^}]*repeat\(auto-fill, minmax\(260px/u) })

test('后台目录手机态：密度规则必须挂在实际渲染的类上，不得再挂死类', () => {
  // 1842-1846 行那批移动端压缩规则挂在 .admin-directory-row 上，而 #174 换实现后
  // 渲染的是 .admin-directory-module，于是规则从未生效。这条断言防止再次发生。
  for (const dead of ['admin-directory-row', 'admin-directory-tree', 'admin-directory-branch']) {
    assert.doesNotMatch(directorySource, new RegExp(dead, 'u'), `${dead} 已不再渲染，不应有组件引用`)
  }
  assert.match(directorySource, /admin-directory-module-head/u)
  assert.match(directorySource, /admin-directory-store-row/u)
})

test('后台目录手机态：标题回到单行，这是密度的主要来源', () => {
  const phone = cssSource.slice(cssSource.indexOf('后台专属高密度信息流'))
  // 桌面 226px 窄列需要 flex: 1 1 100% 让标题独占一行；手机有整屏宽度，必须收回单行，
  // 否则每个实体被撑到 44 + 8 + 44 + 上下内边距 = 约 118px。
  assert.match(phone, /\.admin-directory-module-head \{[^}]*flex-wrap: nowrap;[^}]*min-height: 44px/u)
  assert.match(phone, /\.admin-directory-module-trigger \{[^}]*flex: 1 1 auto/u)
  // 桌面那条 flex: 1 1 100% 必须原样保留在断点之外。
  const desktop = cssSource.slice(0, cssSource.indexOf('后台专属高密度信息流'))
  assert.match(desktop, /\.admin-directory-module-trigger \{[^}]*flex: 1 1 100%/u)
})

test('后台目录手机态：图标操作保住 44px 触摸目标且动词留在无障碍名称里', () => {
  const phone = cssSource.slice(cssSource.indexOf('后台专属高密度信息流'))
  // DESIGN.md：图标操作需要可访问名称与至少 44px 命中区域。
  // 参考稿的图标框是 28px，低于 44px。视觉尺寸照搬参考稿，命中区由 ::after 扩到 44px，
  // 两者解耦——这样既复刻观感又不牺牲触摸目标。
  assert.match(phone, /\.admin-directory-icon-action \{[^}]*width: 28px;[^}]*min-width: 28px/u)
  assert.match(phone, /\.admin-directory-icon-action::after \{[^}]*width: 44px;[^}]*height: 44px/u)
  // 成员卡的编辑/移除是纯文字按钮，必须自身撑满 44px（无 ::after 兜底）。
  assert.match(phone, /\.admin-directory-member-row button \{[^}]*min-width: 44px;[^}]*min-height: 44px/u)
  // 文字标签视觉隐藏但保留在 DOM，动词同时由 aria-label 承载。
  assert.match(phone, /\.admin-directory-icon-action \.admin-action-label \{[^}]*clip-path: inset\(50%\)/u)
  assert.match(directorySource, /aria-label=\{`重命名\$\{labels\[kind\]\}\$\{item\.name\}`\}/u)
  assert.match(directorySource, /aria-label=\{`\$\{item\.status === 'active' \? '停用' : '启用'\}/u)
  assert.match(directorySource, /aria-label=\{`\$\{openStore === store\.id \? '收起' : '查看'\}\$\{store\.name\}成员`\}/u)
  assert.match(directorySource, /<span className="admin-action-label">/u)
})

test('后台目录手机态：门店行两行网格，因为单行放不下三层缩进后的店名', () => {
  const phone = cssSource.slice(cssSource.indexOf('后台专属高密度信息流'))
  // 360px 三层缩进吃掉约 51px，三个 44px 按钮 132px，状态与计数约 82px，
  // 单行只剩约 77px 给「BIKE-JA 静安店」。故意分两行。
  // 参考稿把操作放在首行右侧并跨两行竖向居中，次行只留成员数——三列网格 + grid-area。
  assert.match(phone, /\.admin-directory-store-row \{[^}]*grid-template-columns: minmax\(0, 1fr\) auto auto;/u)
  assert.match(phone, /\.admin-directory-store-row > \.admin-directory-member-count \{ grid-area: 2 \/ 1 \/ 3 \/ 3; \}/u)
  assert.match(phone, /\.admin-directory-store-row > \.admin-directory-actions \{\s*\n\s*grid-area: 1 \/ 3 \/ 3 \/ 4;/u)
  // 名称过长必须省略且由 title 提供全文，不得竖排。
  assert.match(phone, /\.admin-directory-store-identity strong \{[^}]*text-overflow: ellipsis/u)
  assert.match(directorySource, /<strong title=\{store\.name\}>/u)
})

test('后台目录手机态：层级靠缩进轨与字重表达，不靠逐层卡片外壳', () => {
  const phone = cssSource.slice(cssSource.indexOf('后台专属高密度信息流'))
  assert.match(phone, /\.admin-directory-module \{[^}]*border: 0;[^}]*background: transparent/u)
  // 参考稿：大区恢复一张卡壳，其内不再嵌套卡壳；层级由单条竖干 + 横支 + 琥珀圆点表达。
  assert.match(phone, /\.admin-directory-module-regions \{[^}]*border: 1px solid[^}]*border-radius: 8px/u)
  // 竖干必须用 ::before 而非 border-left：border-left 只能拉通全高，
  // 无法在最后一支的分叉点收住（参考稿实测竖干止于末支中心，不拖到底）。
  assert.match(phone, /\.admin-directory-module-regions > \.admin-directory-child-level::before \{[^}]*bottom: 24px;[^}]*width: 1px/u)
  assert.match(phone, /\.admin-directory-child-level \{[^}]*border-left: 0/u)
  // 横支：小区 17px、城市 37px、门店 17px，均从竖干接到该行圆点/卡片左缘。
  assert.match(phone, /\.admin-directory-module-subregions > \.admin-directory-module-head::before \{[^}]*left: -17px;[^}]*width: 17px/u)
  assert.match(phone, /\.admin-directory-store-block::before \{[^}]*left: -17px;[^}]*width: 17px/u)
  // 圆点替代 +/−：折叠态用中性色，展开态用琥珀，状态同时由 aria-expanded 承载。
  assert.match(phone, /\.admin-directory-module-chevron \{[^}]*border-radius: 50%[^}]*background: var\(--ops-yellow/u)
  assert.match(directorySource, /aria-expanded=\{expanded\}/u)
  // 字号阶梯换成字重阶梯：手机上字号阶梯只会浪费行高。
  assert.match(phone, /module-regions[^{]*\{ font-size: 15px; font-weight: 700; \}/u)
  assert.match(phone, /module-subregions[^{]*\{ font-size: 14px; font-weight: 600; \}/u)
})

test('后台目录：子树规模内联在父层，不展开也能判断规模', () => {
  assert.match(directorySource, /function subtreeCounts\(kind, item\)/u)
  assert.match(directorySource, /\$\{sr\.length\}区 · \$\{ct\.length\}市/u)
  assert.match(directorySource, /admin-directory-counts/u)
  const phone = cssSource.slice(cssSource.indexOf('后台专属高密度信息流'))
  assert.match(phone, /\.admin-directory-counts \{[^}]*font-variant-numeric: tabular-nums/u)
})

test('后台目录手机态：树连接线为单竖干加横支，且竖干止于最后一支的分叉点', () => {
  const phone = cssSource.slice(cssSource.indexOf('后台专属高密度信息流'))
  // 参考稿实测只有一条竖干（28.5px 处），小区/城市并无各自竖干；用 ::before 而非
  // border-left，因为 border-left 会一路拖到容器底部，无法止于最后一支的分叉点。
  assert.match(phone, /\.admin-directory-module-regions > \.admin-directory-child-level::before \{[^}]*bottom: 24px/u)
  assert.match(phone, /\.admin-directory-module-regions > \.admin-directory-child-level::before \{[^}]*width: 1px/u)
  // 横支：小区 17px、城市 37px、门店 17px，均自竖干接到该行圆点或卡片左边。
  assert.match(phone, /\.admin-directory-module-subregions > \.admin-directory-module-head::before \{[^}]*left: -17px/u)
  assert.match(phone, /\.admin-directory-module-cities > \.admin-directory-module-head::before \{[^}]*left: -37px/u)
  assert.match(phone, /\.admin-directory-store-block::before \{[^}]*left: -17px/u)
})

test('后台目录手机态：琥珀圆点承担层级标记，展开态与折叠态靠色值区分', () => {
  const phone = cssSource.slice(cssSource.indexOf('后台专属高密度信息流'))
  // 参考稿用 6px 琥珀圆点替代 +/− 文字；文字仍在 DOM 里由 font-size: 0 视觉隐藏，
  // 展开状态由 aria-expanded 承载，圆点色值只是冗余的视觉提示。
  assert.match(phone, /\.admin-directory-module-chevron \{[^}]*width: 6px;[^}]*height: 6px;[^}]*border-radius: 50%/u)
  assert.match(phone, /\.admin-directory-module-chevron \{[^}]*font-size: 0/u)
  assert.match(phone, /data-expanded='false'\][^{]*\.admin-directory-module-chevron \{[^}]*background: var\(--ops-line-strong/u)
  assert.match(directorySource, /aria-expanded=\{expanded\}/u)
})

test('后台目录手机态：门店与成员恢复独立卡，成员卡带 2px 琥珀左强调条', () => {
  const phone = cssSource.slice(cssSource.indexOf('后台专属高密度信息流'))
  assert.match(phone, /\.admin-directory-store-block \{[^}]*border: 1px solid[^}]*border-radius: 8px/u)
  assert.match(phone, /\.admin-directory-member-row \{[^}]*border-left: 2px solid var\(--ops-yellow/u)
  // 卡片自带完整边框，不得再叠 + 选择器的 border-top，否则卡片顶部出现双线。
  assert.doesNotMatch(phone, /\.admin-directory-store-block \+ \.admin-directory-store-block \{[^}]*border-top/u)
  assert.doesNotMatch(phone, /\.admin-directory-member-row \+ \.admin-directory-member-row \{[^}]*border-top/u)
})

test('后台目录手机态：成员卡四列，避免第六个子元素溢出成独占整行', () => {
  const phone = cssSource.slice(cssSource.indexOf('后台专属高密度信息流'))
  // 三列容纳六个子元素时，第六个（移除）落到第四行第一列，而该列为 1fr 故文字居中，
  // 成员卡被撑到 118px。四列让「角色 / 状态 / 编辑 / 移除」回到同一行。
  assert.match(phone, /\.admin-directory-member-row \{[^}]*grid-template-columns: minmax\(0, 1fr\) auto auto auto/u)
  // 编辑态子元素数量与展示态不同，必须排除，否则输入框被塞进四列。
  assert.match(phone, /:not\(\.admin-directory-member-edit\) > :nth-child\(1\)/u)
  assert.match(phone, /\.admin-directory-member-edit \{[^}]*grid-template-columns: minmax\(0, 1fr\)/u)
})

test('后台目录手机态：代码与店名之间只保留一处间距', () => {
  const phone = cssSource.slice(cssSource.indexOf('后台专属高密度信息流'))
  // .admin-store-code 自带 margin-right: 8px，identity 又有 gap: 6px，叠成 14px；
  // 360px 视口下这 8px 直接从店名可用宽度里扣掉。
  assert.match(phone, /\.admin-directory-store-identity \.admin-store-code \{[^}]*margin-right: 0/u)
  const desktop = cssSource.slice(0, cssSource.indexOf('后台专属高密度信息流'))
  assert.match(desktop, /\.admin-store-code \{[^}]*margin-right: 8px/u)
})

test('后台目录手机态：状态标签压缩必须限定在目录内，不得污染其它分区', () => {
  const phone = cssSource.slice(cssSource.indexOf('后台专属高密度信息流'))
  // .admin-status-tag 被审批/用户/门店三个分区共用，裸选择器会连带改掉已验收的移动卡片。
  assert.doesNotMatch(phone, /\n  \.admin-status-tag \{/u, '不得在手机块内使用裸 .admin-status-tag')
  assert.match(phone, /\.admin-directory-module-meta \.admin-status-tag,/u)
  assert.match(phone, /\.admin-directory-store-row \.admin-status-tag,/u)
})
