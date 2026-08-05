import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const appSource = await readFile(new URL('../apps/web/src/App.jsx', import.meta.url), 'utf8')
const consoleSource = await readFile(new URL('../apps/web/src/components/admin/PlatformAdminConsole.jsx', import.meta.url), 'utf8')
const overviewSource = await readFile(new URL('../apps/web/src/components/admin/AdminOverviewSection.jsx', import.meta.url), 'utf8')
const approvalsSource = await readFile(new URL('../apps/web/src/components/admin/AdminApprovalsSection.jsx', import.meta.url), 'utf8')
const directorySource = await readFile(new URL('../apps/web/src/components/admin/AdminDirectorySection.jsx', import.meta.url), 'utf8')
const usersSource = await readFile(new URL('../apps/web/src/components/admin/AdminUsersSection.jsx', import.meta.url), 'utf8')
const auditSource = await readFile(new URL('../apps/web/src/components/admin/AdminAuditSection.jsx', import.meta.url), 'utf8')
const apiSource = await readFile(new URL('../apps/web/src/api/admin.js', import.meta.url), 'utf8')
const menuSource = await readFile(new URL('../apps/web/src/components/dialogs/MenuDialog.jsx', import.meta.url), 'utf8')
const cssSource = await readFile(new URL('../apps/web/src/styles/admin-console.css', import.meta.url), 'utf8')
const indexCss = await readFile(new URL('../apps/web/src/styles/index.css', import.meta.url), 'utf8')

test('平台管理后台仅在平台管理员且 hash 为 #admin 时渲染', () => {
  assert.match(appSource, /import PlatformAdminConsole from '\.\/components\/admin\/PlatformAdminConsole\.jsx'/u)
  assert.match(appSource, /adminMode && auth\.user\?\.isPlatformAdmin/u)
  assert.match(appSource, /#admin\(\?:\[\/=\]\|\$\)\/u\.test\(window\.location\.hash\)/u)
  assert.match(appSource, /<PlatformAdminConsole/u)
  assert.match(appSource, /onExit=\{exitAdminMode\}/u)
})

test('菜单只对平台管理员显示平台管理后台入口', () => {
  assert.match(menuSource, /canAdmin, onAdmin/u)
  assert.match(menuSource, /canAdmin \? <button/u)
  assert.match(menuSource, /平台管理后台/u)
  assert.match(appSource, /canAdmin=\{auth\.user\?\.isPlatformAdmin\}/u)
  assert.match(appSource, /window\.location\.hash = '#admin'/u)
})

test('管理台外壳包含五个分区并与 hash 同步', () => {
  for (const id of ['overview', 'approvals', 'directory', 'users', 'audit']) {
    assert.match(consoleSource, new RegExp(`id: '${id}'`, 'u'))
  }
  assert.match(consoleSource, /sectionFromHash/u)
  assert.match(consoleSource, /hashchange/u)
  assert.match(consoleSource, /\\\/\(\[a-z\]\+\)/u)
  assert.match(consoleSource, /getAdminOverview\(\)/u)
  assert.match(consoleSource, /getGovernanceOverview\(\)/u)
})

test('审批分区提供角色提权与调店两个页签并复用既有决策 API', () => {
  assert.match(approvalsSource, /role: '角色提权'|id: 'role'/u)
  assert.match(approvalsSource, /id: 'transfer'/u)
  assert.match(approvalsSource, /shared\.decideRole\(item, (true|false)\)/u)
  assert.match(approvalsSource, /shared\.decideTransfer\(item, (true|false)\)/u)
  assert.match(approvalsSource, /admin-approval-row/u)
  assert.match(consoleSource, /decideRoleChangeRequest/u)
  assert.match(consoleSource, /decideTransferRequest/u)
})

test('目录分区支持新增、重命名与启停，均走既有目录 API', () => {
  assert.match(directorySource, /createDirectory\(form\.kind/u)
  assert.match(directorySource, /updateDirectory\(kind, item\.id/u)
  assert.match(directorySource, /kind: 'regions', parentId: '', name: '', code: ''/u)
  assert.match(directorySource, /admin-directory-tree/u)
  assert.match(consoleSource, /createDirectoryEntry/u)
  assert.match(consoleSource, /updateDirectoryEntry/u)
})

test('用户分区提供搜索与成员表格，不展示密码类字段', () => {
  assert.match(usersSource, /type="search"/u)
  assert.match(usersSource, /getUsers\(q\)/u)
  assert.match(usersSource, /admin-table/u)
  assert.match(usersSource, /isPlatformAdmin/u)
  assert.doesNotMatch(usersSource + consoleSource + overviewSource + approvalsSource, /password|password_hash|token/u)
})

test('审计分区提供日期与模块筛选和游标加载更多', () => {
  assert.match(auditSource, /type="date"/u)
  assert.match(auditSource, /ProjectSelect/u)
  assert.match(auditSource, /nextCursor/u)
  assert.match(auditSource, /加载更多/u)
  assert.match(apiSource, /api\/v1\/admin\/audit-events/u)
})

test('管理台 API 客户端指向只读平台端点', () => {
  assert.match(apiSource, /api\/v1\/admin\/overview/u)
  assert.match(apiSource, /api\/v1\/admin\/users/u)
  assert.match(apiSource, /encodeURIComponent\(q\)/u)
})

test('管理台样式已注册且遵守设计系统约束', () => {
  assert.match(indexCss, /@import '\.\/admin-console\.css'/u)
  assert.match(cssSource, /--ops-page/u)
  assert.match(cssSource, /--ops-card/u)
  assert.match(cssSource, /--ops-yellow/u)
  assert.match(cssSource, /--ops-black/u)
  assert.match(cssSource, /prefers-reduced-motion/u)
  assert.match(cssSource, /forced-colors/u)
  assert.doesNotMatch(cssSource, /linear-gradient|backdrop-filter/u)
  assert.match(cssSource, /min-height: 44px/u)
})
