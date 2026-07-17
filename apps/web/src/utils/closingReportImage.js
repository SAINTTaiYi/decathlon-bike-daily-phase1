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

const FONT_BODY = '"Albert Sans Local", "Noto Serif SC Variable"'
const FONT_DISPLAY = '"Albert Sans Local", "Noto Serif SC Variable"'
const FONT_MONO = '"Albert Sans Local", "Noto Serif SC Variable"'

const R = 22
const CARD_GAP = 18
const BOTTOM_SAFE = 120

let fontsReadyPromise

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
      salesVehicles: Number(kpi.salesVehicles || 0),
      safetyChecks: Number(kpi.safetyChecks || 0),
      safetyModel: String(kpi.safetyModel || '').trim(),
      validReviews: Number(kpi.validReviews || 0),
      usedSold: Number(kpi.usedSold || 0),
      usedReceived: Number(kpi.usedReceived || 0)
    },
    pickups: records.filter(isOpenPickup),
    repairs: records.filter(isOpenRepair),
    handovers: records.filter(isOpenHandover)
  }
}

function collectSiteFontUrls() {
  const albert = new Set()
  const noto = new Set()
  for (const sheet of document.styleSheets) {
    let rules
    try { rules = sheet.cssRules } catch { continue }
    for (const rule of rules || []) {
      if (!(rule instanceof CSSFontFaceRule)) continue
      const family = String(rule.style.getPropertyValue('font-family') || '').replace(/['"]/g, '')
      const src = String(rule.style.getPropertyValue('src') || '')
      const match = src.match(/url\((['"]?)(.*?)\1\)/u)
      if (!match?.[2]) continue
      if (family.includes('Albert Sans Local')) albert.add(match[2])
      if (family.includes('Noto Serif SC Variable')) noto.add(match[2])
    }
  }
  return { albert: [...albert], noto: [...noto] }
}

async function ensureReportFonts() {
  if (fontsReadyPromise) return fontsReadyPromise
  fontsReadyPromise = (async () => {
    let found = collectSiteFontUrls()
    if (!found.noto.length) {
      await new Promise((r) => requestAnimationFrame(() => r()))
      found = collectSiteFontUrls()
    }
    const faces = []
    for (const url of (found.albert.length ? found.albert : ['/fonts/albert-sans-variable.woff2'])) {
      faces.push(new FontFace('Albert Sans Local', `url('${url}') format('woff2')`, { style: 'normal', weight: '100 900', display: 'block' }))
    }
    if (!found.noto.length) throw new Error('无法读取网站中文字体，已拒绝使用手机字体。')
    for (const url of found.noto) {
      faces.push(new FontFace('Noto Serif SC Variable', `url('${url}') format('woff2-variations')`, { style: 'normal', weight: '200 900', display: 'block' }))
    }
    const loaded = await Promise.all(faces.map(async (face) => {
      try {
        const ready = await face.load()
        document.fonts.add(ready)
        return true
      } catch { return false }
    }))
    await document.fonts.ready.catch(() => undefined)
    await Promise.all([
      document.fonts.load(`900 96px ${FONT_DISPLAY}`),
      document.fonts.load(`700 24px ${FONT_MONO}`),
      document.fonts.load(`500 26px ${FONT_BODY}`),
      document.fonts.load('900 48px "Noto Serif SC Variable"')
    ])
    if (!loaded.some(Boolean)) throw new Error('站点字体加载失败。')
    const probe = document.createElement('canvas').getContext('2d')
    probe.font = `700 48px ${FONT_DISPLAY}`
    if (probe.measureText('闭店日报').width < 12) throw new Error('网站中文字体未就绪。')
  })()
  return fontsReadyPromise
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

function itemDetail(item) {
  return String(item.detail || item.repairProject || item.meta || item.repairType || '').trim()
}

function itemContactLabel(item) {
  return item.contactType === 'member' ? '会员' : '手机'
}

function itemPaymentLabel(item) {
  const meta = String(item.meta || item.repairType || '').trim()
  if (meta.includes('付费') || meta.includes('付款')) return meta
  return '付款 · 付费'
}

function measureCard(ctx, item, contentW) {
  const leftW = Math.floor(contentW * 0.48)
  const detail = itemDetail(item)
  ctx.font = `500 24px ${FONT_BODY}`
  const detailLines = detail ? wrapText(ctx, detail, leftW - 36).slice(0, 4) : []
  const title = String(item.title || '未命名')
  ctx.font = `800 40px ${FONT_DISPLAY}`
  const titleLines = wrapText(ctx, title, leftW - 70).slice(0, 2)
  // top pad + index/title + status + detail + bottom pad
  let h = 28
  h += Math.max(1, titleLines.length) * 44
  h += 18 + 34 + 16
  if (detailLines.length) h += detailLines.length * 32 + 8
  h += 28
  return Math.max(168, h)
}

function measureList(ctx, items, contentW) {
  if (!items.length) return 120
  return items.reduce((sum, item) => sum + measureCard(ctx, item, contentW) + CARD_GAP, 0)
}

function drawCard(ctx, item, x, y, width, index) {
  const h = measureCard(ctx, item, width)
  drawSoftShadow(ctx, x, y, width, h, R)
  fillRound(ctx, x, y, width, h, R, SURFACE)

  const leftW = Math.floor(width * 0.48)
  const midW = Math.floor(width * 0.22)
  const rightW = width - leftW - midW
  const midX = x + leftW
  const rightX = midX + midW

  // left content
  let cy = y + 34
  ctx.fillStyle = MUTED
  ctx.font = `700 22px ${FONT_MONO}`
  ctx.textAlign = 'left'
  ctx.fillText(pad2(index + 1), x + 28, cy)

  const title = String(item.title || '未命名')
  ctx.fillStyle = INK
  ctx.font = `800 40px ${FONT_DISPLAY}`
  const titleLines = wrapText(ctx, title, leftW - 70).slice(0, 2)
  titleLines.forEach((line, i) => {
    ctx.fillText(line, x + 70, cy + i * 44)
  })
  cy += Math.max(1, titleLines.length) * 44 + 14

  const status = String(item.status || '进行中')
  const statusText = `STATUS · ${status}`
  ctx.font = `700 18px ${FONT_MONO}`
  const sw = ctx.measureText(statusText).width + 22
  const sh = 30
  fillRound(ctx, x + 28, cy - 20, sw, sh, 6, CHIP_BG)
  strokeRound(ctx, x + 28, cy - 20, sw, sh, 6, CHIP_BORDER, 1.5)
  ctx.fillStyle = INK
  ctx.fillText(statusText, x + 39, cy + 1)
  cy += 28

  const detail = itemDetail(item)
  if (detail) {
    ctx.fillStyle = MUTED
    ctx.font = `500 24px ${FONT_BODY}`
    wrapText(ctx, detail, leftW - 36).slice(0, 4).forEach((line) => {
      ctx.fillText(line, x + 28, cy)
      cy += 32
    })
  }

  // mid column - contact
  const contactLabel = itemContactLabel(item)
  const contactValue = String(item.contactValue || '0').trim() || '0'
  ctx.fillStyle = MUTED_SOFT
  ctx.font = `600 20px ${FONT_MONO}`
  ctx.textAlign = 'left'
  ctx.fillText(contactLabel, midX + 18, y + 42)
  ctx.fillStyle = INK
  ctx.font = `800 48px ${FONT_DISPLAY}`
  ctx.fillText(contactValue, midX + 18, y + 96)
  ctx.fillStyle = MUTED_SOFT
  ctx.font = `600 18px ${FONT_MONO}`
  ctx.fillText(itemPaymentLabel(item), midX + 18, y + 130)

  // right panel - pickup date
  fillRound(ctx, rightX, y, rightW, h, R, PANEL)
  // cover left corners of right panel so only right side is rounded visually with card
  ctx.fillStyle = PANEL
  ctx.fillRect(rightX, y, 24, h)

  ctx.fillStyle = MUTED
  ctx.font = `600 18px ${FONT_MONO}`
  ctx.textAlign = 'right'
  ctx.fillText('取车时间', rightX + rightW - 28, y + 42)
  ctx.fillStyle = INK
  ctx.font = `800 30px ${FONT_DISPLAY}`
  ctx.fillText(formatDateSlash(item.pickupDate), rightX + rightW - 28, y + 96)
  ctx.textAlign = 'left'

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
  ctx.fillStyle = MUTED
  ctx.font = `700 20px ${FONT_MONO}`
  ctx.textAlign = 'left'
  ctx.fillText(en, PAD, y)
  ctx.textAlign = 'right'
  ctx.fillText(`${count} 条`, WIDTH - PAD, y)
  ctx.textAlign = 'left'
  y += 42
  ctx.fillStyle = INK
  ctx.font = `900 52px ${FONT_DISPLAY}`
  ctx.fillText(title, PAD, y)
  return y + 36
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
  await ensureReportFonts()
  const measure = document.createElement('canvas').getContext('2d')
  const contentW = WIDTH - PAD * 2
  const pickupH = measureList(measure, model.pickups, contentW)
  const repairH = measureList(measure, model.repairs, contentW)
  const handoverH = measureList(measure, model.handovers, contentW)

  // fixed header + sales block estimate + sections + footer + bottom safe
  const headerSalesH = 820
  const sectionHeads = 140 * (1 + (model.handovers.length || model.handovers ? 1 : 0) + 1)
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
  y += 28
  ctx.fillStyle = MUTED
  ctx.font = `700 18px ${FONT_MONO}`
  ctx.fillText('SALES / KPI', PAD, y)

  y += 28
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
    ctx.fillStyle = MUTED
    ctx.font = `600 18px ${FONT_MONO}`
    ctx.textAlign = 'left'
    ctx.fillText(label, cx + 28, subY + 42)
    ctx.fillStyle = INK
    ctx.font = `900 56px ${FONT_DISPLAY}`
    ctx.fillText(String(value), cx + 28, subY + 100)
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
