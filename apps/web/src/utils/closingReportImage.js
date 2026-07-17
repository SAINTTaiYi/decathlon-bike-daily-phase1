const WIDTH = 1080
const MARGIN = 48
const COL_GAP = 28
const CONTENT_LEFT = MARGIN
const CONTENT_RIGHT = WIDTH - MARGIN

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
  const pickups = records.filter(isOpenPickup)
  const repairs = records.filter(isOpenRepair)
  const handovers = records.filter(isOpenHandover)
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
    pickups,
    repairs,
    handovers
  }
}

function wrapText(ctx, text, maxWidth) {
  const value = String(text || '').trim() || '—'
  const chars = [...value]
  const lines = []
  let current = ''
  for (const char of chars) {
    const next = current + char
    if (ctx.measureText(next).width > maxWidth && current) {
      lines.push(current)
      current = char
    } else {
      current = next
    }
  }
  if (current) lines.push(current)
  return lines
}

function drawGrid(ctx, width, height) {
  ctx.save()
  ctx.strokeStyle = 'rgba(0,0,0,0.08)'
  ctx.lineWidth = 1
  const step = 36
  for (let x = 0; x <= width; x += step) {
    ctx.beginPath()
    ctx.moveTo(x + 0.5, 0)
    ctx.lineTo(x + 0.5, height)
    ctx.stroke()
  }
  for (let y = 0; y <= height; y += step) {
    ctx.beginPath()
    ctx.moveTo(0, y + 0.5)
    ctx.lineTo(width, y + 0.5)
    ctx.stroke()
  }
  ctx.restore()
}

function drawDotBlock(ctx, x, y, w, h) {
  ctx.save()
  ctx.fillStyle = '#111'
  ctx.fillRect(x, y, w, h)
  ctx.fillStyle = '#f4f4f0'
  const gap = 10
  for (let yy = y + 8; yy < y + h - 6; yy += gap) {
    for (let xx = x + 8; xx < x + w - 6; xx += gap) {
      ctx.beginPath()
      ctx.arc(xx, yy, 2.2, 0, Math.PI * 2)
      ctx.fill()
    }
  }
  ctx.restore()
}

function drawNoiseBand(ctx, x, y, w, h) {
  ctx.save()
  const image = ctx.createImageData(w, h)
  for (let i = 0; i < image.data.length; i += 4) {
    const n = Math.random() * 255
    const v = n > 210 ? 255 : n > 120 ? 40 : 0
    image.data[i] = v
    image.data[i + 1] = v
    image.data[i + 2] = v
    image.data[i + 3] = 255
  }
  ctx.putImageData(image, x, y)
  ctx.restore()
}

function sectionTitle(ctx, title, en, x, y) {
  ctx.fillStyle = '#000'
  ctx.font = '700 42px "Noto Serif SC Variable", "Noto Serif SC", serif'
  ctx.fillText(title, x, y)
  ctx.font = '600 18px "Albert Sans", system-ui, sans-serif'
  ctx.fillStyle = '#333'
  ctx.fillText(en, x, y + 28)
  return y + 56
}

function drawList(ctx, items, x, y, maxWidth, emptyLabel) {
  if (!items.length) {
    ctx.fillStyle = '#111'
    ctx.font = '500 24px "Albert Sans", system-ui, sans-serif'
    ctx.fillText(emptyLabel, x, y)
    return y + 42
  }
  let cursor = y
  items.forEach((item, index) => {
    const title = item.title || '未命名'
    const status = item.status || '进行中'
    const detail = item.detail || item.repairProject || ''
    const metaBits = [
      item.pickupDate ? `取车 ${item.pickupDate}` : '',
      item.repairType || '',
      item.meta || ''
    ].filter(Boolean)
    const meta = metaBits.join(' · ')

    ctx.fillStyle = index % 2 === 0 ? '#000' : '#111'
    ctx.fillRect(x, cursor, maxWidth, 8)
    cursor += 36

    ctx.fillStyle = '#000'
    ctx.font = '700 30px "Noto Serif SC Variable", "Noto Serif SC", serif'
    const titleLines = wrapText(ctx, `${pad2(index + 1)}  ${title}`, maxWidth - 24)
    titleLines.forEach((line) => {
      ctx.fillText(line, x, cursor)
      cursor += 36
    })

    ctx.font = '600 20px "Albert Sans", system-ui, sans-serif'
    ctx.fillStyle = '#222'
    ctx.fillText(`STATUS · ${status}`, x, cursor)
    cursor += 28

    if (detail) {
      ctx.font = '400 22px "Albert Sans", system-ui, sans-serif'
      wrapText(ctx, detail, maxWidth - 12).forEach((line) => {
        ctx.fillText(line, x, cursor)
        cursor += 28
      })
    }
    if (meta) {
      ctx.font = '500 18px "Albert Sans", system-ui, sans-serif'
      ctx.fillStyle = '#444'
      wrapText(ctx, meta, maxWidth - 12).forEach((line) => {
        ctx.fillText(line, x, cursor)
        cursor += 24
      })
    }
    cursor += 24
  })
  return cursor
}

