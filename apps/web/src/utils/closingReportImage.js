const WIDTH = 1242
const PAD = 56
const INK = '#08080a'
const INK_SOFT = '#272729'
const PAPER = '#f4f5f0'
const PAPER_COOL = '#e7e9de'
const LINE = '#c9cbc3'
const MUTED = '#62625e'
const SURFACE = '#fbfbfa'

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
    try {
      rules = sheet.cssRules
    } catch {
      continue
    }
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
      await new Promise((resolve) => requestAnimationFrame(() => resolve()))
      found = collectSiteFontUrls()
    }
    const faces = []
    const albertUrls = found.albert.length ? found.albert : ['/fonts/albert-sans-variable.woff2']
    for (const url of albertUrls) {
      faces.push(new FontFace('Albert Sans Local', `url('${url}') format('woff2')`, {
        style: 'normal', weight: '100 900', display: 'block'
      }))
    }
    if (!found.noto.length) throw new Error('无法读取网站中文字体，已拒绝使用手机字体。')
    for (const url of found.noto) {
      faces.push(new FontFace('Noto Serif SC Variable', `url('${url}') format('woff2-variations')`, {
        style: 'normal', weight: '200 900', display: 'block'
      }))
    }
    const loaded = await Promise.all(faces.map(async (face) => {
      try {
        const ready = await face.load()
        document.fonts.add(ready)
        return true
      } catch {
        return false
      }
    }))
    await document.fonts.ready.catch(() => undefined)
    await Promise.all([
      document.fonts.load(`900 72px ${FONT_DISPLAY}`),
      document.fonts.load(`700 28px ${FONT_MONO}`),
      document.fonts.load(`500 32px ${FONT_BODY}`),
      document.fonts.load('900 56px "Noto Serif SC Variable"'),
      document.fonts.load('500 32px "Noto Serif SC Variable"')
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

function measureList(ctx, items, width) {
  if (!items.length) return 96
  let h = 0
  for (const item of items) {
    h += 36
    ctx.font = `900 48px ${FONT_DISPLAY}`
    h += wrapText(ctx, item.title || '未命名', width - 12).length * 56
    h += 36
    const detail = item.detail || item.repairProject || ''
    if (detail) {
      ctx.font = `500 32px ${FONT_BODY}`
      h += wrapText(ctx, detail, width - 12).length * 42
    }
    const meta = [
      item.pickupDate ? `取车 ${item.pickupDate}` : '',
      item.repairType || '',
      item.meta || '',
      item.contactValue ? `${item.contactType === 'member' ? '会员' : '电话'} ${item.contactValue}` : ''
    ].filter(Boolean).join(' · ')
    if (meta) {
      ctx.font = `700 24px ${FONT_MONO}`
      h += wrapText(ctx, meta, width - 12).length * 34
    }
    h += 40
  }
  return h
}

function drawList(ctx, items, x, y, width, emptyLabel) {
  if (!items.length) {
    ctx.fillStyle = PAPER_COOL
    ctx.fillRect(x, y, width, 88)
    ctx.fillStyle = MUTED
    ctx.font = `700 28px ${FONT_MONO}`
    ctx.fillText(emptyLabel, x + 24, y + 54)
    return y + 112
  }
  let cursor = y
  items.forEach((item, index) => {
    drawInkLine(ctx, x, cursor, x + width, false)
    cursor += 40
    ctx.fillStyle = MUTED
    ctx.font = `700 24px ${FONT_MONO}`
    ctx.fillText(pad2(index + 1), x, cursor)
    ctx.fillStyle = INK
    ctx.font = `900 48px ${FONT_DISPLAY}`
    const titleLines = wrapText(ctx, item.title || '未命名', width - 72)
    titleLines.forEach((line, lineIndex) => {
      ctx.fillText(line, x + (lineIndex ? 0 : 64), cursor + lineIndex * 56)
    })
    cursor += Math.max(1, titleLines.length) * 56
    ctx.fillStyle = MUTED
    ctx.font = `700 26px ${FONT_MONO}`
    ctx.fillText(`STATUS · ${item.status || '进行中'}`, x, cursor)
    cursor += 36
    const detail = item.detail || item.repairProject || ''
    if (detail) {
      ctx.fillStyle = INK_SOFT
      ctx.font = `500 32px ${FONT_BODY}`
      wrapText(ctx, detail, width - 12).forEach((line) => {
        ctx.fillText(line, x, cursor)
        cursor += 42
      })
    }
    const meta = [
      item.pickupDate ? `取车 ${item.pickupDate}` : '',
      item.repairType || '',
      item.meta || '',
      item.contactValue ? `${item.contactType === 'member' ? '会员' : '电话'} ${item.contactValue}` : ''
    ].filter(Boolean).join(' · ')
    if (meta) {
      ctx.fillStyle = MUTED
      ctx.font = `700 24px ${FONT_MONO}`
      wrapText(ctx, meta, width - 12).forEach((line) => {
        ctx.fillText(line, x, cursor)
        cursor += 34
      })
    }
    cursor += 28
  })
  drawInkLine(ctx, x, cursor, x + width, false)
  return cursor + 28
}

function drawSectionHead(ctx, y, en, title, countLabel) {
  drawInkLine(ctx, PAD, y, WIDTH - PAD, true)
  y += 44
  ctx.fillStyle = MUTED
  ctx.font = `700 24px ${FONT_MONO}`
  ctx.fillText(en, PAD, y)
  if (countLabel) {
    ctx.textAlign = 'right'
    ctx.fillText(countLabel, WIDTH - PAD, y)
    ctx.textAlign = 'left'
  }
  y += 62
  ctx.fillStyle = INK
  ctx.font = `900 64px ${FONT_DISPLAY}`
  ctx.fillText(title, PAD, y)
  return y + 48
}

export async function renderClosingReportCanvas(model) {
  await ensureReportFonts()
  const measure = document.createElement('canvas').getContext('2d')
  const contentW = WIDTH - PAD * 2
  // stacked single-column lists for readability (long image OK)
  const pickupH = measureList(measure, model.pickups, contentW)
  const repairH = measureList(measure, model.repairs, contentW)
  const handoverH = measureList(measure, model.handovers, contentW)
  const height = Math.ceil(320 + 360 + pickupH + repairH + handoverH + 420)

  const canvas = document.createElement('canvas')
  canvas.width = WIDTH
  canvas.height = height
  const ctx = canvas.getContext('2d')

  ctx.fillStyle = PAPER_COOL
  ctx.fillRect(0, 0, WIDTH, height)
  ctx.fillStyle = PAPER
  ctx.fillRect(20, 20, WIDTH - 40, height - 40)

  // masthead
  ctx.fillStyle = INK
  ctx.font = `900 84px ${FONT_DISPLAY}`
  ctx.fillText('WORKSHOP OPS', PAD, 96)
  ctx.fillStyle = INK
  ctx.fillRect(WIDTH - PAD - 190, 48, 190, 62)
  ctx.fillStyle = '#fff'
  ctx.font = `900 36px ${FONT_DISPLAY}`
  ctx.fillText(`V${model.appVersion || '—'}`, WIDTH - PAD - 164, 90)

  ctx.fillStyle = MUTED
  ctx.font = `700 26px ${FONT_MONO}`
  ctx.fillText(`${model.storeName} · ${model.businessDate} · DATABASE SYNC`, PAD, 148)
  drawInkLine(ctx, PAD, 176, WIDTH - PAD, true)

  ctx.fillStyle = INK
  ctx.font = `900 78px ${FONT_DISPLAY}`
  ctx.fillText('CLOSING COMPLETE', PAD, 260)
  const closedLabel = model.closedAt
    ? new Intl.DateTimeFormat('zh-CN', { hour: '2-digit', minute: '2-digit' }).format(new Date(model.closedAt))
    : '--:--'
  ctx.fillStyle = MUTED
  ctx.font = `500 30px ${FONT_BODY}`
  ctx.fillText(
    `已闭店 ${closedLabel}  ·  导出 ${new Intl.DateTimeFormat('zh-CN', { hour: '2-digit', minute: '2-digit' }).format(new Date())}  ·  ${model.exporterName || '同事'}`,
    PAD,
    312
  )

  // KPI
  let y = 360
  y = drawSectionHead(ctx, y, 'SALES / KPI · 当日闭店门槛', '销售数据', '')
  const metrics = [
    ['车辆销售', model.kpi.salesVehicles],
    ['安全检查', model.kpi.safetyChecks],
    ['有效评价', model.kpi.validReviews],
    ['二手售出', model.kpi.usedSold],
    ['二手收车', model.kpi.usedReceived]
  ]
  const boxW = (contentW - 20 * 4) / 5
  metrics.forEach(([label, value], index) => {
    const x = PAD + index * (boxW + 20)
    const dark = index === 0
    ctx.fillStyle = dark ? INK : SURFACE
    ctx.fillRect(x, y, boxW, 190)
    ctx.strokeStyle = INK
    ctx.lineWidth = 3
    ctx.strokeRect(x + 1.5, y + 1.5, boxW - 3, 187)
    ctx.fillStyle = dark ? '#fff' : INK
    ctx.font = `900 72px ${FONT_DISPLAY}`
    ctx.fillText(String(value), x + 18, y + 100)
    ctx.fillStyle = dark ? 'rgba(255,255,255,0.76)' : MUTED
    ctx.font = `700 24px ${FONT_MONO}`
    ctx.fillText(label, x + 18, y + 148)
  })
  y += 220
  if (model.kpi.safetyModel) {
    ctx.fillStyle = MUTED
    ctx.font = `700 26px ${FONT_MONO}`
    ctx.fillText(`安检车型 · ${model.kpi.safetyModel}`, PAD, y)
    y += 36
  }

  // stacked open ledgers
  y = drawSectionHead(ctx, y + 24, `PICKUP · ${pad2(model.pickups.length)} OPEN`, '待取车辆', `${model.pickups.length} 条`)
  y = drawList(ctx, model.pickups, PAD, y, contentW, '本日无待取车辆')

  y = drawSectionHead(ctx, y + 16, `REPAIR · ${pad2(model.repairs.length)} OPEN`, '维修车辆', `${model.repairs.length} 条`)
  y = drawList(ctx, model.repairs, PAD, y, contentW, '本日无维修车辆')

  y = drawSectionHead(ctx, y + 16, `HANDOVER · ${pad2(model.handovers.length)} OPEN`, '交接事项', `${model.handovers.length} 条`)
  y = drawList(ctx, model.handovers, PAD, y, contentW, '本日无交接事项')

  y = Math.max(y + 28, height - 120)
  drawInkLine(ctx, PAD, y, WIDTH - PAD, true)
  ctx.fillStyle = MUTED
  ctx.font = `700 24px ${FONT_MONO}`
  ctx.fillText('LOOKBOOK STYLE · SITE FONTS ONLY · LONG SHEET', PAD, y + 48)
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

  // Prefer direct download first (avoid system share sheet as the only path).
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
