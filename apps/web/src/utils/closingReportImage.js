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
      document.fonts.load(`900 84px ${FONT_DISPLAY}`),
      document.fonts.load(`700 28px ${FONT_MONO}`),
      document.fonts.load(`500 32px ${FONT_BODY}`),
      document.fonts.load('900 56px "Noto Serif SC Variable"')
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
  const h = 92
  ctx.fillStyle = SURFACE
  ctx.strokeStyle = INK
  ctx.lineWidth = 4
  ctx.fillRect(x, y, w, h)
  ctx.strokeRect(x + 2, y + 2, w - 4, h - 4)
  ctx.fillStyle = MUTED
  ctx.font = `800 20px ${FONT_MONO}`
  ctx.textAlign = align
  const tx = align === 'right' ? x + w - 16 : x + 16
  ctx.fillText(label, tx, y + 30)
  ctx.fillStyle = INK
  ctx.font = `900 34px ${FONT_DISPLAY}`
  const lines = wrapText(ctx, value || '—', w - 32)
  lines.slice(0, 2).forEach((line, i) => {
    ctx.fillText(line, tx, y + 62 + i * 28)
  })
  ctx.textAlign = 'left'
  return h
}

function measureTicket(ctx, item, width) {
  let h = 48 // top padding after divider breathing
  ctx.font = `900 50px ${FONT_DISPLAY}`
  h += wrapText(ctx, item.title || '未命名', width - 90).length * 58
  h += 40 // status
  const detail = item.detail || item.repairProject || ''
  if (detail) {
    ctx.font = `500 30px ${FONT_BODY}`
    h += wrapText(ctx, detail, width - 16).length * 40 + 12
  }
  // facts row breathing + callouts
  const hasFacts = Boolean(item.pickupDate || item.contactValue)
  h += hasFacts ? 120 : 28
  // meta chips
  const chips = [
    item.repairType || '',
    item.meta || '',
    item.scene === 'pickup' && item.pickupSource ? `来源 ${item.pickupSource}` : ''
  ].filter(Boolean)
  if (chips.length) h += 42
  h += 36 // bottom padding
  return h
}

function measureList(ctx, items, width) {
  if (!items.length) return 110
  return items.reduce((sum, item) => sum + measureTicket(ctx, item, width), 0)
}

function drawTicket(ctx, item, x, y, width, index) {
  // breathing before hairline
  y += 28
  drawInkLine(ctx, x, y, x + width, false)
  y += 42

  // index + title
  ctx.fillStyle = MUTED
  ctx.font = `700 24px ${FONT_MONO}`
  ctx.fillText(pad2(index + 1), x, y + 8)
  ctx.fillStyle = INK
  ctx.font = `900 50px ${FONT_DISPLAY}`
  const titleLines = wrapText(ctx, item.title || '未命名', width - 90)
  titleLines.forEach((line, i) => ctx.fillText(line, x + 70, y + i * 58))
  y += Math.max(1, titleLines.length) * 58 + 18

  // status chip
  const status = item.status || '进行中'
  ctx.font = `800 22px ${FONT_MONO}`
  const statusText = `STATUS · ${status}`
  const sw = ctx.measureText(statusText).width + 24
  ctx.strokeStyle = INK
  ctx.lineWidth = 2
  ctx.strokeRect(x, y - 22, sw, 36)
  ctx.fillStyle = INK
  ctx.fillText(statusText, x + 12, y)
  y += 40

  const detail = item.detail || item.repairProject || ''
  if (detail) {
    ctx.fillStyle = INK_SOFT
    ctx.font = `500 30px ${FONT_BODY}`
    wrapText(ctx, detail, width - 16).forEach((line) => {
      ctx.fillText(line, x, y)
      y += 40
    })
    y += 12
  }

  // highlighted facts: pickup date + phone/member
  const contactLabel = item.contactType === 'member' ? '会员号' : '手机号'
  const contactValue = String(item.contactValue || '').trim()
  const pickupDate = String(item.pickupDate || '').trim()
  if (pickupDate || contactValue) {
    y += 12
    const gap = 20
    if (pickupDate && contactValue) {
      const leftW = Math.floor((width - gap) * 0.48)
      const rightW = width - gap - leftW
      drawCallout(ctx, x, y, leftW, contactLabel, contactValue, 'left')
      drawCallout(ctx, x + leftW + gap, y, rightW, '取车时间', pickupDate.replaceAll('-', ' / '), 'right')
    } else if (contactValue) {
      drawCallout(ctx, x, y, Math.min(width, 420), contactLabel, contactValue, 'left')
    } else {
      drawCallout(ctx, x + width - Math.min(width, 420), y, Math.min(width, 420), '取车时间', pickupDate.replaceAll('-', ' / '), 'right')
    }
    y += 110
  } else {
    y += 18
  }

  // secondary meta chips
  const chips = [
    item.repairType || '',
    item.meta || ''
  ].filter(Boolean)
  if (chips.length) {
    ctx.fillStyle = MUTED
    ctx.font = `700 22px ${FONT_MONO}`
    ctx.fillText(chips.join('  ·  '), x, y)
    y += 34
  }

  y += 18
  return y
}

