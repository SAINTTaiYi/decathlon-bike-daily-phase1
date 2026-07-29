import { formatTicketNumber, splitMaintenanceItems } from '../data/recordPresentation.js'
import { decodePickupContact, inferPickupSource, inferSelfPickupPlatform, pickupContactLabel } from '../data/pickupRecord.js'

const WIDTH = 1242
const PAD = 64
const INK = '#0b0b0d'
const INK_SOFT = '#3a3a3c'
const PAPER = '#f7f6f2'
const PAPER_SOFT = '#f0efeb'
const LINE = '#e4e2db'
const MUTED = '#8a8984'
const MUTED_SOFT = '#a8a69f'
const SURFACE = '#ffffff'
const PANEL = '#f0eee8'
const CHIP_BG = '#ffffff'
const CHIP_BORDER = '#1a1a1a'

const FONT_BODY = '"Noto Sans SC Variable"'
const FONT_DISPLAY = '"Barlow Condensed Ops", "Noto Sans SC Variable"'
const FONT_MONO = '"Barlow Condensed Ops", "Noto Sans SC Variable"'

const R = 22
const CARD_GAP = 18
const BOTTOM_SAFE = 120

function pad2(value) {
  return String(value ?? 0).padStart(2, '0')
}

function formatDateSlash(value) {
  const raw = String(value || '').trim()
  if (!raw) return '— / — / —'
  const m = raw.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (m) return `${m[1]} / ${m[2]} / ${m[3]}`
  return raw.replaceAll('-', ' / ')
}

