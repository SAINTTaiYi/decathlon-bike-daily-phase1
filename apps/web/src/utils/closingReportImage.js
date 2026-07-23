import { formatTicketNumber, splitMaintenanceItems } from '../data/recordPresentation.js'
import { decodePickupContact, inferPickupSource, inferSelfPickupPlatform, pickupContactLabel } from '../data/pickupRecord.js'

const WIDTH = 1242
const PAD = 56
const INK = '#141616'
const INK_SECONDARY = '#454b49'
const MUTED = '#59615f'
const CANVAS = '#f3f5f2'
const SURFACE = '#ffffff'
const FIELD = '#e7ebe8'
const LINE = '#141616'
const LINE_SOFT = '#aeb5b2'
const OVERVIEW = '#d7ff3f'
const PICKUP = '#ffe247'
const REPAIR = '#18d8ff'
const SALES = '#7657ff'
const CLOSING = '#ff5a24'
const RESALE = '#ff3d96'

const FONT_BODY = '"Albert Sans Local", "Noto Sans SC Variable"'
const FONT_DISPLAY = '"Barlow Condensed Local", "Noto Sans SC Variable", "Albert Sans Local"'
const FONT_MONO = '"Albert Sans Local", "Noto Sans SC Variable"'

const CARD_GAP = 16
const BOTTOM_SAFE = 96
const CARD_PAD = 24
const MODULE_BAR = 14

export const REPORT_OUTPUT_PROFILE = Object.freeze({
  width: WIDTH,
  chatLongEdge: 1080,
  minimumReadableSourcePx: 20,
  structuralLinePx: 2,
  background: CANVAS,
  ink: INK,
  moduleColors: Object.freeze({ overview: OVERVIEW, pickup: PICKUP, repair: REPAIR, sales: SALES, resale: RESALE, closing: CLOSING })
})

const SECTION_THEME = Object.freeze({
  pickup: Object.freeze({ code: 'PICKUP', title: '待取车辆', color: PICKUP }),
  repair: Object.freeze({ code: 'REPAIR', title: '维修车辆', color: REPAIR }),
  other: Object.freeze({ code: 'HANDOVER', title: '交接事项', color: OVERVIEW, neutral: true })
})

let latinFontsReadyPromise

const REPORT_STATIC_GLYPHS = '信号网格 闭店日报 销售数据 车辆销售 安全检查 车型 有效评价 二手售出 二手收车 待取车辆 维修车辆 交接事项 本日无待取车辆 本日无维修车辆 本日无交接事项 取车时间 天猫自提 京东自提 小程序自提 手机 会员 同事 进行中 付费 付款 免费 质保 门店 未命名 条'

function pad2(value) {
  return String(value ?? 0).padStart(2, '0')
}

function formatDateSlash(value) {
  const raw = String(value || '').trim()
  if (!raw) return '---- / -- / --'
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (match) return `${match[1]} / ${match[2]} / ${match[3]}`
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

function hexChannels(hex) {
  const value = String(hex).replace('#', '')
  return [0, 2, 4].map((offset) => Number.parseInt(value.slice(offset, offset + 2), 16) / 255)
}

export function reportRelativeLuminance(hex) {
  return hexChannels(hex)
    .map((channel) => (channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4))
    .reduce((sum, channel, index) => sum + channel * [0.2126, 0.7152, 0.0722][index], 0)
}

export function reportContrastRatio(foreground, background) {
  const light = Math.max(reportRelativeLuminance(foreground), reportRelativeLuminance(background))
  const dark = Math.min(reportRelativeLuminance(foreground), reportRelativeLuminance(background))
  return (light + 0.05) / (dark + 0.05)
}

export function reportScaledPixelSize(sourcePixels, targetWidth = REPORT_OUTPUT_PROFILE.chatLongEdge) {
  return Number(sourcePixels || 0) * Number(targetWidth || 0) / REPORT_OUTPUT_PROFILE.width
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
  const labels = { tmall: '天猫自提', jd: '京东自提', 'mini-program': '小程序自提' }
  return labels[inferSelfPickupPlatform(record)] || ''
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
    pickups: records.filter(isOpenPickup).map((record) => ({ ...record })),
    repairs: records.filter(isOpenRepair).map((record) => ({ ...record })),
    handovers: records.filter(isOpenHandover).map((record) => ({ ...record }))
  }
}

