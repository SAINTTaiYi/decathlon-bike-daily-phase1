import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'

const root = new URL('../apps/web/src/', import.meta.url)
const read = async (path) => readFile(new URL(path, root), 'utf8')

const picker = await read('components/fields/DatePickerField.jsx')
const pickupLedger = await read('components/pickup/PickupLedger.jsx')
const recordLedger = await read('components/lookbook/RecordLedger.jsx')
const memberSheet = await read('components/dialogs/MemberSelectSheet.jsx')
const todoDialog = await read('components/dialogs/HandoverTodoDialog.jsx')
const workflowApi = await read('api/workflow.js')
const workflowHook = await read('hooks/useRemoteClosingWorkflow.js')
const app = await read('App.jsx')
const repairEditor = await read('components/dialogs/RecordEditorDialog.jsx')
const historyDialog = await read('components/dialogs/PermanentHistoryDialog.jsx')
const adminAudit = await read('components/admin/AdminAuditSection.jsx')
const dateCss = await read('styles/date-picker.css')

test('brand date picker replaces native date inputs everywhere', () => {
  assert.match(picker, /buildGrid|date-picker-grid/u)
  assert.match(picker, /showModal/u)
  assert.match(picker, /createPortal\(<dialog/u)
  assert.doesNotMatch(repairEditor, /type="date"/u)
  assert.doesNotMatch(historyDialog, /type="date"/u)
  assert.doesNotMatch(adminAudit, /type="date"/u)
  assert.match(repairEditor, /<DatePickerField required value=\{draft\.pickupDate/u)
  assert.match(historyDialog, /<DatePickerField value=\{date\} onChange=\{setDate\} placeholder="全部日期" clearable/u)
  assert.match(adminAudit, /<DatePickerField value=\{filters\.date\} max=/u)
  assert.match(dateCss, /date-picker-day\[data-selected='true'\]/u)
  assert.match(dateCss, /max-width: 640px/u)
})

test('cards expose a handover person control fed by store members', () => {
  assert.match(pickupLedger, /pickup-card-assignee/u)
  assert.match(pickupLedger, /pickup-assignee-control/u)
  assert.match(pickupLedger, /MemberSelectSheet open=\{Boolean\(assignRecord\)\}/u)
  assert.match(pickupLedger, /onAssignClick=\{\(target\) => setAssignRecord\(target\)\}/u)
  assert.match(recordLedger, /record-assignee-chip/u)
  assert.match(recordLedger, /MemberSelectSheet open=\{Boolean\(assignRecord\)\}/u)
  assert.match(memberSheet, /ROLE_LABELS = \{ operator: '店员', manager: '主管', admin: '店长' \}/u)
  assert.match(memberSheet, /清除交接人/u)
})

test('client and workflow support assignment plus the login todo dialog', () => {
  assert.match(workflowApi, /assignWorkItem = \(record, assignedTo\) => api\(`\/api\/v1\/work-items\/\$\{record\.id\}\/assign`/u)
  assert.match(workflowHook, /assignedToMe: \[\]/u)
  assert.match(workflowHook, /const assignRecord = useCallback/u)
  assert.match(workflowHook, /members: state\.members \|\| \[\]/u)
  assert.match(app, /handover-todo-dismissed-\$\{workflow\.dateKey\}/u)
  assert.match(app, /HandoverTodoDialog open=\{handoverTodoOpen\}/u)
  assert.match(app, /onAssign: async \(id, assignedTo\)/u)
  assert.match(todoDialog, /交接待办/u)
  assert.match(todoDialog, /稍后再说/u)
})