function drawList(ctx, items, x, y, width, emptyLabel) {
  if (!items.length) {
    y += 28
    ctx.fillStyle = PAPER_COOL
    ctx.fillRect(x, y, width, 88)
    ctx.fillStyle = MUTED
    ctx.font = `700 26px ${FONT_MONO}`
    ctx.fillText(emptyLabel, x + 24, y + 54)
    return y + 120
  }
  items.forEach((item, index) => {
    y = drawTicket(ctx, item, x, y, width, index)
  })
  drawInkLine(ctx, x, y, x + width, false)
  return y + 24
}

function drawSectionHead(ctx, y, en, title, countLabel) {
  // more breathing above thick rule
  y += 18
  drawInkLine(ctx, PAD, y, WIDTH - PAD, true)
  y += 52
  ctx.fillStyle = MUTED
  ctx.font = `700 24px ${FONT_MONO}`
  ctx.fillText(en, PAD, y)
  if (countLabel) {
    ctx.textAlign = 'right'
    ctx.fillText(countLabel, WIDTH - PAD, y)
    ctx.textAlign = 'left'
  }
  y += 66
  ctx.fillStyle = INK
  ctx.font = `900 68px ${FONT_DISPLAY}`
  ctx.fillText(title, PAD, y)
  return y + 56
}

