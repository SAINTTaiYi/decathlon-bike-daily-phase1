import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile, stat } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { REPORT_OUTPUT_PROFILE, reportContrastRatio, reportScaledPixelSize } from '../apps/web/src/utils/closingReportImage.js'

const root = new URL('../', import.meta.url)
const read = (path) => readFile(new URL(path, root), 'utf8')

test('Phase 5 hero uses build-time AVIF/WebP Signal Grid media with explicit dimensions', async () => {
  const source = await read('apps/web/src/components/lookbook/MainHeadImage.jsx')
  assert.match(source, /type="image\/avif"/u)
  assert.match(source, /workshop-head-signal-480\.avif 480w/u)
  assert.match(source, /workshop-head-signal-1200\.webp 1200w/u)
  assert.match(source, /width="1200" height="864"/u)

  for (const width of [480, 800, 1200]) {
    for (const extension of ['avif', 'webp']) {
      const file = new URL(`apps/web/public/images/workshop-head-signal-${width}.${extension}`, root)
      const info = await stat(file)
      const bytes = await readFile(file)
      assert.ok(info.size > 8_000, `${file.pathname} should contain a real image payload`)
      if (extension === 'webp') assert.equal(bytes.subarray(0, 4).toString('ascii'), 'RIFF')
      if (extension === 'avif') assert.equal(bytes.subarray(4, 12).toString('ascii'), 'ftypavif')
    }
  }
})


test('Phase 5 media manifest locks dimensions, byte size and SHA-256 for every generated derivative', async () => {
  const manifest = JSON.parse(await read('apps/web/public/images/signal-media-manifest.json'))
  assert.equal(manifest.schema, 1)
  assert.equal(manifest.assets.length, 6)
  for (const asset of manifest.assets) {
    const payload = await readFile(new URL(`apps/web/public/images/${asset.file}`, root))
    assert.equal(payload.length, asset.bytes)
    assert.equal(createHash('sha256').update(payload).digest('hex'), asset.sha256)
    assert.ok([480, 800, 1200].includes(asset.width))
    assert.equal(asset.height, Math.round(asset.width * 864 / 1200))
  }
})

test('Phase 5 media CSS removes runtime hero filtering and scopes dynamic thumbnails to the active module', async () => {
  const css = await read('apps/web/src/styles/signal-grid-media.css')
  const styles = await read('apps/web/src/styles/index.css')
  const dialog = await read('apps/web/src/components/dialogs/AttachmentDialog.jsx')
  assert.match(styles, /signal-grid-media\.css/u)
  assert.match(css, /\.signal-overview-media img\s*\{[^}]*filter:\s*none !important/u)
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
