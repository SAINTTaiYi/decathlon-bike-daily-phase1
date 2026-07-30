export function clampStageProgress(value, minimum = 0, maximum = 1) {
  return Math.min(maximum, Math.max(minimum, value))
}

export function stageProgressForGeometry({ stageTop, header, runwayHeight, coverHeight }) {
  const travel = Math.max(1, runwayHeight - coverHeight)
  return clampStageProgress((header - stageTop) / travel)
}

export function stageMotionValues(progress, viewportHeight, { reduce = false } = {}) {
  const safeProgress = reduce ? 0.5 : clampStageProgress(progress)
  const viewportUnit = viewportHeight / 100
  return {
    progress: safeProgress,
    title2Y: reduce ? 0 : safeProgress * 10 * viewportUnit,
    title3Y: reduce ? 0 : safeProgress * 20 * viewportUnit,
    backdropY: reduce ? 0 : (-20 + safeProgress * 40) * viewportUnit,
    objectY: reduce ? 0 : (8 - safeProgress * 16) * viewportUnit,
    objectScale: reduce ? 1 : 1 + safeProgress * 0.2,
    curveOffset: safeProgress * 75,
    curveOffsetMirror: -100 + safeProgress * 75
  }
}

export function stageWordFocus(progress, index, count, { reduce = false } = {}) {
  if (reduce) return 1
  const safeCount = Math.max(count, 1)
  const centre = (index + 0.5) / safeCount
  return clampStageProgress(1 - Math.abs(clampStageProgress(progress) - centre) / 0.25)
}
