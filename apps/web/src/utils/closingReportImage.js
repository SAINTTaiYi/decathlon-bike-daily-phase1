const WIDTH = 1242
const PAD = 56
const INK = '#08080a'
const INK_SOFT = '#272729'
const PAPER = '#f4f5f0'
const PAPER_COOL = '#e7e9de'
const LINE = '#c9cbc3'
const MUTED = '#62625e'
const SURFACE = '#ffffff'

const FONT_BODY = '"Albert Sans Local", "Noto Serif SC Variable"'
const FONT_DISPLAY = '"Albert Sans Local", "Noto Serif SC Variable"'
const FONT_MONO = '"Albert Sans Local", "Noto Serif SC Variable"'

// Vertical rhythm (px) — clear air around rules / status / callouts / chips
const GAP = {
  afterRule: 44,
  sectionEnToTitle: 32,
  titleToBody: 52,
  statusToDetail: 40,
  detailToFacts: 44,
  factsToMeta: 40,
  metaToNext: 48,
  ticketPadTop: 52,
  ticketPadBottom: 64,
  betweenSections: 64,
  bottomSafe: 280,
  calloutH: 118,
  calloutInnerPad: 22
}

let fontsReadyPromise

function pad2(value) {
  return String(value ?? 0).padStart(2, '0')
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
      document.fonts.load(`900 72px ${FONT_DISPLAY}`),
      document.fonts.load(`700 26px ${FONT_MONO}`),
      document.fonts.load(`500 30px ${FONT_BODY}`),
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

function drawInkLine(ctx, x1, y, x2, strong = true) {
  ctx.strokeStyle = strong ? INK : LINE
  ctx.lineWidth = strong ? 3 : 2
  ctx.beginPath()
  ctx.moveTo(x1, y + 0.5)
  ctx.lineTo(x2, y + 0.5)
  ctx.stroke()
}

function drawCallout(ctx, x, y, w, label, value, align = 'left') {
  const h = GAP.calloutH
  ctx.fillStyle = SURFACE
  ctx.fillRect(x, y, w, h)
  ctx.strokeStyle = INK
  ctx.lineWidth = 3
  ctx.strokeRect(x + 2, y + 2, w - 4, h - 4)
  ctx.fillStyle = MUTED
  ctx.font = `800 20px ${FONT_MONO}`
  ctx.textAlign = align === 'right' ? 'right' : 'left'
  const tx = align === 'right' ? x + w - GAP.calloutInnerPad : x + GAP.calloutInnerPad
  ctx.fillText(label, tx, y + 38)
  ctx.fillStyle = INK
  ctx.font = `900 34px ${FONT_DISPLAY}`
  const lines = wrapText(ctx, value || '—', w - GAP.calloutInnerPad * 2)
  lines.slice(0, 2).forEach((line, i) => {
    ctx.fillText(line, tx, y + 78 + i * 28)
  })
  ctx.textAlign = 'left'
  return h
}

function measureTicket(ctx, item, width) {
  let h = GAP.ticketPadTop + GAP.afterRule
  ctx.font = `900 48px ${FONT_DISPLAY}`
  const titleLines = wrapText(ctx, item.title || '未命名', width - 96)
  h += Math.max(1, titleLines.length) * 56 + GAP.titleToBody
  // status chip
  h += 44 + GAP.statusToDetail
  const detail = item.detail || item.repairProject || ''
  if (detail) {
    ctx.font = `500 30px ${FONT_BODY}`
    h += wrapText(ctx, detail, width - 16).length * 42 + GAP.detailToFacts
  } else {
    h += Math.floor(GAP.detailToFacts * 0.5)
  }
  const contactValue = String(item.contactValue || '').trim()
  const pickupDate = String(item.pickupDate || '').trim()
  if (pickupDate || contactValue) {
    h += GAP.calloutH + GAP.factsToMeta
  }
  const chips = [item.repairType || '', item.meta || ''].filter(Boolean)
  if (chips.length) h += 36 + 16
  h += GAP.ticketPadBottom
  return h
}

function measureList(ctx, items, width) {
  if (!items.length) return 120
  return items.reduce((sum, item) => sum + measureTicket(ctx, item, width), 0)
}

function drawTicket(ctx, item, x, y, width, index) {
  y += GAP.ticketPadTop
  drawInkLine(ctx, x, y, x + width, false)
  y += GAP.afterRule

  ctx.fillStyle = MUTED
  ctx.font = `700 24px ${FONT_MONO}`
  ctx.fillText(pad2(index + 1), x, y + 6)
  ctx.fillStyle = INK
  ctx.font = `900 48px ${FONT_DISPLAY}`
  const titleLines = wrapText(ctx, item.title || '未命名', width - 96)
  titleLines.forEach((line, i) => ctx.fillText(line, x + 72, y + i * 56))
  y += Math.max(1, titleLines.length) * 56 + GAP.titleToBody

  const status = item.status || '进行中'
  ctx.font = `800 22px ${FONT_MONO}`
  const statusText = `STATUS · ${status}`
  const sw = ctx.measureText(statusText).width + 32
  const chipTop = y
  ctx.strokeStyle = INK
  ctx.lineWidth = 2
  ctx.strokeRect(x, chipTop, sw, 44)
  ctx.fillStyle = INK
  ctx.fillText(statusText, x + 16, chipTop + 30)
  y = chipTop + 44 + GAP.statusToDetail

  const detail = item.detail || item.repairProject || ''
  if (detail) {
    ctx.fillStyle = INK_SOFT
    ctx.font = `500 30px ${FONT_BODY}`
    wrapText(ctx, detail, width - 16).forEach((line) => {
      ctx.fillText(line, x, y)
      y += 42
    })
    y += GAP.detailToFacts
  } else {
    y += Math.floor(GAP.detailToFacts * 0.5)
  }

  const contactLabel = item.contactType === 'member' ? '会员号' : '手机号'
  const contactValue = String(item.contactValue || '').trim()
  const pickupDate = String(item.pickupDate || '').trim()
  if (pickupDate || contactValue) {
    const gap = 28
    if (pickupDate && contactValue) {
      const leftW = Math.floor((width - gap) * 0.48)
      const rightW = width - gap - leftW
      drawCallout(ctx, x, y, leftW, contactLabel, contactValue, 'left')
      drawCallout(ctx, x + leftW + gap, y, rightW, '取车时间', pickupDate.replaceAll('-', ' / '), 'right')
    } else if (contactValue) {
      drawCallout(ctx, x, y, Math.min(width, 480), contactLabel, contactValue, 'left')
    } else {
      const w = Math.min(width, 480)
      drawCallout(ctx, x + width - w, y, w, '取车时间', pickupDate.replaceAll('-', ' / '), 'right')
    }
    y += GAP.calloutH + GAP.factsToMeta
  }

  const chips = [item.repairType || '', item.meta || ''].filter(Boolean)
  if (chips.length) {
    ctx.fillStyle = MUTED
    ctx.font = `700 22px ${FONT_MONO}`
    ctx.fillText(chips.join('  ·  '), x, y)
    y += 36 + 16
  }

  y += GAP.ticketPadBottom
  return y
}

function drawList(ctx, items, x, y, width, emptyLabel) {
  if (!items.length) {
    y += 24
    ctx.fillStyle = PAPER_COOL
    ctx.fillRect(x, y, width, 96)
    ctx.fillStyle = MUTED
    ctx.font = `700 26px ${FONT_MONO}`
    ctx.fillText(emptyLabel, x + 28, y + 58)
    return y + 120
  }
  items.forEach((item, index) => {
    y = drawTicket(ctx, item, x, y, width, index)
  })
  y += 12
  drawInkLine(ctx, x, y, x + width, false)
  return y + 28
}

function drawSectionHead(ctx, y, en, title, countLabel) {
  y += GAP.betweenSections
  drawInkLine(ctx, PAD, y, WIDTH - PAD, true)
  y += GAP.afterRule + 8
  ctx.fillStyle = MUTED
  ctx.font = `700 24px ${FONT_MONO}`
  ctx.fillText(en, PAD, y)
  if (countLabel) {
    ctx.textAlign = 'right'
    ctx.fillText(countLabel, WIDTH - PAD, y)
    ctx.textAlign = 'left'
  }
  y += GAP.sectionEnToTitle + 36
  ctx.fillStyle = INK
  ctx.font = `900 64px ${FONT_DISPLAY}`
  ctx.fillText(title, PAD, y)
  return y + GAP.titleToBody + 8
}

export async function renderClosingReportCanvas(model) {
  await ensureReportFonts()
  const measure = document.createElement('canvas').getContext('2d')
  const contentW = WIDTH - PAD * 2
  const pickupH = measureList(measure, model.pickups, contentW)
  const repairH = measureList(measure, model.repairs, contentW)
  const handoverH = measureList(measure, model.handovers, contentW)

  // Sales section vertical visual weights 3:2:1:1 (label band : title : metrics : note)
  // Keep sales compact; list sections grow with content.
  const salesBlockH = 300
  const headerH = 200
  const finalHeight = Math.ceil(
    headerH + salesBlockH + pickupH + repairH + handoverH + GAP.betweenSections * 3 + GAP.bottomSafe + 240
  )

  const canvas = document.createElement('canvas')
  canvas.width = WIDTH
  canvas.height = finalHeight
  const ctx = canvas.getContext('2d')

  ctx.fillStyle = PAPER_COOL
  ctx.fillRect(0, 0, WIDTH, finalHeight)
  ctx.fillStyle = PAPER
  ctx.fillRect(18, 18, WIDTH - 36, finalHeight - 36)

  // masthead
  ctx.fillStyle = INK
  ctx.font = `900 80px ${FONT_DISPLAY}`
  ctx.fillText('WORKSHOP OPS', PAD, 96)
  ctx.fillRect(WIDTH - PAD - 190, 46, 190, 60)
  ctx.fillStyle = '#fff'
  ctx.font = `900 34px ${FONT_DISPLAY}`
  ctx.fillText(`V${model.appVersion || '—'}`, WIDTH - PAD - 164, 88)

  ctx.fillStyle = MUTED
  ctx.font = `700 24px ${FONT_MONO}`
  ctx.fillText(`${model.storeName} · ${model.businessDate} · DATABASE SYNC`, PAD, 148)
  // breathing under meta before rule
  drawInkLine(ctx, PAD, 184, WIDTH - PAD, true)

  // sales — moderate, ratio-friendly 3-weight unit
  let y = 184 + GAP.afterRule + 12
  ctx.fillStyle = INK
  ctx.font = `900 64px ${FONT_DISPLAY}`
  ctx.fillText('CLOSING COMPLETE', PAD, y + 52)
  const closedLabel = model.closedAt
    ? new Intl.DateTimeFormat('zh-CN', { hour: '2-digit', minute: '2-digit' }).format(new Date(model.closedAt))
    : '--:--'
  ctx.fillStyle = MUTED
  ctx.font = `500 28px ${FONT_BODY}`
  ctx.fillText(
    `已闭店 ${closedLabel}  ·  导出 ${new Intl.DateTimeFormat('zh-CN', { hour: '2-digit', minute: '2-digit' }).format(new Date())}  ·  ${model.exporterName || '同事'}`,
    PAD,
    y + 100
  )

  // Sales vertical stack weights 3:2:1:1 → label(3) title(2) metrics(1) note(1) of a compact unit
  const salesUnit = 22
  y += 120
  // weight 3 — label band
  ctx.fillStyle = MUTED
  ctx.font = `700 20px ${FONT_MONO}`
  ctx.fillText('SALES / KPI · 当日闭店门槛', PAD, y)
  y += salesUnit * 3

  // weight 2 — section title (kept smaller than list section titles)
  ctx.fillStyle = INK
  ctx.font = `900 42px ${FONT_DISPLAY}`
  ctx.fillText('销售数据', PAD, y)
  y += salesUnit * 2 + 18

  // weight 1 — metric row (equal cells, modest numbers — not a hero banner)
  const metrics = [
    ['车辆销售', model.kpi.salesVehicles],
    ['安全检查', model.kpi.safetyChecks],
    ['有效评价', model.kpi.validReviews],
    ['二手售出', model.kpi.usedSold],
    ['二手收车', model.kpi.usedReceived]
  ]
  const gap = 14
  const boxH = 108
  const cellW = (contentW - gap * (metrics.length - 1)) / metrics.length
  let x = PAD
  metrics.forEach(([label, value], index) => {
    const dark = index === 0
    ctx.fillStyle = dark ? INK : SURFACE
    ctx.fillRect(x, y, cellW, boxH)
    ctx.strokeStyle = INK
    ctx.lineWidth = 2
    ctx.strokeRect(x + 1, y + 1, cellW - 2, boxH - 2)
    ctx.fillStyle = dark ? '#fff' : INK
    ctx.font = `900 40px ${FONT_DISPLAY}`
    ctx.fillText(String(value), x + 14, y + 52)
    ctx.fillStyle = dark ? 'rgba(255,255,255,0.72)' : MUTED
    ctx.font = `700 18px ${FONT_MONO}`
    ctx.fillText(label, x + 14, y + 84)
    x += cellW + gap
  })
  y += boxH + salesUnit * 1

  // weight 1 — note / safety model
  if (model.kpi.safetyModel) {
    ctx.fillStyle = MUTED
    ctx.font = `700 22px ${FONT_MONO}`
    ctx.fillText(`安检车型 · ${model.kpi.safetyModel}`, PAD, y)
    y += salesUnit * 1 + 12
  } else {
    y += 8
  }

  // sections
  y = drawSectionHead(ctx, y, `PICKUP · ${pad2(model.pickups.length)} OPEN`, '待取车辆', `${model.pickups.length} 条`)
  y = drawList(ctx, model.pickups, PAD, y, contentW, '本日无待取车辆')

  y = drawSectionHead(ctx, y, `REPAIR · ${pad2(model.repairs.length)} OPEN`, '维修车辆', `${model.repairs.length} 条`)
  y = drawList(ctx, model.repairs, PAD, y, contentW, '本日无维修车辆')

  y = drawSectionHead(ctx, y, `HANDOVER · ${pad2(model.handovers.length)} OPEN`, '交接事项', `${model.handovers.length} 条`)
  y = drawList(ctx, model.handovers, PAD, y, contentW, '本日无交接事项')

  // bottom safe area so last ticket / footer stay clear of image edge
  y += 40
  drawInkLine(ctx, PAD, y, WIDTH - PAD, true)
  ctx.fillStyle = MUTED
  ctx.font = `700 22px ${FONT_MONO}`
  ctx.fillText('TICKET STYLE · SITE FONTS ONLY · LONG SHEET', PAD, y + 52)
  ctx.textAlign = 'right'
  ctx.fillText(String(model.storeName || ''), WIDTH - PAD, y + 52)
  ctx.textAlign = 'left'

  // ensure canvas has bottom padding beyond footer text
  const needed = y + GAP.bottomSafe
  if (needed > finalHeight) {
    // grow canvas if underestimate
    const bigger = document.createElement('canvas')
    bigger.width = WIDTH
    bigger.height = needed
    const bctx = bigger.getContext('2d')
    bctx.fillStyle = PAPER_COOL
    bctx.fillRect(0, 0, WIDTH, needed)
    bctx.drawImage(canvas, 0, 0)
    // redraw footer area already on image; just return taller with cool paper bottom
    return bigger
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