function formatClock(iso) {
  if (!iso) return '--:--'
  try {
    return new Intl.DateTimeFormat('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(iso))
  } catch {
    return '--:--'
  }
}

function isOpenPickup(record) {
  return record?.scene === 'pickup' && !record.pickedUpOn && record.lifecycle !== 'picked-up' && record.lifecycle !== 'sold'
}

function isOpenRepair(record) {
  return record?.scene === 'repair' && !record.completedOn && record.lifecycle === 'active'
}

function isOpenHandover(record) {
  return record?.scene === 'poster' && !record.completedOn && record.lifecycle === 'active'
}

export function selfPickupReportLabel(record) {
  if (inferPickupSource(record) !== 'self-pickup') return ''
  const labels = {
    tmall: '天猫自提',
    jd: '京东自提',
    'mini-program': '小程序自提'
  }
  return labels[inferSelfPickupPlatform(record)] || ''
}

export function usedCarReportLabel(record) {
  return inferPickupSource(record) === 'used-car' ? '二手车' : ''
}

export function buildClosingReportModel({
  businessDate = '',
  storeName = '门店',
  exporterName = '',
  kpi = {},
  records = [],
  closedAt = '',
  appVersion = ''
}) {
  return {
    businessDate,
    storeName,
    exporterName,
    closedAt,
    appVersion,
    kpi: {
      salesVehicles: Number(kpi.salesVehicles ?? 0),
      safetyChecks: Number(kpi.safetyChecks ?? 0),
      safetyModel: String(kpi.safetyModel ?? '').trim(),
      validReviews: Number(kpi.validReviews ?? 0),
      usedSold: Number(kpi.usedSold ?? 0),
      usedReceived: Number(kpi.usedReceived ?? 0)
    },
    // The image may be rendered asynchronously after the close request. Clone the values now so later React refreshes cannot replace this report's KPI snapshot.
    pickups: records.filter(isOpenPickup).map((record) => ({ ...record })),
    repairs: records.filter(isOpenRepair).map((record) => ({ ...record })),
    handovers: records.filter(isOpenHandover).map((record) => ({ ...record }))
  }
}

async function ensureReportFonts(model) {
  const reportText = `闭店日报门店销售车辆安全检查评价二手售出收车待取维修交接${JSON.stringify(model)}`
  const [bodyFaces, bodyDisplayFaces, displayFaces] = await Promise.all([
    document.fonts.load('500 26px "Noto Sans SC Variable"', reportText),
    document.fonts.load('900 48px "Noto Sans SC Variable"', reportText),
    document.fonts.load('700 96px "Barlow Condensed Ops"', 'WORKSHOP OPS 0123456789')
  ])
  await document.fonts.ready.catch(() => undefined)
  if (!bodyFaces.length || !bodyDisplayFaces.length || !displayFaces.length) throw new Error('站点字体加载失败。')
  const probe = document.createElement('canvas').getContext('2d')
  probe.font = `700 48px ${FONT_DISPLAY}`
  if (probe.measureText('闭店日报').width < 12) throw new Error('网站中文字体未就绪。')
}

function wrapText(ctx, text, maxWidth) {
  const value = String(text || '').trim() || '—'
  const lines = []
  let current = ''
  for (const char of [...value]) {
    const next = current + char
    if (ctx.measureText(next).width > maxWidth && current) {
      lines.push(current)
      current = char
    } else current = next
  }
  if (current) lines.push(current)
  return lines
}

function roundRect(ctx, x, y, w, h, r) {
  const radius = Math.min(r, w / 2, h / 2)
  ctx.beginPath()
  ctx.moveTo(x + radius, y)
  ctx.arcTo(x + w, y, x + w, y + h, radius)
  ctx.arcTo(x + w, y + h, x, y + h, radius)
  ctx.arcTo(x, y + h, x, y, radius)
  ctx.arcTo(x, y, x + w, y, radius)
  ctx.closePath()
}

function fillRound(ctx, x, y, w, h, r, fill) {
  roundRect(ctx, x, y, w, h, r)
  ctx.fillStyle = fill
  ctx.fill()
}

function strokeRound(ctx, x, y, w, h, r, stroke, lineWidth = 1.5) {
  roundRect(ctx, x, y, w, h, r)
  ctx.strokeStyle = stroke
  ctx.lineWidth = lineWidth
  ctx.stroke()
}

function drawSoftShadow(ctx, x, y, w, h, r) {
  ctx.save()
  ctx.shadowColor = 'rgba(12, 12, 14, 0.06)'
  ctx.shadowBlur = 24
  ctx.shadowOffsetY = 8
  fillRound(ctx, x, y, w, h, r, SURFACE)
  ctx.restore()
}

function drawBarcode(ctx, x, y) {
  const pattern = [2, 1, 1, 3, 1, 2, 1, 1, 2, 3, 1, 1, 2, 1, 3, 1, 2, 1, 1, 2]
  let cx = x
  ctx.fillStyle = MUTED_SOFT
  for (let i = 0; i < pattern.length; i += 1) {
    const w = pattern[i]
    if (i % 2 === 0) ctx.fillRect(cx, y, w, 18)
    cx += w + 1
  }
}

function drawSparkline(ctx, x, y, w, h) {
  // dotted grid
  ctx.fillStyle = 'rgba(255,255,255,0.12)'
  for (let i = 0; i < 18; i += 1) {
    for (let j = 0; j < 8; j += 1) {
      ctx.beginPath()
      ctx.arc(x + 18 + i * (w / 18), y + 24 + j * (h / 9), 1.1, 0, Math.PI * 2)
      ctx.fill()
    }
  }
  // rising curve
  const pts = []
  const n = 28
  for (let i = 0; i < n; i += 1) {
    const t = i / (n - 1)
    const px = x + 20 + t * (w - 48)
    const wave = Math.sin(t * Math.PI * 1.15) * 0.18
    const py = y + h - 36 - (t * t * 0.72 + wave) * (h - 70)
    pts.push([px, py])
  }
  ctx.strokeStyle = 'rgba(255,255,255,0.55)'
  ctx.lineWidth = 2
  ctx.beginPath()
  pts.forEach(([px, py], i) => (i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py)))
  ctx.stroke()
  const [ex, ey] = pts[pts.length - 1]
  ctx.fillStyle = '#ffffff'
  ctx.beginPath()
  ctx.arc(ex, ey, 5, 0, Math.PI * 2)
  ctx.fill()
}

export function reportItemDetail(item) {
  // Manual self-pickup stores compatibility contact data in meta. It belongs only in the contact column, never the detail list.
  if (inferPickupSource(item) === 'self-pickup') return ''
  return String(item.detail || item.repairProject || item.meta || item.repairType || '').trim()
}

