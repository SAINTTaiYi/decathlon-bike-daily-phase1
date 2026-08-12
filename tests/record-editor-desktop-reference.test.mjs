import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'

const editor = await readFile(new URL('../apps/web/src/components/dialogs/RecordEditorDialog.jsx', import.meta.url), 'utf8')
const select = await readFile(new URL('../apps/web/src/components/ProjectSelect.jsx', import.meta.url), 'utf8')
const css = await readFile(new URL('../apps/web/src/styles/desktop-workbench.css', import.meta.url), 'utf8')

test('desktop record editors reproduce the separate pickup and repair reference canvases', () => {
  assert.match(editor, /record-editor-dialog record-editor-dialog-\$\{config\.formKind\}/u)
  assert.match(css, /dialog\.record-editor-dialog-pickup \{ width: 1220px; \}/u)
  assert.match(css, /dialog\.record-editor-dialog-repair \{ width: 1196px; translate: 49px 8px; \}/u)
  assert.match(css, /height: 812px/u)
  assert.match(css, /\.pickup-editor-layout \{[\s\S]*grid-template-columns: 340px 424px 330px/u)
  assert.match(css, /\.repair-editor-layout \{[\s\S]*grid-template-columns: 354px 354px 370px/u)
  assert.match(css, /\.record-editor-footer \{[\s\S]*position: absolute;[\s\S]*bottom: 0/u)
})

test('pickup editor retains all reference sections and copy', () => {
  assert.match(editor, /LEDGER · 车辆台账/u)
  assert.match(editor, /编辑\$\{config\.singular\}/u)
  assert.match(editor, /record-editor-pickup-source/u)
  assert.match(editor, /record-editor-pickup-contact/u)
  assert.match(editor, /record-editor-guidance-pickup/u)
  assert.match(editor, /待取来源/u)
  assert.match(editor, /自提平台/u)
  assert.match(editor, /车辆或顾客标识/u)
  assert.match(editor, /取车时输入取货码/u)
  assert.match(editor, /填写提示/u)
  assert.match(editor, /取货码将在取车时输入，保障信息安全/u)
  assert.match(editor, /保存修改/u)
})

test('repair editor retains the reference cards, labels and intervention guidance', () => {
  assert.match(editor, /record-editor-repair-profile/u)
  assert.match(editor, /record-editor-repair-work/u)
  assert.match(editor, /record-editor-guidance-repair/u)
  assert.match(editor, /车辆或顾客标识/u)
  assert.match(editor, /维修项目/u)
  assert.match(editor, /预约时间/u)
  assert.match(editor, /完成后可人工干预/u)
  assert.match(editor, /提交后将不可自由更改/u)
  assert.match(css, /维修完成 · 已开付款单/u)
  assert.match(select, /data-value=\{value \|\| undefined\}/u)
  assert.match(select, /data-value=\{option\.value\}/u)
})

test('desktop-only replica does not replace existing mobile labels or help copy', () => {
  assert.match(css, /\.record-editor-copy-desktop,[\s\S]*\.record-editor-desktop-only \{ display: none; \}/u)
  assert.match(css, /@media \(min-width: 768px\)[\s\S]*\.record-editor-copy-mobile,[\s\S]*display: none !important/u)
  assert.match(editor, /record-editor-copy-mobile">LEDGER · 长期台账/u)
  assert.match(editor, /record-editor-copy-mobile">车辆型号/u)
  assert.match(editor, /record-editor-copy-mobile">取车时间/u)
  assert.match(editor, /可自由输入；填写 0 也会作为有效联系方式保存/u)
  assert.match(editor, /取货码在点击“确认取车”后输入，不保存在台账、票据或操作记录中/u)
})

test('business fields still submit the original draft keys', () => {
  for (const field of ['pickupSource', 'selfPickupPlatform', 'contactType', 'contactValue', 'repairType', 'repairProject', 'pickupDate', 'status']) {
    assert.match(editor, new RegExp(`draft\\.${field}`, 'u'))
  }
  assert.match(editor, /const result = await onSave\(draft\)/u)
})
