import assert from 'node:assert/strict'
import test from 'node:test'
import { stageMotionValues, stageProgressForGeometry, stageWordFocus } from '../apps/web/src/utils/moduleStageProgress.js'

test('stage progress maps sticky runway travel continuously from zero to one', () => {
  assert.equal(stageProgressForGeometry({ stageTop: 108, header: 108, runwayHeight: 1400, coverHeight: 700 }), 0)
  assert.equal(stageProgressForGeometry({ stageTop: -242, header: 108, runwayHeight: 1400, coverHeight: 700 }), 0.5)
  assert.equal(stageProgressForGeometry({ stageTop: -592, header: 108, runwayHeight: 1400, coverHeight: 700 }), 1)
  assert.equal(stageProgressForGeometry({ stageTop: -900, header: 108, runwayHeight: 1400, coverHeight: 700 }), 1)
})

test('about-derived depth layers move at distinct rates and opposing directions', () => {
  const start = stageMotionValues(0, 1000)
  const middle = stageMotionValues(0.5, 1000)
  const end = stageMotionValues(1, 1000)

  assert.deepEqual(
    [start.title2Y, middle.title2Y, end.title2Y],
    [0, 50, 100]
  )
  assert.deepEqual(
    [start.title3Y, middle.title3Y, end.title3Y],
    [0, 100, 200]
  )
  assert.deepEqual(
    [start.backdropY, middle.backdropY, end.backdropY],
    [-200, 0, 200]
  )
  assert.deepEqual(
    [start.objectY, middle.objectY, end.objectY],
    [80, 0, -80]
  )
  assert.deepEqual(
    [start.objectScale, middle.objectScale, end.objectScale],
    [1, 1.1, 1.2]
  )
  assert.deepEqual(
    [start.curveOffset, middle.curveOffset, end.curveOffset],
    [0, 37.5, 75]
  )
})

test('seven-word trail focus follows stage progress and reduced motion exposes every word', () => {
  assert.equal(stageWordFocus(0.5, 3, 7), 1)
  assert.equal(stageWordFocus(0, 6, 7), 0)
  assert.equal(stageWordFocus(1, 0, 7), 0)
  assert.equal(stageWordFocus(0.35, 2, 7) > stageWordFocus(0.35, 6, 7), true)
  assert.equal(stageWordFocus(0, 6, 7, { reduce: true }), 1)
})

test('reduced motion preserves a visible static composition', () => {
  const reduced = stageMotionValues(0.9, 1000, { reduce: true })
  assert.deepEqual(reduced, {
    progress: 0.5,
    title2Y: 0,
    title3Y: 0,
    backdropY: 0,
    objectY: 0,
    objectScale: 1,
    curveOffset: 37.5,
    curveOffsetMirror: -62.5
  })
})