export function reportContact(item) {
  const manualPickup = item?.scene === 'pickup' && inferPickupSource(item) !== 'repair'
  if (manualPickup) return decodePickupContact(item)
  return {
    contactType: item?.contactType === 'member' ? 'member' : 'phone',
    contactValue: String(item?.contactValue ?? '').trim()
  }
}

function itemContactLabel(item) {
  return pickupContactLabel(reportContact(item).contactType) === '会员号' ? '会员' : '手机'
}

function itemPaymentLabel(item) {
  const meta = String(item.meta || item.repairType || '').trim()
  if (meta.includes('付费') || meta.includes('付款')) {
    // prefer short chip like reference "付费"
    if (meta.includes('付费') && !meta.includes('付款')) return '付费'
    if (meta.includes('付费')) return '付费'
    return meta
  }
  return String(item.repairType || '').trim()
}

const BAR_W = 10
const CARD_PAD_Y = 28
const CARD_PAD_X = 28

function layoutCardColumns(width) {
  // left content | mid contact | right date panel (inside card)
  // mid gets enough width for an 11-digit mainland phone at ~32px
  const inner = width - BAR_W
  const leftW = Math.floor(inner * 0.46)
  const midW = Math.floor(inner * 0.28)
  const rightW = inner - leftW - midW
  return { leftW, midW, rightW }
}

function fitContactFont(ctx, text, maxWidth, maxSize = 44, minSize = 22) {
  let size = maxSize
  while (size > minSize) {
    ctx.font = `800 ${size}px ${FONT_DISPLAY}`
    if (ctx.measureText(text).width <= maxWidth) return size
    size -= 2
  }
  ctx.font = `800 ${minSize}px ${FONT_DISPLAY}`
  return minSize
}

function formatContactDisplay(value) {
  const raw = String(value || '').trim() || '0'
  // keep digits/spaces; group 11-digit CN mobile as 3-4-4 for readability when space allows
  const digits = raw.replace(/\D/g, '')
  if (digits.length === 11) return `${digits.slice(0, 3)} ${digits.slice(3, 7)} ${digits.slice(7)}`
  return raw
}

function measureCard(ctx, item, contentW) {
  const { leftW } = layoutCardColumns(contentW)
  const textW = leftW - CARD_PAD_X * 2
  const detailItems = splitMaintenanceItems(reportItemDetail(item))
  ctx.font = `500 24px ${FONT_BODY}`
  const detailLines = detailItems.flatMap((entry) => wrapText(ctx, `• ${entry}`, textW)).slice(0, 4)
  const title = String(item.title || '未命名')
  ctx.font = `800 40px ${FONT_DISPLAY}`
  const titleLines = wrapText(ctx, title, textW).slice(0, 2)

  // ticket number, model, status, then maintenance list
  let contentH = 24 + 10
  contentH += Math.max(1, titleLines.length) * 44
  contentH += 14 + 34
  contentH += 14
  if (detailLines.length) contentH += detailLines.length * 32
  // mid/right stacks are shorter; card follows left stack + vertical padding
  return Math.max(176, contentH + CARD_PAD_Y * 2)
}

function measureList(ctx, items, contentW) {
  if (!items.length) return 120
  return items.reduce((sum, item) => sum + measureCard(ctx, item, contentW) + CARD_GAP, 0)
}

function drawLeftAccentBar(ctx, x, y, h) {
  // black vertical accent flush to left rounded edge
  ctx.save()
  roundRect(ctx, x, y, BAR_W + R, h, R)
  ctx.clip()
  ctx.fillStyle = INK
  ctx.fillRect(x, y, BAR_W, h)
  ctx.restore()
}