function reportFontSample(model) {
  const recordText = [...(model.pickups || []), ...(model.repairs || []), ...(model.handovers || [])]
    .flatMap((record) => [record.title, record.status, record.detail, record.repairProject, record.meta])
    .filter(Boolean)
    .join('')
  return `${REPORT_STATIC_GLYPHS}${model.storeName || ''}${model.exporterName || ''}${recordText}`
}

function ensureLatinReportFonts() {
  if (latinFontsReadyPromise) return latinFontsReadyPromise
  latinFontsReadyPromise = (async () => {
    await document.fonts.ready
    const [displayFaces, bodyFaces] = await Promise.all([
      document.fonts.load('900 96px "Barlow Condensed Local"', 'WORKSHOP SIGNAL GRID 0123456789'),
      document.fonts.load('500 26px "Albert Sans Local"', 'WORKSHOP SIGNAL GRID 0123456789')
    ])
    if (!displayFaces.length || !bodyFaces.length) throw new Error('站点字体加载失败。')
  })()
  return latinFontsReadyPromise
}

async function ensureReportFonts(model) {
  await ensureLatinReportFonts()
  const sample = reportFontSample(model)
  const cjkFaces = await document.fonts.load('900 48px "Noto Sans SC Variable"', sample)
  if (!cjkFaces.length) throw new Error('站点中文字体加载失败。')
  const probe = document.createElement('canvas').getContext('2d')
  probe.font = `700 48px ${FONT_DISPLAY}`
  if (probe.measureText('闭店日报').width < 12) throw new Error('网站中文字体未就绪。')
}