export async function renderClosingReportCanvas(model) {
  await ensureReportFonts()
  const measure = document.createElement('canvas').getContext('2d')
  const contentW = WIDTH - PAD * 2
  const pickupH = measureList(measure, model.pickups, contentW)
  const repairH = measureList(measure, model.repairs, contentW)
  const handoverH = measureList(measure, model.handovers, contentW)

  // Target sales block ~1/4 of final page height. First estimate body then size sales block.
  const bodyEstimate = 360 + pickupH + repairH + handoverH + 280
  const salesTarget = Math.max(420, Math.round(bodyEstimate / 3)) // sales + header together ~1/4 after composition
  const height = Math.ceil(Math.max(bodyEstimate + salesTarget * 0.15, (bodyEstimate) * 4 / 3))

  // Recompute so sales block is ~25% of total canvas
  const salesBlockH = Math.max(460, Math.round(height * 0.25))
  const finalHeight = Math.ceil(salesBlockH + pickupH + repairH + handoverH + 420)

  const canvas = document.createElement('canvas')
  canvas.width = WIDTH
  canvas.height = finalHeight
  const ctx = canvas.getContext('2d')

  // page + sheet
  ctx.fillStyle = PAPER_COOL
  ctx.fillRect(0, 0, WIDTH, finalHeight)
  ctx.fillStyle = PAPER
  ctx.fillRect(18, 18, WIDTH - 36, finalHeight - 36)

  // header
  ctx.fillStyle = INK
  ctx.font = `900 86px ${FONT_DISPLAY}`
  ctx.fillText('WORKSHOP OPS', PAD, 100)
  ctx.fillRect(WIDTH - PAD - 200, 48, 200, 66)
  ctx.fillStyle = '#fff'
  ctx.font = `900 36px ${FONT_DISPLAY}`
  ctx.fillText(`V${model.appVersion || '—'}`, WIDTH - PAD - 172, 94)

  ctx.fillStyle = MUTED
  ctx.font = `700 26px ${FONT_MONO}`
  ctx.fillText(`${model.storeName} · ${model.businessDate} · DATABASE SYNC`, PAD, 156)
  // breathing before first rule
  drawInkLine(ctx, PAD, 188, WIDTH - PAD, true)

  // sales region starts and occupies ~1/4 page
  const salesTop = 220
  const salesBottom = salesTop + salesBlockH
  // soft panel for sales quarter
  ctx.fillStyle = SURFACE
  ctx.fillRect(PAD - 8, salesTop - 8, contentW + 16, salesBlockH)

  ctx.fillStyle = INK
  ctx.font = `900 78px ${FONT_DISPLAY}`
  ctx.fillText('CLOSING COMPLETE', PAD, salesTop + 70)
  const closedLabel = model.closedAt
    ? new Intl.DateTimeFormat('zh-CN', { hour: '2-digit', minute: '2-digit' }).format(new Date(model.closedAt))
    : '--:--'
  ctx.fillStyle = MUTED
  ctx.font = `500 30px ${FONT_BODY}`
  ctx.fillText(
    `已闭店 ${closedLabel}  ·  导出 ${new Intl.DateTimeFormat('zh-CN', { hour: '2-digit', minute: '2-digit' }).format(new Date())}  ·  ${model.exporterName || '同事'}`,
    PAD,
    salesTop + 122
  )

  // sales title
  ctx.fillStyle = MUTED
  ctx.font = `700 24px ${FONT_MONO}`
  ctx.fillText('SALES / KPI · 当日闭店门槛', PAD, salesTop + 180)
  ctx.fillStyle = INK
  ctx.font = `900 64px ${FONT_DISPLAY}`
  ctx.fillText('销售数据', PAD, salesTop + 248)

  // big primary sales figure like site kpi-primary
  const primaryH = Math.max(210, salesBottom - (salesTop + 290) - 70)
  const primaryY = salesTop + 280
  ctx.fillStyle = INK
  ctx.fillRect(PAD, primaryY, contentW, primaryH)
  ctx.fillStyle = 'rgba(255,255,255,0.72)'
  ctx.font = `700 26px ${FONT_MONO}`
  ctx.fillText('VEHICLES SOLD · 车辆销售', PAD + 28, primaryY + 46)
  ctx.fillStyle = '#fff'
  ctx.font = `900 ${Math.min(180, primaryH * 0.72)}px ${FONT_DISPLAY}`
  ctx.fillText(String(model.kpi.salesVehicles), PAD + 20, primaryY + primaryH - 48)

  // secondary metrics strip under primary if room, else overlapping bottom band
  const secondary = [
    ['安全检查', model.kpi.safetyChecks],
    ['有效评价', model.kpi.validReviews],
    ['二手售出', model.kpi.usedSold],
    ['二手收车', model.kpi.usedReceived]
  ]
  const bandY = primaryY + primaryH + 18
  const cellW = contentW / 4
  secondary.forEach(([label, value], i) => {
    const x = PAD + i * cellW
    drawInkLine(ctx, x, bandY, x + cellW - 16, false)
    ctx.fillStyle = MUTED
    ctx.font = `700 22px ${FONT_MONO}`
    ctx.fillText(label, x, bandY + 36)
    ctx.fillStyle = INK
    ctx.font = `900 48px ${FONT_DISPLAY}`
    ctx.fillText(String(value), x, bandY + 90)
  })
  if (model.kpi.safetyModel) {
    ctx.fillStyle = MUTED
    ctx.font = `700 24px ${FONT_MONO}`
    ctx.fillText(`安检车型 · ${model.kpi.safetyModel}`, PAD, Math.min(salesBottom - 24, bandY + 130))
  }

  // tickets
  let y = salesBottom + 24
  y = drawSectionHead(ctx, y, `PICKUP · ${pad2(model.pickups.length)} OPEN`, '待取车辆', `${model.pickups.length} 条`)
  y = drawList(ctx, model.pickups, PAD, y, contentW, '本日无待取车辆')

  y = drawSectionHead(ctx, y, `REPAIR · ${pad2(model.repairs.length)} OPEN`, '维修车辆', `${model.repairs.length} 条`)
  y = drawList(ctx, model.repairs, PAD, y, contentW, '本日无维修车辆')

  y = drawSectionHead(ctx, y, `HANDOVER · ${pad2(model.handovers.length)} OPEN`, '交接事项', `${model.handovers.length} 条`)
  y = drawList(ctx, model.handovers, PAD, y, contentW, '本日无交接事项')

  y = Math.max(y + 20, finalHeight - 120)
  drawInkLine(ctx, PAD, y, WIDTH - PAD, true)
  ctx.fillStyle = MUTED
  ctx.font = `700 24px ${FONT_MONO}`
  ctx.fillText('TICKET STYLE · SITE FONTS ONLY · LONG SHEET', PAD, y + 48)
  ctx.textAlign = 'right'
  ctx.fillText(String(model.storeName || ''), WIDTH - PAD, y + 48)
  ctx.textAlign = 'left'

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