function drawCard(ctx, item, x, y, width, index) {
  const h = measureCard(ctx, item, width)
  const { leftW, midW, rightW } = layoutCardColumns(width)

  // shell
  drawSoftShadow(ctx, x, y, width, h, R)
  fillRound(ctx, x, y, width, h, R, SURFACE)

  // left black accent bar (inside rounded shell)
  drawLeftAccentBar(ctx, x, y, h)

  // right date panel as inset rounded rect inside the card (not overflowing)
  const rightX = x + BAR_W + leftW + midW
  const panelPad = 14
  const panelX = rightX + 8
  const panelY = y + panelPad
  const panelW = rightW - 16
  const panelH = h - panelPad * 2
  fillRound(ctx, panelX, panelY, panelW, panelH, 16, PANEL)

  // ——— left column (vertically centered) ———
  const leftX = x + BAR_W
  const textW = leftW - CARD_PAD_X * 2
  const title = String(item.title || '未命名')
  ctx.font = `800 40px ${FONT_DISPLAY}`
  const titleLines = wrapText(ctx, title, textW).slice(0, 2)
  const detailItems = splitMaintenanceItems(reportItemDetail(item))
  ctx.font = `500 24px ${FONT_BODY}`
  const detailLines = detailItems.flatMap((entry) => wrapText(ctx, `• ${entry}`, textW)).slice(0, 4)

  let stackH = 24 + 10 + Math.max(1, titleLines.length) * 44 + 14 + 34 + 14
  if (detailLines.length) stackH += detailLines.length * 32
  let cy = y + Math.round((h - stackH) / 2)

  ctx.textAlign = 'left'
  ctx.textBaseline = 'top'
  ctx.fillStyle = MUTED
  ctx.font = `700 20px ${FONT_MONO}`
  ctx.fillText(formatTicketNumber(item.ticketNo, item.id), leftX + CARD_PAD_X, cy)
  cy += 34

  ctx.textBaseline = 'alphabetic'
  const titleBaseline = cy + 34
  ctx.fillStyle = INK
  ctx.font = `800 40px ${FONT_DISPLAY}`
  titleLines.forEach((line, i) => {
    ctx.fillText(line, leftX + CARD_PAD_X, titleBaseline + i * 44)
  })
  cy = titleBaseline + (Math.max(1, titleLines.length) - 1) * 44 + 18

  // status chip
  const status = String(item.status || '进行中')
  const statusText = `STATUS · ${status}`
  ctx.font = `700 18px ${FONT_MONO}`
  const sw = Math.ceil(ctx.measureText(statusText).width + 24)
  const sh = 32
  const chipX = leftX + CARD_PAD_X
  const chipY = cy
  fillRound(ctx, chipX, chipY, sw, sh, 8, CHIP_BG)
  strokeRound(ctx, chipX, chipY, sw, sh, 8, CHIP_BORDER, 1.5)
  ctx.fillStyle = INK
  // center label inside chip
  ctx.textBaseline = 'middle'
  ctx.fillText(statusText, chipX + 12, chipY + sh / 2)
  ctx.textBaseline = 'alphabetic'
  cy = chipY + sh + 16

  if (detailLines.length) {
    ctx.fillStyle = MUTED
    ctx.font = `500 24px ${FONT_BODY}`
    detailLines.forEach((line) => {
      ctx.fillText(line, leftX + CARD_PAD_X, cy + 20)
      cy += 32
    })
  }

  // ——— mid column: phone stack, vertically + horizontally centered in mid band ———
  const midX = leftX + leftW
  const contact = reportContact(item)
  const contactLabel = itemContactLabel(item)
  const contactRaw = String(contact.contactValue || '0').trim() || '0'
  const contactValue = formatContactDisplay(contactRaw)
  const pay = itemPaymentLabel(item)
  const midInnerPad = 12
  const midMaxW = midW - midInnerPad * 2
  const contactSize = fitContactFont(ctx, contactValue, midMaxW, contactRaw.length <= 4 ? 32 : 28, 18)
  const contactLineH = contactSize + 6

  const midStackH = 22 + 12 + contactLineH + 12 + 22
  let my = y + Math.round((h - midStackH) / 2)
  const midCenterX = midX + midW / 2

  ctx.save()
  // hard clip so digits never bleed into the date panel
  ctx.beginPath()
  ctx.rect(midX + 4, y + 8, midW - 8, h - 16)
  ctx.clip()

  ctx.textAlign = 'center'
  ctx.textBaseline = 'top'
  ctx.fillStyle = MUTED_SOFT
  ctx.font = `600 20px ${FONT_MONO}`
  ctx.fillText(contactLabel, midCenterX, my)
  my += 26
  ctx.fillStyle = INK
  ctx.font = `800 ${contactSize}px ${FONT_DISPLAY}`
  ctx.fillText(contactValue, midCenterX, my)
  my += contactLineH + 10
  ctx.fillStyle = MUTED_SOFT
  ctx.font = `600 18px ${FONT_MONO}`
  ctx.fillText(pay, midCenterX, my)
  ctx.restore()

  // ——— right panel: source identities replace the ordinary pickup-date display ———
  const selfPickupLabel = selfPickupReportLabel(item)
  const usedCarLabel = usedCarReportLabel(item)
  const sourceIdentity = selfPickupLabel || usedCarLabel
  const dateLabel = selfPickupLabel ? '自提标识' : usedCarLabel ? '二手车标识' : '取车时间'
  const dateValue = sourceIdentity || formatDateSlash(item.pickupDate)
  if (sourceIdentity) fillRound(ctx, panelX, panelY, panelW, panelH, 16, INK)
  ctx.font = `600 18px ${FONT_MONO}`
  const rightStackH = 22 + 16 + 34
  let ry = panelY + Math.round((panelH - rightStackH) / 2)
  const rightCenterX = panelX + panelW / 2

  ctx.textAlign = 'center'
  ctx.textBaseline = 'top'
  ctx.fillStyle = sourceIdentity ? 'rgba(255,255,255,0.68)' : MUTED
  ctx.font = `600 18px ${FONT_MONO}`
  ctx.fillText(dateLabel, rightCenterX, ry)
  ry += 30
  ctx.fillStyle = sourceIdentity ? '#ffffff' : INK
  ctx.font = `800 ${sourceIdentity ? 30 : 24}px ${FONT_DISPLAY}`
  ctx.fillText(dateValue, rightCenterX, ry)

  ctx.textAlign = 'left'
  ctx.textBaseline = 'alphabetic'
  return y + h + CARD_GAP
}