function wrapText(ctx, text, maxWidth) {
  const value = String(text || '').trim() || '-'
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

function fillBox(ctx, x, y, width, height, fill) {
  ctx.fillStyle = fill
  ctx.fillRect(x, y, width, height)
}

function strokeBox(ctx, x, y, width, height, stroke = LINE, lineWidth = 2) {
  ctx.strokeStyle = stroke
  ctx.lineWidth = lineWidth
  ctx.strokeRect(x, y, width, height)
}

function drawHalftone(ctx, x, y, width, height, color = '#ffffff', alpha = 0.18) {
  ctx.save()
  ctx.fillStyle = color
  ctx.globalAlpha = alpha
  const step = 18
  for (let row = 0; row * step < height; row += 1) {
    for (let column = 0; column * step < width; column += 1) {
      const radius = 1.4 + ((row + column) % 4) * 0.55
      ctx.beginPath()
      ctx.arc(x + column * step + (row % 2 ? step / 2 : 0), y + row * step, radius, 0, Math.PI * 2)
      ctx.fill()
    }
  }
  ctx.restore()
}

export function reportItemDetail(item) {
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
  if (meta.includes('付费')) return '付费'
  if (meta.includes('付款')) return '付款'
  return String(item.repairType || '').trim()
}

function formatContactDisplay(value) {
  const raw = String(value || '').trim() || '-'
  const digits = raw.replace(/\D/g, '')
  if (digits.length === 11) return `${digits.slice(0, 3)} ${digits.slice(3, 7)} ${digits.slice(7)}`
  return raw
}

function fitTextSize(ctx, text, maxWidth, maxSize = 34, minSize = REPORT_OUTPUT_PROFILE.minimumReadableSourcePx) {
  let size = maxSize
  while (size > minSize) {
    ctx.font = `800 ${size}px ${FONT_DISPLAY}`
    if (ctx.measureText(text).width <= maxWidth) return size
    size -= 2
  }
  return minSize
}

function measureCard(ctx, item, contentWidth) {
  const detailWidth = Math.floor(contentWidth * 0.52) - CARD_PAD * 2
  ctx.font = `800 38px ${FONT_DISPLAY}`
  const titleLines = wrapText(ctx, item.title || '未命名', detailWidth).slice(0, 2)
  ctx.font = `500 22px ${FONT_BODY}`
  const detailLines = splitMaintenanceItems(reportItemDetail(item))
    .flatMap((entry) => wrapText(ctx, `• ${entry}`, detailWidth))
    .slice(0, 4)
  return Math.max(180, CARD_PAD * 2 + 30 + titleLines.length * 42 + 42 + detailLines.length * 30)
}

function measureList(ctx, items, contentWidth) {
  if (!items.length) return 104
  return items.reduce((total, item) => total + measureCard(ctx, item, contentWidth) + CARD_GAP, 0)
}

function drawStatusTag(ctx, x, y, text) {
  const label = `STATUS / ${String(text || '进行中').toUpperCase()}`
  ctx.font = `800 20px ${FONT_MONO}`
  const width = Math.ceil(ctx.measureText(label).width + 24)
  fillBox(ctx, x, y, width, 32, SURFACE)
  strokeBox(ctx, x, y, width, 32, INK, 2)
  ctx.fillStyle = INK
  ctx.textBaseline = 'middle'
  ctx.fillText(label, x + 12, y + 16)
  ctx.textBaseline = 'alphabetic'
  return width
}

function drawCard(ctx, item, x, y, width, theme, index) {
  const height = measureCard(ctx, item, width)
  const detailWidth = Math.floor(width * 0.52)
  const contactWidth = Math.floor(width * 0.25)
  const timingWidth = width - detailWidth - contactWidth
  const signal = theme.color

  fillBox(ctx, x, y, width, height, SURFACE)
  strokeBox(ctx, x, y, width, height, LINE, 2)
  fillBox(ctx, x, y, MODULE_BAR, height, signal)
  fillBox(ctx, x + width - timingWidth, y, timingWidth, height, FIELD)
  strokeBox(ctx, x + width - timingWidth, y, timingWidth, height, LINE, 2)

  ctx.fillStyle = signal
  ctx.fillRect(x + MODULE_BAR, y, 62, 34)
  ctx.fillStyle = INK
  ctx.font = `900 22px ${FONT_DISPLAY}`
  ctx.textBaseline = 'middle'
  ctx.fillText(pad2(index + 1), x + MODULE_BAR + 14, y + 17)
  ctx.textBaseline = 'alphabetic'

  const leftX = x + MODULE_BAR + CARD_PAD
  const textWidth = detailWidth - MODULE_BAR - CARD_PAD * 2
  let cursorY = y + 52
  ctx.fillStyle = MUTED
  ctx.font = `800 20px ${FONT_MONO}`
  ctx.fillText(formatTicketNumber(item.ticketNo, item.id), leftX, cursorY)

  cursorY += 42
  ctx.fillStyle = INK
  ctx.font = `900 38px ${FONT_DISPLAY}`
  const titleLines = wrapText(ctx, item.title || '未命名', textWidth).slice(0, 2)
  titleLines.forEach((line, lineIndex) => ctx.fillText(line, leftX, cursorY + lineIndex * 42))
  cursorY += titleLines.length * 42 + 10
  drawStatusTag(ctx, leftX, cursorY, item.status)
  cursorY += 48

  const details = splitMaintenanceItems(reportItemDetail(item))
  ctx.fillStyle = INK_SECONDARY
  ctx.font = `600 22px ${FONT_BODY}`
  details.flatMap((entry) => wrapText(ctx, `• ${entry}`, textWidth)).slice(0, 4).forEach((line) => {
    ctx.fillText(line, leftX, cursorY)
    cursorY += 30
  })

  const contactX = x + detailWidth
  const contact = reportContact(item)
  const contactValue = formatContactDisplay(contact.contactValue)
  const contactSize = fitTextSize(ctx, contactValue, contactWidth - 36, 32)
  ctx.textAlign = 'center'
  ctx.fillStyle = MUTED
  ctx.font = `800 20px ${FONT_MONO}`
  ctx.fillText(itemContactLabel(item), contactX + contactWidth / 2, y + height / 2 - 24)
  ctx.fillStyle = INK
  ctx.font = `900 ${contactSize}px ${FONT_DISPLAY}`
  ctx.fillText(contactValue, contactX + contactWidth / 2, y + height / 2 + 18)
  ctx.fillStyle = MUTED
  ctx.font = `800 20px ${FONT_MONO}`
  ctx.fillText(itemPaymentLabel(item), contactX + contactWidth / 2, y + height / 2 + 50)

  const timingX = x + width - timingWidth
  const selfPickup = selfPickupReportLabel(item)
  const timingLabel = selfPickup ? 'SELF PICKUP' : 'PICKUP DATE'
  const timingValue = selfPickup || formatDateSlash(item.pickupDate)
  if (selfPickup) {
    fillBox(ctx, timingX, y, timingWidth, height, INK)
    fillBox(ctx, timingX, y, 12, height, signal)
    drawHalftone(ctx, timingX + 18, y + 18, timingWidth - 36, height - 36, signal, 0.32)
  }
  ctx.fillStyle = selfPickup ? SURFACE : MUTED
  ctx.font = `800 20px ${FONT_MONO}`
  ctx.fillText(timingLabel, timingX + timingWidth / 2, y + height / 2 - 20)
  ctx.fillStyle = selfPickup ? SURFACE : INK
  ctx.font = `900 ${selfPickup ? 30 : 23}px ${FONT_DISPLAY}`
  ctx.fillText(timingValue, timingX + timingWidth / 2, y + height / 2 + 24)

  ctx.textAlign = 'left'
  return y + height + CARD_GAP
}

function drawEmptyCard(ctx, y, theme, label) {
  const width = WIDTH - PAD * 2
  fillBox(ctx, PAD, y, width, 92, SURFACE)
  strokeBox(ctx, PAD, y, width, 92, LINE, 2)
  fillBox(ctx, PAD, y, 18, 92, theme.color)
  ctx.fillStyle = MUTED
  ctx.font = `800 22px ${FONT_MONO}`
  ctx.fillText(label, PAD + 42, y + 56)
  return y + 92 + CARD_GAP
}

function drawSectionHead(ctx, y, theme, count) {
  const width = WIDTH - PAD * 2
  fillBox(ctx, PAD, y, width, 108, theme.neutral ? SURFACE : theme.color)
  strokeBox(ctx, PAD, y, width, 108, LINE, 2)
  if (theme.neutral) fillBox(ctx, PAD, y, 22, 108, theme.color)
  ctx.fillStyle = INK
  ctx.font = `900 56px ${FONT_DISPLAY}`
  ctx.fillText(theme.code, PAD + 28, y + 58)
  ctx.font = `900 34px ${FONT_DISPLAY}`
  ctx.fillText(theme.title, PAD + 30, y + 92)
  ctx.textAlign = 'right'
  ctx.font = `900 64px ${FONT_DISPLAY}`
  ctx.fillText(pad2(count), WIDTH - PAD - 28, y + 73)
  ctx.textAlign = 'left'
  return y + 128
}

function drawList(ctx, items, y, theme, emptyLabel) {
  if (!items.length) return drawEmptyCard(ctx, y, theme, emptyLabel)
  items.forEach((item, index) => { y = drawCard(ctx, item, PAD, y, WIDTH - PAD * 2, theme, index) })
  return y
}

function drawRegistrationGrid(ctx, x, y, width, height, color, alpha = 0.18) {
  ctx.save()
  ctx.strokeStyle = color
  ctx.globalAlpha = alpha
  ctx.lineWidth = 1
  const step = 32
  for (let cx = x; cx <= x + width; cx += step) {
    ctx.beginPath(); ctx.moveTo(cx, y); ctx.lineTo(cx, y + height); ctx.stroke()
  }
  for (let cy = y; cy <= y + height; cy += step) {
    ctx.beginPath(); ctx.moveTo(x, cy); ctx.lineTo(x + width, cy); ctx.stroke()
  }
  ctx.restore()
}

function drawSummary(ctx, model, y) {
  const contentWidth = WIDTH - PAD * 2
  const heroHeight = 292
  fillBox(ctx, PAD, y, contentWidth, heroHeight, SALES)
  strokeBox(ctx, PAD, y, contentWidth, heroHeight, LINE, 2)
  drawRegistrationGrid(ctx, PAD, y, contentWidth, heroHeight, SURFACE, 0.14)
  drawHalftone(ctx, PAD + contentWidth * 0.56, y + 24, contentWidth * 0.4, heroHeight - 48, SURFACE, 0.2)

  ctx.fillStyle = SURFACE
  ctx.font = `900 30px ${FONT_DISPLAY}`
  ctx.fillText('SALES / CLOSING KPI', PAD + 32, y + 48)
  ctx.font = `900 162px ${FONT_DISPLAY}`
  ctx.fillText(String(model.kpi.salesVehicles), PAD + 28, y + 208)
  ctx.font = `800 23px ${FONT_BODY}`
  ctx.fillText('车辆销售', PAD + 36, y + 258)

  const modelLabel = model.kpi.safetyModel || '-'
  ctx.textAlign = 'right'
  ctx.font = `900 58px ${FONT_DISPLAY}`
  ctx.fillText(`${model.kpi.safetyChecks}`, WIDTH - PAD - 36, y + 122)
  ctx.font = `800 20px ${FONT_MONO}`
  ctx.fillText('安全检查', WIDTH - PAD - 36, y + 152)
  ctx.font = `900 34px ${FONT_DISPLAY}`
  ctx.fillText(modelLabel, WIDTH - PAD - 36, y + 210)
  ctx.font = `800 20px ${FONT_MONO}`
  ctx.fillText('检查车型', WIDTH - PAD - 36, y + 238)
  ctx.textAlign = 'left'

  y += heroHeight
  const metrics = [
    ['VALID REVIEWS', '有效评价', model.kpi.validReviews],
    ['USED SOLD', '二手售出', model.kpi.usedSold],
    ['USED RECEIVED', '二手收车', model.kpi.usedReceived]
  ]
  const metricHeight = 130
  const metricWidth = contentWidth / metrics.length
  metrics.forEach(([code, label, value], index) => {
    const x = PAD + index * metricWidth
    fillBox(ctx, x, y, metricWidth, metricHeight, SURFACE)
    strokeBox(ctx, x, y, metricWidth, metricHeight, LINE, 2)
    fillBox(ctx, x, y, metricWidth, 12, index === 0 ? OVERVIEW : index === 1 ? RESALE : CLOSING)
    ctx.fillStyle = MUTED
    ctx.font = `800 20px ${FONT_MONO}`
    ctx.fillText(code, x + 22, y + 43)
    ctx.fillStyle = INK
    ctx.font = `900 52px ${FONT_DISPLAY}`
    ctx.fillText(String(value), x + 22, y + 99)
    ctx.font = `800 20px ${FONT_BODY}`
    ctx.textAlign = 'right'
    ctx.fillText(label, x + metricWidth - 22, y + 96)
    ctx.textAlign = 'left'
  })
  return y + metricHeight
}

export async function renderClosingReportCanvas(model) {
  await ensureReportFonts(model)
  const measure = document.createElement('canvas').getContext('2d')
  const contentWidth = WIDTH - PAD * 2
  const pickupHeight = measureList(measure, model.pickups, contentWidth)
  const repairHeight = measureList(measure, model.repairs, contentWidth)
  const handoverHeight = model.handovers.length ? measureList(measure, model.handovers, contentWidth) : 0
  const sectionCount = model.handovers.length ? 3 : 2
  const estimatedHeight = 760 + pickupHeight + repairHeight + handoverHeight + sectionCount * 170 + BOTTOM_SAFE

  const canvas = document.createElement('canvas')
  canvas.width = WIDTH
  canvas.height = Math.ceil(estimatedHeight)
  const ctx = canvas.getContext('2d')
  fillBox(ctx, 0, 0, canvas.width, canvas.height, CANVAS)

  fillBox(ctx, 0, 0, WIDTH, 198, INK)
  fillBox(ctx, 0, 0, 24, 198, CLOSING)
  drawRegistrationGrid(ctx, 24, 0, WIDTH - 24, 198, SURFACE, 0.1)
  ctx.fillStyle = SURFACE
  ctx.font = `900 88px ${FONT_DISPLAY}`
  ctx.fillText('WORKSHOP SIGNAL GRID', PAD, 96)
  ctx.fillStyle = CLOSING
  ctx.font = `900 40px ${FONT_DISPLAY}`
  ctx.fillText('闭店日报 / CLOSING REPORT', PAD + 4, 148)
  ctx.fillStyle = SURFACE
  ctx.font = `800 20px ${FONT_MONO}`
  ctx.fillText(`${model.storeName}  /  ${formatDateSlash(model.businessDate)}  /  ${model.exporterName || '同事'}`, PAD + 4, 178)

  const version = `V${model.appVersion || '-'}`
  ctx.textAlign = 'right'
  ctx.fillStyle = OVERVIEW
  ctx.font = `900 38px ${FONT_DISPLAY}`
  ctx.fillText(version, WIDTH - PAD, 66)
  ctx.fillStyle = SURFACE
  ctx.font = `800 20px ${FONT_MONO}`
  ctx.fillText(`CLOSED ${formatClock(model.closedAt)} / DATABASE CONFIRMED`, WIDTH - PAD, 106)
  ctx.textAlign = 'left'

  let y = 230
  y = drawSummary(ctx, model, y)
  y += 46

  y = drawSectionHead(ctx, y, SECTION_THEME.pickup, model.pickups.length)
  y = drawList(ctx, model.pickups, y, SECTION_THEME.pickup, '本日无待取车辆')
  y += 30

  y = drawSectionHead(ctx, y, SECTION_THEME.repair, model.repairs.length)
  y = drawList(ctx, model.repairs, y, SECTION_THEME.repair, '本日无维修车辆')
  y += 30

  if (model.handovers.length) {
    y = drawSectionHead(ctx, y, SECTION_THEME.other, model.handovers.length)
    y = drawList(ctx, model.handovers, y, SECTION_THEME.other, '本日无交接事项')
    y += 30
  }

  fillBox(ctx, PAD, y, contentWidth, 2, LINE)
  y += 38
  ctx.fillStyle = MUTED
  ctx.font = `800 20px ${FONT_MONO}`
  ctx.fillText('COLOR + STRUCTURE / CHAT COMPRESSION SAFE / GRAYSCALE LEGIBLE', PAD, y)
  ctx.textAlign = 'right'
  ctx.fillStyle = INK
  ctx.font = `900 30px ${FONT_DISPLAY}`
  ctx.fillText('WORKSHOP OPS', WIDTH - PAD, y + 4)
  ctx.textAlign = 'left'
  y += BOTTOM_SAFE

  if (canvas.height - y > 8) {
    const trimmed = document.createElement('canvas')
    trimmed.width = WIDTH
    trimmed.height = y
    trimmed.getContext('2d').drawImage(canvas, 0, 0)
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
  return { mode, objectUrl, filename, blob, revoke: () => URL.revokeObjectURL(objectUrl) }
}
