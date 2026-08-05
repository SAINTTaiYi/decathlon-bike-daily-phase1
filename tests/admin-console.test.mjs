import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { appendUniqueById, requestGate, selectedBatchTargets } from '../apps/web/src/components/admin/admin-state.js'
const read = (path) => readFile(new URL(path, import.meta.url), 'utf8')
const [consoleSource, approvalsSource, directorySource, usersSource, auditSource, storesSource, apiSource, dialogSource, cssSource] = await Promise.all([
  read('../apps/web/src/components/admin/PlatformAdminConsole.jsx'), read('../apps/web/src/components/admin/AdminApprovalsSection.jsx'), read('../apps/web/src/components/admin/AdminDirectorySection.jsx'), read('../apps/web/src/components/admin/AdminUsersSection.jsx'), read('../apps/web/src/components/admin/AdminAuditSection.jsx'), read('../apps/web/src/components/admin/AdminStoresSection.jsx'), read('../apps/web/src/api/admin.js'), read('../apps/web/src/components/dialogs/AppDialog.jsx'), read('../apps/web/src/styles/admin-console.css')
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
  for (const id of ['overview', 'stores', 'approvals', 'directory', 'users', 'audit']) assert.match(consoleSource, new RegExp(`id: '${id}'`, 'u'))
  assert.match(consoleSource, /storeIdFromHash/u); assert.match(consoleSource, /admin-dock/u); assert.match(consoleSource, /document\.getElementById\('admin-main'\)\?\.focus/u)
})

test('审批把门店/角色/调店统一送入明确批准或拒绝确认，并在批量后只刷新一次摘要', () => {
  assert.match(approvalsSource, /selectedBatchTargets/u); assert.match(approvalsSource, /确认批准/u); assert.match(approvalsSource, /确认拒绝/u)
  assert.match(approvalsSource, /shared\.reviewStore\(item/u); assert.match(approvalsSource, /await reloadAfterMutation\(\)/u)
  assert.match(approvalsSource, /拒绝时请填写至少 2 个字符的理由/u); assert.match(approvalsSource, /role="tabpanel"/u)
})

test('目录保存按钮真正调用 saveRename，失败保留编辑器和新增表单', () => {
  assert.match(directorySource, /onClick=\{\(\) => void saveRename\(kind, item\)\}/u)
  assert.match(directorySource, /catch \{ \/\* keep editor open \*\//u)
  assert.ok(directorySource.indexOf('await shared.createDirectory') < directorySource.indexOf("setForm({ kind: 'regions'"))
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
  assert.match(storesSource, /requestGate\(\)/u); assert.match(storesSource, /setStore\(null\); setBusy\(true\)/u)
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

const [appSource, overviewSource, menuSource, headerSource, indexCss] = await Promise.all([
  read('../apps/web/src/App.jsx'),
  read('../apps/web/src/components/admin/AdminOverviewSection.jsx'),
  read('../apps/web/src/components/dialogs/MenuDialog.jsx'),
  read('../apps/web/src/components/workshop/WorkshopShellHeader.jsx'),
  read('../apps/web/src/styles/index.css')
])

// Preserved baseline coverage from the accepted admin-console implementation.
test('平台管理后台仅在平台管理员且 hash 为 #admin 时渲染', () => {
  assert.match(appSource, /import PlatformAdminConsole from '\.\/components\/admin\/PlatformAdminConsole\.jsx'/u)
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
  assert.match(cssSource, /\.workshop-pending-badge/u)
})

test('管理台外壳包含六个分区、门店深链与移动端底部标签栏', () => {
  for (const id of ['overview', 'stores', 'approvals', 'directory', 'users', 'audit']) {
    assert.match(consoleSource, new RegExp(`id: '${id}'`, 'u'))
  }
  assert.match(consoleSource, /storeIdFromHash/u)
  assert.match(consoleSource, /#admin\\\/stores/u)
  assert.match(consoleSource, /\[A-Za-z0-9-\]\+\)\/u/u)
  assert.match(consoleSource, /admin-dock/u)
  assert.match(consoleSource, /admin-dock-item/u)
  assert.match(consoleSource, /pendingTotal/u)
  assert.match(consoleSource, /reviewStore: adminReviewStore/u)
  assert.match(consoleSource, /Promise\.allSettled/u)
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

test('门店分区提供列表搜索与详情（组织路径/成员/业务概览）', () => {
  assert.match(storesSource, /placeholder="搜索门店代码/u)
  assert.match(storesSource, /shared\.getStore\(selectedStoreId, request\.signal\)/u)
  assert.match(storesSource, /admin-store-detail/u)
  assert.match(storesSource, /overview\.memberCount/u)
  assert.match(storesSource, /overview\.closedToday/u)
  assert.match(storesSource, /todayItems/u)
  assert.match(storesSource, /角色调整需通过审批流/u)
  assert.match(consoleSource, /directory=\{governance\?\.directory \|\| \[\]\}/u)
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

test('目录分区：门店创建提示待审核、待审核徽标与查看跳转', () => {
  assert.match(directorySource, /门店创建后为「待审核」/u)
  assert.match(directorySource, /statusLabels = \{ active: '生效', pending: '待审核', disabled: '停用' \}/u)
  assert.match(directorySource, /onViewStore\(item\.id\)/u)
  assert.match(directorySource, /item\.status !== 'pending'/u)
  assert.match(directorySource, /void toggle\(kind, item\)/u)
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
  assert.match(indexCss, /@import '\.\/admin-console\.css'/u)
  assert.match(cssSource, /\.admin-dock/u)
  assert.match(cssSource, /@media \(max-width: 767px\)/u)
  assert.match(cssSource, /grid-template-columns: repeat\(6, minmax\(0, 1fr\)\)/u)
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
