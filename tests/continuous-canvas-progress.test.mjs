import assert from 'node:assert/strict'
import test from 'node:test'
import {
  continuousWordFocus,
  moduleMotionValues,
  moduleProgressForGeometry,
  motifProgress,
  motifVisibility,
  narrativeMotionValues,
  objectMotionValues,
  pageProgressForGeometry
} from '../apps/web/src/utils/continuousCanvasProgress.js'

test('one page progress maps the uninterrupted canvas from zero to one', () => {
  const geometry = { stackDocumentTop: 0, stackHeight: 2000, viewportHeight: 1000, header: 100 }
  assert.equal(pageProgressForGeometry({ ...geometry, scrollY: 0 }), 0)
  assert.equal(pageProgressForGeometry({ ...geometry, scrollY: 550 }), 0.5)
  assert.equal(pageProgressForGeometry({ ...geometry, scrollY: 1100 }), 1)
  assert.equal(pageProgressForGeometry({ ...geometry, scrollY: 1800 }), 1)
})

test('module progress uses viewport geometry without sticky runways', () => {
  const geometry = { moduleHeight: 1000, viewportHeight: 1000 }
  assert.equal(moduleProgressForGeometry({ ...geometry, moduleTop: 900 }), 0)
  assert.equal(moduleProgressForGeometry({ ...geometry, moduleTop: 10 }), 0.5)
  assert.equal(moduleProgressForGeometry({ ...geometry, moduleTop: -880 }), 1)
})

test('business modules move and scale at full strength in portrait and landscape', () => {
  const portraitStart = moduleMotionValues(0, 390, 844, 0)
  const portraitEnd = moduleMotionValues(1, 390, 844, 0)
  const desktopStart = moduleMotionValues(0, 1440, 900, 0)
  assert.equal(Math.abs(portraitStart.x) >= 70, true)
  assert.equal(Math.abs(portraitStart.y) >= 100, true)
  assert.equal(portraitStart.scale, 0.93)
  assert.equal(portraitEnd.scale > 1, true)
  assert.equal(Math.abs(desktopStart.x) >= 170, true)
})

test('six objects cross the viewport on independent page windows', () => {
  const before = objectMotionValues(0, 0, 390, 844)
  const middle = objectMotionValues(0.13, 0, 390, 844)
  const after = objectMotionValues(0.34, 0, 390, 844)
  assert.equal(before.opacity > 0.8, true)
  assert.equal(middle.opacity > 0.8, true)
  assert.equal(after.opacity, 0)
  assert.equal(before.x > middle.x, true)
  assert.equal(middle.y > after.y, true)
  assert.equal(after.scale > middle.scale, true)
})

test('only two sparse motif windows drive curve copy, word focus and narrative type', () => {
  assert.equal(motifProgress(0.08, 0), 0)
  assert.equal(Math.abs(motifProgress(0.23, 0) - 0.5) < Number.EPSILON, true)
  assert.equal(motifProgress(0.38, 0), 1)
  assert.equal(motifProgress(0.56, 1), 0)
  assert.equal(motifVisibility(0), 0)
  assert.equal(motifVisibility(0.5), 1)
  assert.equal(motifVisibility(1), 0)
  assert.equal(continuousWordFocus(0.5, 3, 7), 1)
  assert.equal(continuousWordFocus(0, 6, 7), 0)
  const narrative = narrativeMotionValues(0.23, 0, 390, 844)
  assert.equal(narrative.opacity > 0.2, true)
})

test('reduced motion preserves a readable static composition', () => {
  const module = moduleMotionValues(0.9, 390, 844, 2, { reduce: true })
  assert.deepEqual(module, { progress: 0.5, x: 0, y: 0, scale: 1, opacity: 1 })
  const object = objectMotionValues(0.9, 2, 390, 844, { reduce: true })
  assert.equal(object.progress, 0.5)
  assert.equal(object.opacity, 0.18)
  assert.equal(continuousWordFocus(0, 6, 7, { reduce: true }), 1)
})
