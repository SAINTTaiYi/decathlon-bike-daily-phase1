import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'

const root = new URL('../apps/web/src/', import.meta.url)
const read = async (path) => readFile(new URL(path, root), 'utf8')

const picker = await read('components/fields/DatePickerField.jsx')
const dateCss = await read('styles/date-picker.css')
const pickupCss = await read('styles/pickup-ledger.css')

test('移动端日期面板打开后不因任何滚动事件被立即关闭（防界面闪退）', () => {
  // 移动端（≤640px 底部分层）完全不注册滚动关闭监听。
  assert.match(picker, /if \(window\.matchMedia\('\(max-width: 640px\)'\)\.matches\) return undefined/u)
  // 桌面锚定浮层仍可滚动关闭，但必须忽略面板内部滚动。
  assert.match(picker, /dialogRef\.current\?\.contains\(event\.target\)/u)
  assert.match(picker, /window\.addEventListener\('scroll', onScroll, true\)/u)
})

test('日期单元格用最小高度而不是固定高度，系统字体放大时数字不溢出重叠', () => {
  assert.match(dateCss, /\.date-picker-day \{\s*min-height: 36px;/u)
  assert.doesNotMatch(dateCss, /\.date-picker-day \{\s*height: 36px;/u)
  assert.match(dateCss, /line-height: 1\.25;/u)
  assert.match(dateCss, /\.date-picker-day \{ min-height: 42px; \}/u)
})

test('维修卡状态标签与交接人 chip 使用随字体缩放的无单位行高，不再互相重叠', () => {
  assert.match(pickupCss, /line-height: 1\.45; text-align: center; overflow-wrap: anywhere;/u)
  assert.match(pickupCss, /\.pickup-card-assignee \{[\s\S]*?max-width: 140px;/u)
  assert.match(pickupCss, /\.pickup-card-assignee \{[\s\S]*?overflow: hidden;/u)
  assert.match(pickupCss, /line-height: 1\.5;\s*white-space: nowrap;/u)
  assert.doesNotMatch(pickupCss, /line-height: 12px;\s*text-align: center/u)
})
