const WIDTH = 1080
const PAD = 48
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
  return {
    albert: [...albert],
    noto: [...noto]
  }
}

async function ensureReportFonts() {
  if (fontsReadyPromise) return fontsReadyPromise
  fontsReadyPromise = (async () => {
    const found = collectSiteFontUrls()
    const faces = []
    const albertUrls = found.albert.length ? found.albert : ['/fonts/albert-sans-variable.woff2']
    for (const url of albertUrls) {
      faces.push(new FontFace('Albert Sans Local', `url('${url}') format('woff2')`, {
        style: 'normal',
        weight: '100 900',
        display: 'block'
      }))
    }

    // Prefer exact site stylesheet slices so CJK uses website font, not phone font.
    let notoUrls = found.noto
    if (!notoUrls.length) {
      // Same-origin stylesheet parsing failed; load the complete published set by probing public directory is not available,
      // so require stylesheet injection: wait one frame and re-scan.
      await new Promise((resolve) => requestAnimationFrame(() => resolve()))
      notoUrls = collectSiteFontUrls().noto
    }
    if (!notoUrls.length) {
      throw new Error('无法读取网站 Noto Serif SC 字体文件，拒绝回退到手机字体。')
    }
    for (const url of notoUrls) {
      faces.push(new FontFace('Noto Serif SC Variable', `url('${url}') format('woff2-variations')`, {
        style: 'normal',
        weight: '200 900',
        display: 'block'
      }))
    }

    const results = await Promise.all(faces.map(async (face) => {
      try {
        const loaded = await face.load()
        document.fonts.add(loaded)
        return true
      } catch {
        return false
      }
    }))
    await document.fonts.ready.catch(() => undefined)
    await Promise.all([
      document.fonts.load(`900 64px ${FONT_DISPLAY}`),
      document.fonts.load(`700 22px ${FONT_MONO}`),
      document.fonts.load(`500 24px ${FONT_BODY}`),
      document.fonts.load(`900 48px "Noto Serif SC Variable"`),
      document.fonts.load(`500 24px "Noto Serif SC Variable"`)
    ])
    if (!results.some(Boolean)) throw new Error('站点字体加载失败。')
    // Verify Chinese text is not missing glyphs by measuring against a known loaded family name.
    const probe = document.createElement('canvas').getContext('2d')
    probe.font = `700 40px ${FONT_DISPLAY}`
    if (probe.measureText('闭店日报').width < 8) {
      throw new Error('网站中文字体未就绪。')
    }
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
  ctx.lineWidth = strong ? 2 : 1
  ctx.beginPath()
  ctx.moveTo(x1, y + 0.5)
  ctx.lineTo(x2, y + 0.5)
  ctx.stroke()
}

function measureList(ctx, items, width) {
  if (!items.length) return 72
  let h = 0
  for (const item of items) {
    h += 26
    ctx.font = `900 34px ${FONT_DISPLAY}`
    h += wrapText(ctx, item.title || '未命名', width - 8).length * 40
    h += 26
    const detail = item.detail || item.repairProject || ''
    if (detail) {
      ctx.font = `500 22px ${FONT_BODY}`
      h += wrapText(ctx, detail, width - 8).length * 30
    }
    const meta = [
      item.pickupDate ? `取车 ${item.pickupDate}` : '',
      item.repairType || '',
      item.meta || '',
      item.contactValue ? `${item.contactType === 'member' ? '会员' : '电话'} ${item.contactValue}` : ''
    ].filter(Boolean).join(' · ')
    if (meta) {
      ctx.font = `700 16px ${FONT_MONO}`
      h += wrapText(ctx, meta, width - 8).length * 24
    }
    h += 26
  }
  return h
}

function drawList(ctx, items, x, y, width, emptyLabel) {
  if (!items.length) {
    ctx.fillStyle = PAPER_COOL
    ctx.fillRect(x, y, width, 64)
    ctx.fillStyle = MUTED
    ctx.font = `700 18px ${FONT_MONO}`
    ctx.fillText(emptyLabel, x + 18, y + 38)
    return y + 80
  }
  let cursor = y
  items.forEach((item, index) => {
    drawInkLine(ctx, x, cursor, x + width, false)
    cursor += 28
    ctx.fillStyle = MUTED
    ctx.font = `700 16px ${FONT_MONO}`
    ctx.fillText(pad2(index + 1), x, cursor)
    ctx.fillStyle = INK
    ctx.font = `900 34px ${FONT_DISPLAY}`
    const titleLines = wrapText(ctx, item.title || '未命名', width - 48)
    titleLines.forEach((line, lineIndex) => {
      ctx.fillText(line, x + (lineIndex ? 0 : 42), cursor + lineIndex * 40)
    })
    cursor += Math.max(1, titleLines.length) * 40
    ctx.fillStyle = MUTED
    ctx.font = `700 17px ${FONT_MONO}`
    ctx.fillText(`STATUS · ${item.status || '进行中'}`, x, cursor)
    cursor += 26
    const detail = item.detail || item.repairProject || ''
    if (detail) {
      ctx.fillStyle = INK_SOFT
      ctx.font = `500 22px ${FONT_BODY}`
      wrapText(ctx, detail, width - 8).forEach((line) => {
        ctx.fillText(line, x, cursor)
        cursor += 30
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
      ctx.font = `700 16px ${FONT_MONO}`
      wrapText(ctx, meta, width - 8).forEach((line) => {
        ctx.fillText(line, x, cursor)
        cursor += 24
      })
    }
    cursor += 20
  })
  drawInkLine(ctx, x, cursor, x + width, false)
  return cursor + 18
}

export async function renderClosingReportCanvas(model) {
  await ensureReportFonts()
  const measure = document.createElement('canvas').getContext('2d')
  const contentW = WIDTH - PAD * 2
  const colW = (contentW - 28) / 2
  const pickupH = measureList(measure, model.pickups, colW)
  const repairH = measureList(measure, model.repairs, colW)
  const handoverH = measureList(measure, model.handovers, contentW)
  const height = Math.ceil(250 + 300 + Math.max(pickupH, repairH) + 150 + handoverH + 180)

  const canvas = document.createElement('canvas')
  canvas.width = WIDTH
  canvas.height = height
  const ctx = canvas.getContext('2d')

  // cool paper page + inset sheet (lookbook page feel)
  ctx.fillStyle = PAPER_COOL
  ctx.fillRect(0, 0, WIDTH, height)
  ctx.fillStyle = PAPER
  ctx.fillRect(16, 16, WIDTH - 32, height - 32)

  // masthead like report-masthead
  ctx.fillStyle = INK
  ctx.font = `900 70px ${FONT_DISPLAY}`
  ctx.fillText('WORKSHOP OPS', PAD, 78)
  ctx.fillStyle = INK
  ctx.fillRect(WIDTH - PAD - 156, 40, 156, 50)
  ctx.fillStyle = '#fff'
  ctx.font = `900 28px ${FONT_DISPLAY}`
  ctx.fillText(`V${model.appVersion || '—'}`, WIDTH - PAD - 136, 74)

  ctx.fillStyle = MUTED
  ctx.font = `700 18px ${FONT_MONO}`
  ctx.fillText(`${model.storeName} · ${model.businessDate} · DATABASE SYNC`, PAD, 118)
  drawInkLine(ctx, PAD, 140, WIDTH - PAD, true)

  // summary block
  ctx.fillStyle = INK
  ctx.font = `900 62px ${FONT_DISPLAY}`
  ctx.fillText('CLOSING COMPLETE', PAD, 210)
  const closedLabel = model.closedAt
    ? new Intl.DateTimeFormat('zh-CN', { hour: '2-digit', minute: '2-digit' }).format(new Date(model.closedAt))
    : '--:--'
  ctx.fillStyle = MUTED
  ctx.font = `500 22px ${FONT_BODY}`
  ctx.fillText(`已闭店 ${closedLabel}  ·  导出 ${new Intl.DateTimeFormat('zh-CN', { hour: '2-digit', minute: '2-digit' }).format(new Date())}  ·  ${model.exporterName || '同事'}`, PAD, 250)

  // KPI section
  let y = 300
  drawInkLine(ctx, PAD, y, WIDTH - PAD, true)
  y += 36
  ctx.fillStyle = MUTED
  ctx.font = `700 17px ${FONT_MONO}`
  ctx.fillText('SALES / KPI · 当日闭店门槛', PAD, y)
  y += 48
  ctx.fillStyle = INK
  ctx.font = `900 52px ${FONT_DISPLAY}`
  ctx.fillText('销售数据', PAD, y)
  y += 36

  const metrics = [
    ['车辆销售', model.kpi.salesVehicles],
    ['安全检查', model.kpi.safetyChecks],
    ['有效评价', model.kpi.validReviews],
    ['二手售出', model.kpi.usedSold],
    ['二手收车', model.kpi.usedReceived]
  ]
  const boxW = (contentW - 16 * 4) / 5
  metrics.forEach(([label, value], index) => {
    const x = PAD + index * (boxW + 16)
    const dark = index === 0
    ctx.fillStyle = dark ? INK : SURFACE
    ctx.fillRect(x, y, boxW, 148)
    ctx.strokeStyle = INK
    ctx.lineWidth = 2
    ctx.strokeRect(x + 1, y + 1, boxW - 2, 146)
    ctx.fillStyle = dark ? '#fff' : INK
    ctx.font = `900 56px ${FONT_DISPLAY}`
    ctx.fillText(String(value), x + 14, y + 78)
    ctx.fillStyle = dark ? 'rgba(255,255,255,0.72)' : MUTED
    ctx.font = `700 17px ${FONT_MONO}`
    ctx.fillText(label, x + 14, y + 116)
  })
  y += 170
  if (model.kpi.safetyModel) {
    ctx.fillStyle = MUTED
    ctx.font = `700 17px ${FONT_MONO}`
    ctx.fillText(`安检车型 · ${model.kpi.safetyModel}`, PAD, y)
    y += 24
  }

  // two column open ledgers
  y += 24
  drawInkLine(ctx, PAD, y, WIDTH - PAD, true)
  const colTop = y + 34
  const leftX = PAD
  const rightX = PAD + colW + 28

  ctx.fillStyle = MUTED
  ctx.font = `700 16px ${FONT_MONO}`
  ctx.fillText(`PICKUP · ${pad2(model.pickups.length)} OPEN`, leftX, colTop)
  ctx.fillText(`REPAIR · ${pad2(model.repairs.length)} OPEN`, rightX, colTop)
  ctx.fillStyle = INK
  ctx.font = `900 46px ${FONT_DISPLAY}`
  ctx.fillText('待取车辆', leftX, colTop + 48)
  ctx.fillText('维修车辆', rightX, colTop + 48)

  const listY = colTop + 78
  const leftEnd = drawList(ctx, model.pickups, leftX, listY, colW, '本日无待取车辆')
  const rightEnd = drawList(ctx, model.repairs, rightX, listY, colW, '本日无维修车辆')
  y = Math.max(leftEnd, rightEnd) + 18

  // handover full width
  drawInkLine(ctx, PAD, y, WIDTH - PAD, true)
  y += 34
  ctx.fillStyle = MUTED
  ctx.font = `700 16px ${FONT_MONO}`
  ctx.fillText(`HANDOVER · ${pad2(model.handovers.length)} OPEN`, PAD, y)
  y += 48
  ctx.fillStyle = INK
  ctx.font = `900 46px ${FONT_DISPLAY}`
  ctx.fillText('交接事项', PAD, y)
  y += 30
  y = drawList(ctx, model.handovers, PAD, y, contentW, '本日无交接事项')

  // footer
  y = Math.max(y + 20, height - 100)
  drawInkLine(ctx, PAD, y, WIDTH - PAD, true)
  ctx.fillStyle = MUTED
  ctx.font = `700 16px ${FONT_MONO}`
  ctx.fillText('LOOKBOOK STYLE · SITE FONTS ONLY · ONE LONG SHEET', PAD, y + 36)
  ctx.textAlign = 'right'
  ctx.fillText(`${model.storeName}`, WIDTH - PAD, y + 36)
  ctx.textAlign = 'left'

  return canvas
}

export async function exportClosingReportImage(model) {
  const canvas = await renderClosingReportCanvas(model)
  const blob = await new Promise((resolve, reject) => {
    canvas.toBlob((value) => (value ? resolve(value) : reject(new Error('无法生成图片。'))), 'image/png')
  })
  const filename = `闭店日报-${model.businessDate || 'report'}.png`
  const file = new File([blob], filename, { type: 'image/png' })

  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    await navigator.share({
      files: [file],
      title: `闭店日报 ${model.businessDate}`,
      text: `${model.storeName} 闭店日报`
    })
    return { mode: 'share' }
  }

  const url = URL.createObjectURL(blob)
  try {
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = filename
    anchor.rel = 'noopener'
    document.body.appendChild(anchor)
    anchor.click()
    anchor.remove()
    return { mode: 'download' }
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 30_000)
  }
}
