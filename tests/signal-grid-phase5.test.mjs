import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import { REPORT_OUTPUT_PROFILE, reportContrastRatio, reportScaledPixelSize } from '../apps/web/src/utils/closingReportImage.js'

const root = new URL('../', import.meta.url)
const read = (path) => readFile(new URL(path, root), 'utf8')

test('Corrected prototype retires the Phase 5 hero image from runtime presentation', async () => {
  const source = await read('apps/web/src/components/lookbook/MainHeadImage.jsx')
  assert.match(source, /signal-glitch-field/u)
  assert.match(source, /ABSTRACT SIGNAL FIELD/u)
  assert.doesNotMatch(source, /<picture|<img|workshop-head-signal/u)
})


test('Corrected prototype removes legacy figurative Overview media from the public deployment package', async () => {
  const names = await readdir(new URL('apps/web/public/images/', root))
  assert.equal(names.some((name) => /^workshop-head-/u.test(name)), false)
  assert.equal(names.includes('signal-media-manifest.json'), false)
  const sources = await read('apps/web/public/images/SOURCES.md')
  assert.match(sources, /does not ship or render figurative hero photography/u)
})

test('Phase 5 media CSS scopes dynamic thumbnails to the active module without a legacy hero layer', async () => {
  const css = await read('apps/web/src/styles/signal-grid-media.css')
  const styles = await read('apps/web/src/styles/index.css')
  const dialog = await read('apps/web/src/components/dialogs/AttachmentDialog.jsx')
  assert.match(styles, /signal-grid-media\.css/u)
  assert.doesNotMatch(css, /signal-overview-media/u)
  assert.match(css, /radial-gradient\(circle/u)
  assert.match(css, /var\(--sg-module-color\)/u)
  assert.match(dialog, /sceneRecordConfig\[record\?\.scene\]\?\.signalModule/u)
  assert.match(dialog, /data-signal-media="thumbnail"/u)
})

test('Phase 5 report palette remains contrast-safe in color and grayscale output', () => {
  const { moduleColors, ink } = REPORT_OUTPUT_PROFILE
  assert.ok(reportContrastRatio('#ffffff', moduleColors.sales) >= 4.5)
  for (const module of ['overview', 'pickup', 'repair', 'resale', 'closing']) {
    assert.ok(reportContrastRatio(ink, moduleColors[module]) >= 4.5, `${module} must retain readable dark text`)
  }
  assert.ok(reportContrastRatio(ink, REPORT_OUTPUT_PROFILE.background) >= 12)
})

test('Phase 5 report keeps small labels and structural rules legible after 1080px chat downscale', () => {
  assert.equal(REPORT_OUTPUT_PROFILE.width, 1242)
  assert.equal(REPORT_OUTPUT_PROFILE.chatLongEdge, 1080)
  assert.ok(reportScaledPixelSize(REPORT_OUTPUT_PROFILE.minimumReadableSourcePx) >= 17)
  assert.ok(reportScaledPixelSize(REPORT_OUTPUT_PROFILE.structuralLinePx) >= 1.7)
})

test('Phase 5 report uses Signal Grid summary fields and flat module-coded detail structure', async () => {
  const source = await read('apps/web/src/utils/closingReportImage.js')
  assert.match(source, /WORKSHOP SIGNAL GRID/u)
  assert.match(source, /闭店日报 \/ CLOSING REPORT/u)
  assert.match(source, /SALES \/ CLOSING KPI/u)
  assert.match(source, /SECTION_THEME\.pickup/u)
  assert.match(source, /SECTION_THEME\.repair/u)
  assert.match(source, /SELF PICKUP/u)
  assert.match(source, /CHAT COMPRESSION SAFE \/ GRAYSCALE LEGIBLE/u)
  assert.doesNotMatch(source, /drawSoftShadow|roundRect|shadowBlur|linearGradient/u)
})

test('Phase 5 report renderer completes a representative canvas pass without browser screenshot dependencies', async () => {
  const originalDocument = globalThis.document
  const makeContext = () => ({
    fillStyle: '', strokeStyle: '', font: '', textAlign: 'left', textBaseline: 'alphabetic', lineWidth: 1, globalAlpha: 1,
    fillRect() {}, strokeRect() {}, beginPath() {}, arc() {}, fill() {}, moveTo() {}, lineTo() {}, stroke() {}, save() {}, restore() {},
    fillText() {}, drawImage() {}, measureText(value) { return { width: String(value).length * 12 } }
  })
  const makeCanvas = () => ({ width: 0, height: 0, getContext: () => makeContext() })
  globalThis.document = {
    fonts: { ready: Promise.resolve(), load: async () => [{}] },
    createElement: (name) => name === 'canvas' ? makeCanvas() : { click() {}, remove() {} },
    body: { appendChild() {} }
  }
  try {
    const { renderClosingReportCanvas, buildClosingReportModel } = await import('../apps/web/src/utils/closingReportImage.js')
    const canvas = await renderClosingReportCanvas(buildClosingReportModel({
      businessDate: '2026-07-23', storeName: '测试门店', exporterName: '同事', closedAt: '2026-07-23T06:00:00.000Z', appVersion: '5.8.4',
      kpi: { salesVehicles: 3, safetyChecks: 2, safetyModel: 'ST100', validReviews: 5, usedSold: 1, usedReceived: 2 },
      records: [
        { id: 'p1', scene: 'pickup', title: '线上订单车', pickupSource: 'self-pickup', selfPickupPlatform: 'tmall', lifecycle: 'active', status: '等待取车' },
        { id: 'r1', scene: 'repair', title: '维修车辆', lifecycle: 'active', status: '维修中', contactValue: '13800000000', repairProject: '调整变速 + 安全检查' },
        { id: 'h1', scene: 'poster', title: '晚班交接', lifecycle: 'active', status: '继续跟进', detail: '联系顾客' }
      ]
    }))
    assert.equal(canvas.width, REPORT_OUTPUT_PROFILE.width)
    assert.ok(canvas.height > 1400)
  } finally {
    globalThis.document = originalDocument
  }
})