function measureListHeight(ctx, items, maxWidth, emptyLabel) {
  // approximate by running a dummy measure using same wrap rules on an offscreen path
  // reuse drawList math via a light clone: use actual canvas measure only
  if (!items.length) return 42
  let height = 0
  items.forEach((item, index) => {
    height += 8 + 28
    const title = `${pad2(index + 1)}  ${item.title || '未命名'}`
    ctx.font = '700 30px "Noto Serif SC Variable", "Noto Serif SC", serif'
    height += wrapText(ctx, title, maxWidth - 24).length * 36
    height += 28
    const detail = item.detail || item.repairProject || ''
    if (detail) {
      ctx.font = '400 22px "Albert Sans", system-ui, sans-serif'
      height += wrapText(ctx, detail, maxWidth - 12).length * 28
    }
    const metaBits = [
      item.pickupDate ? `取车 ${item.pickupDate}` : '',
      item.repairType || '',
      item.meta || ''
    ].filter(Boolean)
    if (metaBits.length) {
      ctx.font = '500 18px "Albert Sans", system-ui, sans-serif'
      height += wrapText(ctx, metaBits.join(' · '), maxWidth - 12).length * 24
    }
    height += 24
  })
  return Math.max(height, emptyLabel ? 42 : 0)
}

export async function renderClosingReportCanvas(model) {
  await document.fonts.ready.catch(() => undefined)
  const measure = document.createElement('canvas').getContext('2d')
  const colWidth = (WIDTH - MARGIN * 2 - COL_GAP) / 2
  const kpiBlock = 280
  const header = 420
  const listTopPad = 70
  const pickupH = measureListHeight(measure, model.pickups, colWidth, '本日无待取车辆')
  const repairH = measureListHeight(measure, model.repairs, colWidth, '本日无维修车辆')
  const handoverH = measureListHeight(measure, model.handovers, CONTENT_RIGHT - CONTENT_LEFT, '本日无交接事项')
  const listsRow = Math.max(pickupH, repairH) + listTopPad + 40
  const height = Math.ceil(header + kpiBlock + listsRow + handoverH + 220)

  const canvas = document.createElement('canvas')
  canvas.width = WIDTH
  canvas.height = height
  const ctx = canvas.getContext('2d')

  // paper
  ctx.fillStyle = '#F4F5F0'
  ctx.fillRect(0, 0, WIDTH, height)
  drawGrid(ctx, WIDTH, height)

  // vertical left rail
  ctx.fillStyle = '#000'
  ctx.fillRect(0, 0, 28, height)

  // big vertical title
  ctx.save()
  ctx.translate(92, 96)
  ctx.rotate(Math.PI / 2)
  ctx.fillStyle = '#000'
  ctx.font = '900 118px "Noto Serif SC Variable", "Noto Serif SC", serif'
  ctx.textBaseline = 'top'
  ctx.fillText('闭店日报', 0, -96)
  ctx.restore()

  // right vertical caption
  ctx.save()
  ctx.translate(WIDTH - 36, 80)
  ctx.rotate(Math.PI / 2)
  ctx.fillStyle = '#000'
  ctx.font = '700 28px "Albert Sans", system-ui, sans-serif'
  ctx.fillText(`${model.storeName}  /  ${model.businessDate}  /  CLOSING REPORT`, 0, 0)
  ctx.restore()

  // collage blocks near top
  drawDotBlock(ctx, 180, 72, 150, 150)
  ctx.fillStyle = '#000'
  ctx.fillRect(360, 72, 180, 72)
  ctx.fillStyle = '#F4F5F0'
  ctx.font = '700 22px "Albert Sans", system-ui, sans-serif'
  ctx.fillText('GRID SYSTEMS', 376, 104)
  ctx.fillText('IN STORE OPS', 376, 130)
  drawNoiseBand(ctx, 560, 72, 220, 150)
  ctx.fillStyle = '#000'
  ctx.fillRect(800, 72, 160, 150)

  // meta strip
  ctx.fillStyle = '#000'
  ctx.fillRect(180, 250, WIDTH - 180 - MARGIN, 64)
  ctx.fillStyle = '#F4F5F0'
  ctx.font = '600 22px "Albert Sans", system-ui, sans-serif'
  const closedLabel = model.closedAt
    ? new Intl.DateTimeFormat('zh-CN', { hour: '2-digit', minute: '2-digit' }).format(new Date(model.closedAt))
    : '--:--'
  ctx.fillText(`CLOSED ${closedLabel}   ·   EXPORT ${new Intl.DateTimeFormat('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(new Date())}   ·   BY ${model.exporterName || '同事'}`, 200, 290)

  // KPI section
  let y = 360
  y = sectionTitle(ctx, '销售数据', 'SALES / KPI', CONTENT_LEFT + 140, y)
  const metrics = [
    ['车辆销售', model.kpi.salesVehicles],
    ['安全检查', model.kpi.safetyChecks],
    ['有效评价', model.kpi.validReviews],
    ['二手售出', model.kpi.usedSold],
    ['二手收车', model.kpi.usedReceived]
  ]
  const boxW = (WIDTH - MARGIN * 2 - 140 - 32 * 4) / 5
  metrics.forEach(([label, value], index) => {
    const x = CONTENT_LEFT + 140 + index * (boxW + 32)
    ctx.fillStyle = index % 2 === 0 ? '#000' : '#111'
    ctx.fillRect(x, y, boxW, 150)
    ctx.fillStyle = '#F4F5F0'
    ctx.font = '800 58px "Albert Sans", system-ui, sans-serif'
    ctx.fillText(String(value), x + 18, y + 78)
    ctx.font = '600 20px "Noto Serif SC Variable", "Noto Serif SC", serif'
    ctx.fillText(label, x + 18, y + 120)
  })
  y += 180
  if (model.kpi.safetyModel) {
    ctx.fillStyle = '#000'
    ctx.font = '500 22px "Albert Sans", system-ui, sans-serif'
    ctx.fillText(`安检车型 · ${model.kpi.safetyModel}`, CONTENT_LEFT + 140, y)
    y += 36
  }

  // two-column lists
  const leftX = CONTENT_LEFT
  const rightX = CONTENT_LEFT + colWidth + COL_GAP
  const listStart = y + 20
  sectionTitle(ctx, '待取车辆', `PICKUP · ${pad2(model.pickups.length)}`, leftX, listStart)
  sectionTitle(ctx, '维修车辆', `REPAIR · ${pad2(model.repairs.length)}`, rightX, listStart)
  const listY = listStart + 70
  drawList(ctx, model.pickups, leftX, listY, colWidth, '本日无待取车辆')
  drawList(ctx, model.repairs, rightX, listY, colWidth, '本日无维修车辆')

  // full-width handover
  let hy = listStart + 70 + Math.max(pickupH, repairH) + 48
  // divider band
  ctx.fillStyle = '#000'
  ctx.fillRect(0, hy - 24, WIDTH, 12)
  hy = sectionTitle(ctx, '交接事项', `HANDOVER · ${pad2(model.handovers.length)}`, CONTENT_LEFT, hy + 20)
  hy = drawList(ctx, model.handovers, CONTENT_LEFT, hy, CONTENT_RIGHT - CONTENT_LEFT, '本日无交接事项')

  // footer collage
  const footerY = Math.max(hy + 40, height - 140)
  ctx.fillStyle = '#000'
  ctx.fillRect(MARGIN, footerY, 220, 72)
  ctx.fillStyle = '#F4F5F0'
  ctx.font = '800 28px "Albert Sans", system-ui, sans-serif'
  ctx.fillText('BIKE OPS', MARGIN + 24, footerY + 46)
  ctx.fillStyle = '#000'
  ctx.font = '500 18px "Albert Sans", system-ui, sans-serif'
  ctx.fillText(`V${model.appVersion || '—'}  ·  ONE LONG SHEET  ·  SWISS GRID STYLE`, MARGIN + 250, footerY + 44)
  ctx.fillRect(WIDTH - MARGIN - 160, footerY, 160, 72)

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
