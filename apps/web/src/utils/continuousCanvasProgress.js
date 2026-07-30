export function clampStageProgress(value, minimum = 0, maximum = 1) {
  return Math.min(maximum, Math.max(minimum, value))
}

export function pageProgressForGeometry({ scrollY, stackDocumentTop, stackHeight, viewportHeight, header = 0 }) {
  const start = Math.max(0, stackDocumentTop - header)
  const travel = Math.max(1, stackHeight - viewportHeight + header)
  return clampStageProgress((scrollY - start) / travel)
}

export function moduleProgressForGeometry({ moduleTop, moduleHeight, viewportHeight, focalRatio = 0.42 }) {
  const entryLine = viewportHeight * 0.9
  const exitLine = viewportHeight * Math.max(0.08, focalRatio - 0.3)
  const travel = Math.max(1, moduleHeight + entryLine - exitLine)
  return clampStageProgress((entryLine - moduleTop) / travel)
}

export function moduleMotionValues(progress, viewportWidth, viewportHeight, index, { reduce = false } = {}) {
  if (reduce) return { progress: 0.5, x: 0, y: 0, scale: 1, opacity: 1 }
  const safeProgress = clampStageProgress(progress)
  const direction = index % 2 === 0 ? 1 : -1
  const xRange = viewportWidth * (viewportWidth < viewportHeight ? 0.18 : 0.12)
  const x = safeProgress <= 0.5
    ? direction * (1 - safeProgress * 2) * xRange
    : -direction * ((safeProgress - 0.5) * 2) * xRange * 0.72
  const y = safeProgress <= 0.5
    ? (1 - safeProgress * 2) * viewportHeight * 0.12
    : -((safeProgress - 0.5) * 2) * viewportHeight * 0.1
  const scale = safeProgress <= 0.5
    ? 0.93 + safeProgress * 0.14
    : 1 + (safeProgress - 0.5) * 0.1
  const edge = Math.min(safeProgress / 0.16, (1 - safeProgress) / 0.16, 1)
  return { progress: safeProgress, x, y, scale, opacity: 0.26 + clampStageProgress(edge) * 0.74 }
}

export function objectMotionValues(pageProgress, index, viewportWidth, viewportHeight, { reduce = false } = {}) {
  const portrait = viewportWidth < viewportHeight
  if (reduce) {
    const column = index % 2 === 0 ? -1 : 1
    const row = Math.floor(index / 2) - 1
    return {
      progress: 0.5,
      x: column * viewportWidth * (0.28 + (index % 3) * 0.04),
      y: row * viewportHeight * 0.24,
      scale: 0.48 + (index % 2) * 0.08,
      rotation: column * 5,
      opacity: 0.18
    }
  }
  const start = -0.08 + index * 0.14
  const progress = clampStageProgress((pageProgress - start) / 0.42)
  const direction = index % 2 === 0 ? 1 : -1
  const horizontalRange = viewportWidth * (portrait ? 0.64 : 0.46)
  const x = direction * (1 - progress * (portrait ? 1.58 : 1.46)) * horizontalRange
  const y = (0.98 - progress * 1.96) * viewportHeight
  const edge = clampStageProgress(Math.min(progress / 0.1, (1 - progress) / 0.1))
  return {
    progress,
    x,
    y,
    scale: 0.72 + progress * 0.5,
    rotation: direction * (10 - progress * 16),
    opacity: edge * 0.96
  }
}

export function motifProgress(pageProgress, index) {
  const start = index === 0 ? 0.08 : 0.56
  return clampStageProgress((pageProgress - start) / 0.3)
}

export function motifVisibility(progress, { reduce = false } = {}) {
  if (reduce) return 0.18
  const safeProgress = clampStageProgress(progress)
  return clampStageProgress(Math.min(safeProgress / 0.12, (1 - safeProgress) / 0.12))
}

export function narrativeMotionValues(pageProgress, index, viewportWidth, viewportHeight, { reduce = false } = {}) {
  const progress = reduce ? 0.5 : motifProgress(pageProgress, index)
  const direction = index % 2 === 0 ? 1 : -1
  const edge = reduce ? 1 : clampStageProgress(Math.min(progress / 0.12, (1 - progress) / 0.12))
  return {
    progress,
    x: reduce ? direction * viewportWidth * 0.06 : direction * (0.5 - progress) * viewportWidth * 0.28,
    y: reduce ? (index - 0.5) * viewportHeight * 0.22 : (0.5 - progress) * viewportHeight * 0.48,
    scale: reduce ? 1 : 0.92 + progress * 0.18,
    opacity: 0.08 + edge * 0.22
  }
}

export function continuousWordFocus(progress, index, count, { reduce = false } = {}) {
  if (reduce) return 1
  const safeCount = Math.max(count, 1)
  const centre = (index + 0.5) / safeCount
  return clampStageProgress(1 - Math.abs(clampStageProgress(progress) - centre) / 0.25)
}
