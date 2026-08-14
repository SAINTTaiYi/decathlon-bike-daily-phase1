import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'

const root = new URL('../apps/web/src/', import.meta.url)
const read = async (path) => readFile(new URL(path, root), 'utf8')

const picker = await read('components/fields/DatePickerField.jsx')
const pickupLedger = await read('components/pickup/PickupLedger.jsx')
const dateCss = await read('styles/date-picker.css')
const pickupCss = await read('styles/pickup-ledger.css')

test('日期面板不使用嵌套 dialog/showModal，关闭只由点背景/Escape/选中日期触发（防移动端闪现关闭）', () => {
  assert.doesNotMatch(picker, /\.showModal\(/u)
  assert.doesNotMatch(picker, /window\.addEventListener\('scroll'/u)
  assert.match(picker, /date-picker-backdrop/u)
  assert.match(picker, /event\.key === 'Escape'/u)
  assert.match(picker, /closest\('dialog'\)/u)
  assert.match(picker, /select\(cell\.key\)/u)
})

test('展开高度由 CSS grid-template-rows 0fr/1fr 驱动，不再用 JS 测量 px 高度', () => {
  assert.doesNotMatch(pickupLedger, /scrollHeight/u)
  assert.doesNotMatch(pickupLedger, /transitionend/u)
  assert.match(pickupLedger, /pickup-card-reveal-inner/u)
  assert.match(pickupCss, /grid-template-rows: 0fr/u)
  assert.match(pickupCss, /grid-template-rows: 1fr/u)
  assert.match(pickupCss, /\.pickup-card-reveal-inner \{[\s\S]*?min-height: 0;/u)
  assert.match(pickupCss, /\.pickup-card-reveal-inner \{[\s\S]*?overflow: hidden;/u)
})

test('日期单元格用最小高度与无单位行高，系统字体放大时数字不溢出重叠', () => {
  assert.match(dateCss, /\.date-picker-day \{\s*min-height: 36px;/u)
  assert.doesNotMatch(dateCss, /\.date-picker-day \{\s*height: 36px;/u)
  assert.match(dateCss, /line-height: 1\.25;/u)
  assert.match(dateCss, /\.date-picker-day \{ min-height: 42px; \}/u)
})

test('移动端操作区同样用 flex + margin-left:auto，主按钮在所有断点都吸附到最右侧', () => {
  assert.match(pickupCss, /\.pickup-card-actions \{ display: flex; flex-wrap: nowrap;/u)
  assert.match(pickupCss, /\.pickup-card-actions .pickup-primary-action \{ margin-left: auto;/u)
  assert.match(pickupCss, /\.pickup-card-actions button \{[^}]*flex: 0 0 auto;[^}]*width: auto;/u)
})