function drawEmptyCard(ctx, x, y, width, label) {
  const h = 110
  fillRound(ctx, x, y, width, h, R, PAPER_SOFT)
  ctx.fillStyle = MUTED
  ctx.font = `700 24px ${FONT_MONO}`
  ctx.fillText(label, x + 32, y + 64)
  return y + h + CARD_GAP
}

function drawSectionHead(ctx, y, en, title, count) {
  // EN label row
  ctx.fillStyle = MUTED
  ctx.font = `700 20px ${FONT_MONO}`
  ctx.textAlign = 'left'
  ctx.textBaseline = 'alphabetic'
  ctx.fillText(en, PAD, y)
  ctx.textAlign = 'right'
  ctx.fillText(`${count} 条`, WIDTH - PAD, y)
  ctx.textAlign = 'left'
  // clear air between EN eyebrow and Chinese title (was too tight / overlapping optically)
  y += 56
  ctx.fillStyle = INK
  ctx.font = `900 52px ${FONT_DISPLAY}`
  ctx.fillText(title, PAD, y)
  // space under Chinese title before first card
  return y + 52
}

function drawList(ctx, items, y, emptyLabel) {
  const contentW = WIDTH - PAD * 2
  if (!items.length) return drawEmptyCard(ctx, PAD, y, contentW, emptyLabel)
  items.forEach((item, index) => {
    y = drawCard(ctx, item, PAD, y, contentW, index)
  })
  return y
}

