import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const appSource = await readFile(new URL('../apps/web/src/App.jsx', import.meta.url), 'utf8')
const consoleSource = await readFile(new URL('../apps/web/src/components/admin/PlatformAdminConsole.jsx', import.meta.url), 'utf8')
const overviewSource = await readFile(new URL('../apps/web/src/components/admin/AdminOverviewSection.jsx', import.meta.url), 'utf8')
const storesSource = await readFile(new URL('../apps/web/src/components/admin/AdminStoresSection.jsx', import.meta.url), 'utf8')
const approvalsSource = await readFile(new URL('../apps/web/src/components/admin/AdminApprovalsSection.jsx', import.meta.url), 'utf8')
const directorySource = await readFile(new URL('../apps/web/src/components/admin/AdminDirectorySection.jsx', import.meta.url), 'utf8')
const usersSource = await readFile(new URL('../apps/web/src/components/admin/AdminUsersSection.jsx', import.meta.url), 'utf8')
const auditSource = await readFile(new URL('../apps/web/src/components/admin/AdminAuditSection.jsx', import.meta.url), 'utf8')
const apiSource = await readFile(new URL('../apps/web/src/api/admin.js', import.meta.url), 'utf8')
const menuSource = await readFile(new URL('../apps/web/src/components/dialogs/MenuDialog.jsx', import.meta.url), 'utf8')
const headerSource = await readFile(new URL('../apps/web/src/components/workshop/WorkshopShellHeader.jsx', import.meta.url), 'utf8')
const cssSource = await readFile(new URL('../apps/web/src/styles/admin-console.css', import.meta.url), 'utf8')
const indexCss = await readFile(new URL('../apps/web/src/styles/index.css', import.meta.url), 'utf8')

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
  assert.match(consoleSource, /reviewStore: \(id, body\) => adminReviewStore\(id, body\)/u)
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
  assert.match(storesSource, /shared\.getStore\(selectedStoreId\)/u)
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
  assert.match(approvalsSource, /reviewStore\(store\.id/u)
  assert.match(approvalsSource, /DecisionDialog/u)
  assert.match(approvalsSource, /required=\{approve === false\}/u)
  assert.match(approvalsSource, /拒绝必填/u)
  assert.match(approvalsSource, /shared\.decideRole\(item, approve, reason\)/u)
})

test('目录分区：门店创建提示待审核、待审核徽标与查看跳转', () => {
  assert.match(directorySource, /门店创建后为「待审核」/u)
  assert.match(directorySource, /statusLabels = \{ active: '生效', pending: '待审核', disabled: '停用' \}/u)
  assert.match(directorySource, /onViewStore\(store\.id\)/u)
  assert.match(directorySource, /store\.status !== 'pending' \? <button type="button" onClick=\{\(\) => void toggle\('stores', store\)\}/u)
})

test('用户分区支持创建账号、禁用/恢复（确认弹窗）与一次性临时密码', () => {
  assert.match(usersSource, /创建账号/u)
  assert.match(usersSource, /CreateUserDialog/u)
  assert.match(usersSource, /roleOptions/u)
  assert.match(usersSource, /toggleUserStatus\(user\.id/u)
  assert.match(usersSource, /确认禁用/u)
  assert.match(usersSource, /resetPassword\(user\.id\)/u)
  assert.match(usersSource, /admin-temp-password/u)
  assert.match(usersSource, /强制修改密码/u)
  assert.match(usersSource, /密码至少需要 10 个字符/u)
  assert.match(usersSource, /受保护/u)
})

test('审计分区支持门店/操作人/动作类型筛选', () => {
  assert.match(auditSource, /placeholder="操作人"/u)
  assert.match(auditSource, /placeholder="动作类型/u)
  assert.match(auditSource, /storeId: storeId \|\| undefined/u)
  assert.match(auditSource, /actor: actor\.trim\(\) \|\| undefined/u)
  assert.match(auditSource, /action: action\.trim\(\) \|\| undefined/u)
  assert.match(consoleSource, /auditStoreOptions/u)
})

test('管理台 API 客户端覆盖只读与写操作端点', () => {
  assert.match(apiSource, /api\/v1\/admin\/overview/u)
  assert.match(apiSource, /api\/v1\/admin\/users/u)
  assert.match(apiSource, /api\/v1\/admin\/audit-events/u)
  assert.match(apiSource, /api\/v1\/admin\/stores\/\$\{encodeURIComponent\(storeId\)\}/u)
  assert.match(apiSource, /api\/v1\/admin\/approvals/u)
  assert.match(apiSource, /api\/v1\/admin\/pending-count/u)
  assert.match(apiSource, /method: 'POST', body \}/u)
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
