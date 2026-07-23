import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8')

test('native Dialog task layer carries stable IDs, module scope and flat signal registration', async () => {
  const [dialog, css, index] = await Promise.all([
    read('../apps/web/src/components/dialogs/AppDialog.jsx'),
    read('../apps/web/src/styles/signal-grid-operations.css'),
    read('../apps/web/src/styles/index.css')
  ])
  assert.match(dialog, /useId\(\)/u)
  assert.match(dialog, /data-signal-module=\{signalModule\}/u)
  assert.match(dialog, /className="dialog-registration"/u)
  assert.match(dialog, /data-dialog-panel/u)
  assert.match(css, /\.app-dialog\[data-signal-module\] \.dialog-panel::before/u)
  assert.match(css, /background: var\(--sg-module-signal\)/u)
  assert.match(css, /background: var\(--sg-c-dialog-scrim\)/u)
  assert.match(index, /signal-grid-operations\.css/u)
  const radii = [...css.matchAll(/border-radius:\s*([^;]+);/gu)].map((match) => match[1].replace(/\s*!important$/u, '').trim())
  const shadows = [...css.matchAll(/box-shadow:\s*([^;]+);/gu)].map((match) => match[1].trim())
  assert.ok(radii.length > 0)
  assert.ok(radii.every((value) => value === 'var(--sg-corner)' || value === '0'))
  assert.ok(shadows.every((value) => value === 'none'))
  assert.doesNotMatch(css, /linear-gradient|radial-gradient|#[0-9a-f]{3,8}|rgb\(/iu)
})

test('forms, selectors and task actions share the existing Signal Grid component contract', async () => {
  const [css, config, editor, kpi, pickup, closing] = await Promise.all([
    read('../apps/web/src/styles/signal-grid-operations.css'),
    read('../apps/web/src/data/operationsData.js'),
    read('../apps/web/src/components/dialogs/RecordEditorDialog.jsx'),
    read('../apps/web/src/components/dialogs/KpiDialog.jsx'),
    read('../apps/web/src/components/dialogs/PickupConfirmDialog.jsx'),
    read('../apps/web/src/components/dialogs/ConfirmClosingDialog.jsx')
  ])
  for (const module of ['pickup', 'other', 'repair', 'resale']) assert.match(config, new RegExp(`signalModule: '${module}'`, 'u'))
  assert.match(editor, /signalModule=\{config\.signalModule \|\| 'other'\}/u)
  assert.match(kpi, /signalModule="sales"/u)
  assert.match(pickup, /signalModule="pickup"/u)
  assert.match(closing, /signalModule="closing"/u)
  assert.match(css, /\.project-select-trigger[\s\S]*?border: var\(--sg-border-width\) solid var\(--sg-c-field-border\)/u)
  assert.match(css, /\.primary-action[\s\S]*?background: var\(--sg-module-color\) !important/u)
  assert.match(css, /\.form-error[\s\S]*?var\(--sg-color-danger\)/u)
})

test('loading, error, success and empty states use one accessible SignalTaskState grammar', async () => {
  const [state, app, boundary, ledger, css] = await Promise.all([
    read('../apps/web/src/components/SignalTaskState.jsx'),
    read('../apps/web/src/App.jsx'),
    read('../apps/web/src/components/AppErrorBoundary.jsx'),
    read('../apps/web/src/components/lookbook/RecordLedger.jsx'),
    read('../apps/web/src/styles/signal-grid-operations.css')
  ])
  for (const tone of ['empty', 'loading', 'error', 'success']) assert.match(state, new RegExp(`\\b${tone}: \\{`, 'u'))
  assert.match(state, /aria-live=\{tone === 'error' \? 'assertive' : 'polite'\}/u)
  assert.match(app, /code="AUTH \/ VERIFY"/u)
  assert.match(app, /code="DATABASE \/ SYNC"/u)
  assert.match(app, /code="DATABASE \/ UNAVAILABLE"/u)
  assert.match(boundary, /code="UI \/ FAILURE"/u)
  assert.match(ledger, /<SignalTaskState compact title="当前没有记录"/u)
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)[\s\S]*?animation: none/u)
})

test('permanent history, account and attachment management adopt explicit task states', async () => {
  const [history, account, attachment, migration, log, operation] = await Promise.all([
    read('../apps/web/src/components/dialogs/PermanentHistoryDialog.jsx'),
    read('../apps/web/src/components/dialogs/CreateUserDialog.jsx'),
    read('../apps/web/src/components/dialogs/AttachmentDialog.jsx'),
    read('../apps/web/src/components/dialogs/LocalMigrationDialog.jsx'),
    read('../apps/web/src/components/dialogs/LogDialog.jsx'),
    read('../apps/web/src/components/dialogs/OperationHistoryDialog.jsx')
  ])
  assert.match(history, /<ProjectSelect value=\{module\}/u)
  assert.match(history, /QUERY ACTIVE/u)
  assert.match(history, /tone="loading" title="正在查询永久历史"/u)
  assert.match(history, /title="没有匹配的操作记录"/u)
  assert.match(account, /tone="success" title="账号已创建"/u)
  assert.match(account, /data-selected=\{form\.role === option\.value/u)
  assert.doesNotMatch(attachment, /window\.confirm/u)
  assert.match(attachment, /attachment-delete-confirm/u)
  assert.match(attachment, /tone="loading" title="正在读取业务图片"/u)
  assert.match(migration, /tone="loading" title="正在检查本机数据"/u)
  assert.match(log, /title="还没有当日操作"/u)
  assert.match(operation, /signalModule = 'other'/u)
})

test('Phase 4 remains visual and preserves workflow, permission and data contracts', async () => {
  const app = await read('../apps/web/src/App.jsx')
  for (const operation of [
    'workflow.completePickup',
    'workflow.completeRepair',
    'workflow.completeResaleListing',
    'workflow.sellResale',
    'workflow.completeHandover',
    'workflow.completeClosing',
    'workflow.getPermanentHistory',
    'workflow.undoHistoryEvent'
  ]) assert.match(app, new RegExp(operation.replace('.', '\\.'), 'u'))
  assert.match(app, /role === 'admin'/u)
  assert.match(app, /role === 'manager' \|\| role === 'admin'/u)
})
