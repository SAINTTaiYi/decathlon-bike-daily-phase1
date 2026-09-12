// 应急交接单（2026-09-13 用户定案）。
//
// 场景：D1 每日额度被烧穿 / 数据库暂时不可写（或读也被限）时，门店仍要能把
// 「车交给谁、还剩什么、经手人是谁」交接清楚。三件事：
//   ① 生成一张图片（可保存 / 长按存相册）+ 一段可编辑文字（可复制到微信）；
//   ② 文字保存在本机（编辑后不丢），第二天额度恢复后在系统「应急交接」里导入；
//   ③ 导入 = 把（编辑后的）文字录入「其它交接」台账；长文按行拆成多条（单条 ≤ 500 字，
//      契约上限），一条也不丢。
//
// 本模块不依赖网络：生成 / 编辑 / 保存全部在本机完成。

export const EMERGENCY_DRAFT_PREFIX = 'bike-ops:emergency-handover-draft'

export function emergencyDraftKey(storeId) {
  return `${EMERGENCY_DRAFT_PREFIX}:${storeId || 'default'}`
}

function pad2(value) {
  return String(value).padStart(2, '0')
}

/** 2026-09-13 00:30 样式的时间戳。 */
export function formatEmergencyStamp(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())} ${pad2(date.getHours())}:${pad2(date.getMinutes())}`
}

function recordLine(record, index) {
  const parts = [record?.title || '未命名']
  if (record?.contactValue) parts.push(record.contactValue)
  if (record?.status) parts.push(record.status)
  if (record?.assigneeName) parts.push(`@${record.assigneeName}`)
  return `${index}. ${parts.join(' ｜ ')}`
}

/** 生成默认的应急交接文字（之后由门店自由编辑）。 */
export function buildEmergencyHandoverText({ storeName = '门店', generatedAt = new Date(), groups = {} } = {}) {
  const sections = [
    ['待取车辆', groups.pickup || []],
    ['维修交接', groups.repair || []],
    ['其它交接', groups.poster || []]
  ]
  const lines = [
    '【应急交接单 · 未入账】',
    `门店：${storeName}`,
    `生成：${formatEmergencyStamp(generatedAt)}`,
    '说明：数据库暂时无法写入，本单仅作应急凭证。文字可直接编辑；恢复后在系统「应急交接」中导入。',
    ''
  ]
  let index = 0
  for (const [label, records] of sections) {
    lines.push(`— ${label}（${records.length}）—`)
    if (!records.length) {
      lines.push('（无）')
    } else {
      for (const record of records) {
        index += 1
        lines.push(recordLine(record, index))
      }
    }
    lines.push('')
  }
  lines.push('补充（直接在本行下方编辑：经手人 / 实际交付情况 / 其他说明）：')
  lines.push('- ')
  return lines.join('\n')
}

/** 解析概览（导入前的预览统计）。 */
export function parseEmergencyHandoverText(text) {
  const value = typeof text === 'string' ? text : ''
  const lines = value.split('\n')
  const contentLines = lines.filter((line) => line.trim() && !/^[-—\s]*$/u.test(line))
  return { chars: value.replace(/\s+/gu, '').length, lines: lines.length, contentLines: contentLines.length }
}

/**
 * 生成导入载荷：按行拆分，单条 ≤ maxLength（契约 schema 上限 500），保留行边界。
 * 返回 [{ title, detail }]；多条时标题带（1/2）序号。
 */
export function buildEmergencyImportRecords(text, { storeName = '', date = new Date(), maxLength = 500 } = {}) {
  const raw = (typeof text === 'string' ? text : '').trim()
  if (!raw) return []
  const normalized = raw.split('\n').map((line) => (line.length > maxLength ? line.slice(0, maxLength) : line))
  const chunks = []
  let current = ''
  for (const line of normalized) {
    if (current && current.length + 1 + line.length > maxLength) {
      chunks.push(current)
      current = ''
    }
    current = current ? `${current}\n${line}` : line
    if (current.length >= maxLength) {
      chunks.push(current)
      current = ''
    }
  }
  if (current) chunks.push(current)
  if (!chunks.length) return []
  const label = `${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`
  const storePart = storeName ? `${String(storeName).slice(0, 40)} · ` : ''
  const prefix = `应急交接补录 · ${storePart}${label}`
  return chunks.map((detail, index) => ({
    title: chunks.length > 1 ? `${prefix}（${index + 1}/${chunks.length}）` : prefix,
    detail
  }))
}

// ── 本机草稿（编辑后不丢；键按门店隔离）─────────────────────────────
export function loadEmergencyHandoverDraft(storeId) {
  if (typeof window === 'undefined' || !window.localStorage) return null
  try {
    const raw = window.localStorage.getItem(emergencyDraftKey(storeId))
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed.text !== 'string' || !parsed.text.trim()) return null
    return { text: parsed.text, savedAt: typeof parsed.savedAt === 'string' ? parsed.savedAt : '' }
  } catch {
    return null
  }
}

export function saveEmergencyHandoverDraft(storeId, text, now = new Date()) {
  if (typeof window === 'undefined' || !window.localStorage) return null
  try {
    const savedAt = now.toISOString()
    window.localStorage.setItem(emergencyDraftKey(storeId), JSON.stringify({ text: String(text ?? ''), savedAt }))
    return { savedAt }
  } catch {
    return null
  }
}

export function clearEmergencyHandoverDraft(storeId) {
  if (typeof window === 'undefined' || !window.localStorage) return
  try {
    window.localStorage.removeItem(emergencyDraftKey(storeId))
  } catch {
    // 清不掉就算了：草稿留着不伤数据
  }
}

// ── 图片渲染（纯 canvas，不依赖网络）────────────────────────────────
const WIDTH = 1000
const PAD = 56
const INK = '#14161a'
const INK_SOFT = '#3a3d44'
const PAPER = '#fffdf7'
const LINE = '#e6e2d6'
const MUTED = '#8a8779'
const ACCENT = '#ffde59'
const FONT_BODY = '"Noto Sans SC Variable", "Noto Sans SC", sans-serif'
const FONT_DISPLAY = '"Barlow Condensed Ops", "Barlow Condensed", "Noto Sans SC Variable", sans-serif'

function wrapText(ctx, text, maxWidth) {
  const lines = []
  let current = ''
  for (const char of String(text)) {
    const next = current + char
    if (ctx.measureText(next).width > maxWidth && current) {
      lines.push(current)
      current = char
    } else {
      current = next
    }
  }
  if (current) lines.push(current)
  return lines.length ? lines : ['']
}

async function ensureEmergencyFonts() {
  try {
    await Promise.all([
      document.fonts.load('500 26px "Noto Sans SC Variable"', '应急交接待取维修其它门店补充'),
      document.fonts.load('700 64px "Barlow Condensed Ops"', 'EMERGENCY HANDOVER')
    ])
    await document.fonts.ready
  } catch {
    // 字体加载失败仍继续渲染（系统字体兜底），绝不阻塞应急流程
  }
}

/** 渲染应急交接单画布（头部 + 正文 + 页脚；高度随内容增长）。 */
export async function renderEmergencyHandoverCanvas({ text = '', storeName = '门店', generatedAt = new Date(), appVersion = '' } = {}) {
  await ensureEmergencyFonts()
  const measure = document.createElement('canvas').getContext('2d')
  const bodyFont = `500 26px ${FONT_BODY}`
  const lineHeight = 40
  const maxWidth = WIDTH - PAD * 2
  measure.font = bodyFont
  const bodyLines = []
  for (const raw of String(text).split('\n')) {
    if (!raw.trim()) { bodyLines.push(''); continue }
    for (const wrapped of wrapText(measure, raw, maxWidth)) bodyLines.push(wrapped)
  }
  const headerHeight = 172
  const footerHeight = 120
  const bodyHeight = Math.max(bodyLines.length, 1) * lineHeight
  const height = headerHeight + PAD + bodyHeight + PAD + footerHeight

  const canvas = document.createElement('canvas')
  const ratio = Math.min(2, typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1)
  canvas.width = WIDTH * ratio
  canvas.height = height * ratio
  const ctx = canvas.getContext('2d')
  ctx.scale(ratio, ratio)

  // 纸底
  ctx.fillStyle = PAPER
  ctx.fillRect(0, 0, WIDTH, height)
  // 头部黑底
  ctx.fillStyle = INK
  ctx.fillRect(0, 0, WIDTH, headerHeight)
  // 品牌黄竖条
  ctx.fillStyle = ACCENT
  ctx.fillRect(PAD, 40, 8, 92)
  ctx.fillStyle = '#ffffff'
  ctx.font = `700 64px ${FONT_DISPLAY}`
  ctx.textBaseline = 'alphabetic'
  ctx.fillText('EMERGENCY HANDOVER', PAD + 28, 96)
  ctx.font = `500 26px ${FONT_BODY}`
  ctx.fillStyle = 'rgba(255,255,255,0.82)'
  ctx.fillText(`应急交接 · ${String(storeName).slice(0, 30)}`, PAD + 28, 132)
  ctx.textAlign = 'right'
  ctx.fillText(formatEmergencyStamp(generatedAt), WIDTH - PAD, 96)
  ctx.fillStyle = ACCENT
  ctx.fillText('未入账凭证', WIDTH - PAD, 132)
  ctx.textAlign = 'left'

  // 正文
  ctx.fillStyle = INK_SOFT
  ctx.font = bodyFont
  let y = headerHeight + PAD + 26
  for (const line of bodyLines) {
    if (line) ctx.fillText(line, PAD, y)
    y += lineHeight
  }

  // 页脚
  const footerY = headerHeight + PAD + bodyHeight + 24
  ctx.strokeStyle = LINE
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(PAD, footerY)
  ctx.lineTo(WIDTH - PAD, footerY)
  ctx.stroke()
  ctx.fillStyle = MUTED
  ctx.font = `500 22px ${FONT_BODY}`
  ctx.fillText('本单为应急交接凭证（未入账）。恢复后请在系统「应急交接」中导入本文字版。', PAD, footerY + 46)
  ctx.textAlign = 'right'
  ctx.fillText(appVersion ? `Workshop · ${appVersion}` : 'Workshop', WIDTH - PAD, footerY + 46)
  ctx.textAlign = 'left'

  return canvas
}

/** 生成图片并返回对象 URL（调用方负责在关闭时 revoke）。 */
export async function exportEmergencyHandoverImage(model) {
  const canvas = await renderEmergencyHandoverCanvas(model)
  const blob = await new Promise((resolve, reject) => {
    canvas.toBlob((value) => (value ? resolve(value) : reject(new Error('无法生成图片。'))), 'image/png')
  })
  const stamp = formatEmergencyStamp(model?.generatedAt || new Date()).slice(0, 10)
  return {
    objectUrl: URL.createObjectURL(blob),
    filename: `应急交接-${stamp || 'sheet'}.png`,
    revoke: () => URL.revokeObjectURL(objectUrl)
  }
}