export async function renderClosingReportCanvas(model) {
  await ensureReportFonts(model)
  const measure = document.createElement('canvas').getContext('2d')
  const contentW = WIDTH - PAD * 2
  const pickupH = measureList(measure, model.pickups, contentW)
  const repairH = measureList(measure, model.repairs, contentW)
  const handoverH = measureList(measure, model.handovers, contentW)

  // fixed header + sales block estimate + sections + footer + bottom safe
  const headerSalesH = 820
  const sectionHeads = 170 * (1 + (model.handovers.length || model.handovers ? 1 : 0) + 1)
  const finalHeight = Math.ceil(
    headerSalesH + pickupH + repairH + handoverH + sectionHeads + BOTTOM_SAFE + 180
  )

  const canvas = document.createElement('canvas')
  canvas.width = WIDTH
  canvas.height = finalHeight
  const ctx = canvas.getContext('2d')

  // paper background
  ctx.fillStyle = PAPER
  ctx.fillRect(0, 0, WIDTH, finalHeight)

  // ——— masthead ———
  ctx.fillStyle = INK
  ctx.font = `900 92px ${FONT_DISPLAY}`
  ctx.fillText('WORKSHOP OPS', PAD, 108)

  // version badge
  const ver = `V${model.appVersion || '—'}`
  ctx.font = `800 26px ${FONT_DISPLAY}`
  const vw = ctx.measureText(ver).width + 36
  fillRound(ctx, WIDTH - PAD - vw, 58, vw, 48, 8, INK)
  ctx.fillStyle = '#fff'
  ctx.fillText(ver, WIDTH - PAD - vw + 18, 90)

  // store meta + barcode
  ctx.fillStyle = MUTED
  ctx.font = `600 22px ${FONT_MONO}`
  ctx.fillText(`${model.storeName} · ${model.businessDate} · DATABASE SYNC`, PAD, 156)
  drawBarcode(ctx, WIDTH - PAD - 92, 140)

  // rule
  ctx.strokeStyle = INK
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(PAD, 184)
  ctx.lineTo(WIDTH - PAD, 184)
  ctx.stroke()

  // ——— closing complete ———
  let y = 248
  ctx.fillStyle = INK
  ctx.font = `900 72px ${FONT_DISPLAY}`
  ctx.fillText('CLOSING COMPLETE', PAD, y)

  y += 48
  ctx.fillStyle = MUTED
  ctx.font = `500 24px ${FONT_BODY}`
  const closedLabel = formatClock(model.closedAt)
  const exportLabel = formatClock(new Date().toISOString())
  ctx.fillText(`◎  闭店 ${closedLabel}   ·   ↗  导出 ${exportLabel}   ·   ${model.exporterName || '同事'}`, PAD, y)

  // ——— sales ———
  y += 72
  ctx.fillStyle = INK
  ctx.font = `900 48px ${FONT_DISPLAY}`
  ctx.fillText('销售数据', PAD, y)
  y += 34
  ctx.fillStyle = MUTED
  ctx.font = `700 18px ${FONT_MONO}`
  ctx.fillText('SALES / KPI', PAD, y)

  y += 36
  const heroH = 248
  const subH = 128
  const blockH = heroH + subH
  const heroX = PAD
  const heroW = contentW
  const blockY = y

  // white shell + soft shadow for whole sales card
  drawSoftShadow(ctx, heroX, blockY, heroW, blockH, 20)
  fillRound(ctx, heroX, blockY, heroW, blockH, 20, SURFACE)

  // black hero top
  ctx.save()
  roundRect(ctx, heroX, blockY, heroW, heroH + 20, 20)
  ctx.clip()
  ctx.fillStyle = INK
  ctx.fillRect(heroX, blockY, heroW, heroH)
  ctx.restore()
  // ensure bottom of black is square against white strip
  ctx.fillStyle = INK
  ctx.fillRect(heroX, blockY + heroH - 20, heroW, 20)

  ctx.fillStyle = 'rgba(255,255,255,0.55)'
  ctx.font = `700 18px ${FONT_MONO}`
  ctx.fillText('VEHICLES SOLD  ·  车辆销售', heroX + 36, blockY + 42)

  ctx.fillStyle = '#ffffff'
  ctx.font = `900 148px ${FONT_DISPLAY}`
  ctx.fillText(String(model.kpi.salesVehicles), heroX + 36, blockY + 186)

  drawSparkline(ctx, heroX + heroW * 0.42, blockY + 18, heroW * 0.54, heroH - 36)

  // four metric cells — same order/labels as reference sheet
  const labels = [
    ['发起销售 · 01', model.kpi.safetyChecks],
    ['有效评价', model.kpi.validReviews],
    ['二手售出', model.kpi.usedSold],
    ['二手收车', model.kpi.usedReceived]
  ]
  const cellW = heroW / 4
  const subY = blockY + heroH
  labels.forEach(([label, value], i) => {
    const cx = heroX + cellW * i
    if (i > 0) {
      ctx.strokeStyle = LINE
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(cx, subY + 28)
      ctx.lineTo(cx, subY + subH - 28)
      ctx.stroke()
    }
    // vertically center label+value stack in the cell
    const stackH = 22 + 12 + 52
    const sy = subY + Math.round((subH - stackH) / 2)
    ctx.textAlign = 'left'
    ctx.textBaseline = 'top'
    ctx.fillStyle = MUTED
    ctx.font = `600 18px ${FONT_MONO}`
    ctx.fillText(label, cx + 28, sy)
    ctx.fillStyle = INK
    ctx.font = `900 52px ${FONT_DISPLAY}`
    ctx.fillText(String(value), cx + 28, sy + 30)
    ctx.textBaseline = 'alphabetic'
  })

  y = blockY + blockH + 52

  // ——— pickups ———
  y = drawSectionHead(ctx, y, `PICKUP · ${pad2(model.pickups.length)} OPEN`, '待取车辆', model.pickups.length)
  y = drawList(ctx, model.pickups, y, '本日无待取车辆')
  y += 20

  // ——— repairs ———
  y = drawSectionHead(ctx, y, `REPAIR · ${pad2(model.repairs.length)} OPEN`, '维修车辆', model.repairs.length)
  y = drawList(ctx, model.repairs, y, '本日无维修车辆')
  y += 20

  // ——— handovers (same card system if any) ———
  if (model.handovers.length) {
    y = drawSectionHead(ctx, y, `HANDOVER · ${pad2(model.handovers.length)} OPEN`, '交接事项', model.handovers.length)
    y = drawList(ctx, model.handovers, y, '本日无交接事项')
    y += 20
  }

  // ——— footer ———
  y += 12
  ctx.strokeStyle = LINE
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(PAD, y)
  ctx.lineTo(WIDTH - PAD, y)
  ctx.stroke()

  y += 42
  ctx.fillStyle = MUTED_SOFT
  ctx.font = `700 18px ${FONT_MONO}`
  ctx.textAlign = 'left'
  ctx.fillText('WORKSHOP OPS  ·  DAILY REPORT', PAD, y)
  ctx.textAlign = 'right'
  ctx.fillStyle = INK
  ctx.font = `900 36px ${FONT_DISPLAY}`
  ctx.fillText('W/O', WIDTH - PAD, y + 4)
  ctx.textAlign = 'left'

  // ensure bottom safe padding
  const needed = y + BOTTOM_SAFE
  if (needed > finalHeight) {
    const bigger = document.createElement('canvas')
    bigger.width = WIDTH
    bigger.height = needed
    const bctx = bigger.getContext('2d')
    bctx.fillStyle = PAPER
    bctx.fillRect(0, 0, WIDTH, needed)
    bctx.drawImage(canvas, 0, 0)
    return bigger
  }

  // trim excess empty paper if overestimated, keep bottom safe
  if (finalHeight - needed > 80) {
    const trimmed = document.createElement('canvas')
    trimmed.width = WIDTH
    trimmed.height = needed
    const tctx = trimmed.getContext('2d')
    tctx.drawImage(canvas, 0, 0)
    return trimmed
  }

  return canvas
}

function triggerDownload(url, filename) {
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.rel = 'noopener'
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
}

export async function exportClosingReportImage(model) {
  const canvas = await renderClosingReportCanvas(model)
  const blob = await new Promise((resolve, reject) => {
    canvas.toBlob((value) => (value ? resolve(value) : reject(new Error('无法生成图片。'))), 'image/png')
  })
  const filename = `闭店日报-${model.businessDate || 'report'}.png`
  const objectUrl = URL.createObjectURL(blob)
  let mode = 'download'
  try {
    triggerDownload(objectUrl, filename)
  } catch {
    mode = 'preview'
  }
  return {
    mode,
    objectUrl,
    filename,
    blob,
    revoke: () => URL.revokeObjectURL(objectUrl)
  }
}
