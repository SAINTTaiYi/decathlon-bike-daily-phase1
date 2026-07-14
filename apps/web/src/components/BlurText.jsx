import { useLayoutEffect, useMemo, useRef, useState } from 'react'

const CJK_PATTERN = /[\u3400-\u9FFF\uF900-\uFAFF]/
const scrollItems = new Set()
let scrollRaf = 0
let scrollListening = false

function clamp(value, min = 0, max = 1) {
  return Math.min(max, Math.max(min, value))
}

function ratioOr(value, fallback) {
  const ratio = Number(value)
  return Number.isFinite(ratio) ? ratio : fallback
}

function tokenize(text, splitBy) {
  const value = String(text ?? '')

  if (!value) return []

  const mode = splitBy === 'auto'
    ? CJK_PATTERN.test(value) && !/\s/.test(value.trim())
      ? 'chars'
      : 'words'
    : splitBy

  if (mode === 'chars') {
    return Array.from(value)
  }

  return value.split(/(\s+)/).filter(Boolean)
}

function flushScrollItems() {
  scrollRaf = 0
  scrollItems.forEach((update) => update())
}

function requestScrollFlush() {
  if (scrollRaf) return
  scrollRaf = window.requestAnimationFrame(flushScrollItems)
}

function ensureScrollListeners() {
  if (scrollListening || typeof window === 'undefined') return
  window.addEventListener('scroll', requestScrollFlush, { passive: true })
  window.addEventListener('resize', requestScrollFlush)
  scrollListening = true
}

function removeScrollListenersIfIdle() {
  if (!scrollListening || scrollItems.size) return
  window.removeEventListener('scroll', requestScrollFlush)
  window.removeEventListener('resize', requestScrollFlush)
  scrollListening = false
}

function setUnitStyles(unit, progress, blur, lift) {
  const snappedProgress = progress >= 0.985 ? 1 : progress <= 0.012 ? 0 : progress
  const hiddenAmount = 1 - snappedProgress

  unit.style.opacity = String(snappedProgress)
  unit.style.filter = snappedProgress === 1 ? 'blur(0px)' : `blur(${(blur * hiddenAmount).toFixed(2)}px)`
  unit.style.transform = snappedProgress === 1
    ? 'translate3d(0, 0, 0) scale(1)'
    : `translate3d(0, ${(lift * hiddenAmount).toFixed(2)}px, 0) scale(${(0.955 + snappedProgress * 0.045).toFixed(3)})`
}

export default function BlurText({
  as: Component = 'span',
  text,
  children,
  className = '',
  splitBy = 'auto',
  mode = 'scroll',
  delay = 45,
  duration = 560,
  rootMargin = '0px 0px -10% 0px',
  threshold = 0.12,
  once = true,
  blur = 15,
  lift = 22,
  scrollStagger = 0.56,
  scrollStart = 1.08,
  scrollEnd = 0.24,
  ...props
}) {
  const content = text ?? (typeof children === 'string' ? children : '')
  const units = useMemo(() => tokenize(content, splitBy), [content, splitBy])
  const ref = useRef(null)
  const unitRefs = useRef([])
  const [enhanced, setEnhanced] = useState(false)
  const [inView, setInView] = useState(false)
  const inViewRef = useRef(false)

  unitRefs.current = []

  useLayoutEffect(() => {
    const element = ref.current
    if (!element || typeof window === 'undefined') return undefined

    const prefersReducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    if (prefersReducedMotion) {
      setEnhanced(false)
      setInView(true)
      unitRefs.current.forEach((unit) => {
        if (unit) setUnitStyles(unit, 1, blur, lift)
      })
      return undefined
    }

    setEnhanced(true)

    if (mode === 'scroll') {
      const update = () => {
        const rect = element.getBoundingClientRect()
        const documentElement = document.documentElement
        const scrollingElement = document.scrollingElement || documentElement
        const viewportHeight = window.visualViewport?.height || window.innerHeight || documentElement.clientHeight || 1
        const layoutViewportHeight = window.innerHeight || documentElement.clientHeight || viewportHeight
        const scrollTop = window.scrollY || window.pageYOffset || scrollingElement.scrollTop || documentElement.scrollTop || 0
        const scrollHeight = Math.max(scrollingElement.scrollHeight || 0, documentElement.scrollHeight || 0)
        const maxScrollTop = Math.max(0, scrollHeight - layoutViewportHeight)
        const distanceToDocumentEnd = Math.max(0, maxScrollTop - scrollTop)
        const documentEndRange = Math.max(120, viewportHeight * 0.22)
        const documentEndProgress = clamp(1 - distanceToDocumentEnd / documentEndRange)
        const isOutside = rect.bottom <= 0 || rect.top >= viewportHeight
        const visibleNearDocumentEnd = rect.top < viewportHeight * 0.98 && rect.bottom > viewportHeight * -0.08
        const startRatio = ratioOr(scrollStart, 1.08)
        const endRatio = ratioOr(scrollEnd, 0.24)
        const startLine = viewportHeight * startRatio
        const endLine = viewportHeight * endRatio
        const progressRange = Math.max(1, startLine - endLine)
        let baseProgress = isOutside ? 0 : clamp((startLine - rect.top) / progressRange)

        if (baseProgress > 0 && baseProgress < 1) {
          baseProgress = Math.pow(baseProgress, 1.08)
        }

        if (visibleNearDocumentEnd && documentEndProgress > 0) {
          baseProgress = Math.max(baseProgress, documentEndProgress)
        }

        if (visibleNearDocumentEnd && distanceToDocumentEnd <= 3) {
          baseProgress = 1
        }

        const visualUnits = unitRefs.current.filter(Boolean)
        const tokenCount = Math.max(1, visualUnits.length)
        const stagger = clamp(scrollStagger, 0, 0.78)
        const span = Math.max(0.22, 1 - stagger)

        element.style.setProperty('--blur-progress', baseProgress.toFixed(3))

        const nextInView = baseProgress > 0
        if (inViewRef.current !== nextInView) {
          inViewRef.current = nextInView
          setInView(nextInView)
        }

        visualUnits.forEach((unit, index) => {
          const start = tokenCount > 1 ? (index / (tokenCount - 1)) * stagger : 0
          const tokenProgress = clamp((baseProgress - start) / span)
          setUnitStyles(unit, tokenProgress, blur, lift)
        })
      }

      scrollItems.add(update)
      ensureScrollListeners()
      update()

      return () => {
        scrollItems.delete(update)
        removeScrollListenersIfIdle()
      }
    }

    const rect = element.getBoundingClientRect()
    const viewportHeight = window.innerHeight || document.documentElement.clientHeight
    const appearsInViewport = rect.top < viewportHeight * 0.96 && rect.bottom > viewportHeight * -0.08
    if (appearsInViewport) setInView(true)

    if (!('IntersectionObserver' in window)) {
      setInView(true)
      return undefined
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setInView(true)
          if (once) observer.unobserve(entry.target)
        } else if (!once) {
          setInView(false)
        }
      },
      { rootMargin, threshold }
    )

    observer.observe(element)
    return () => observer.disconnect()
  }, [blur, content, lift, mode, once, rootMargin, scrollEnd, scrollStagger, scrollStart, threshold])

  const visualIndex = { current: 0 }

  return (
    <Component
      ref={ref}
      className={`blur-text ${className}`.trim()}
      data-mode={mode}
      data-enhanced={enhanced ? 'true' : 'false'}
      data-blur-in={inView ? 'true' : 'false'}
      aria-label={content || undefined}
      {...props}
    >
      {units.map((unit, index) => {
        const isSpace = /^\s+$/.test(unit)
        if (isSpace) {
          return <span key={`${unit}-${index}`} className="blur-text__space" aria-hidden="true">{unit}</span>
        }

        const unitIndex = visualIndex.current
        visualIndex.current += 1

        return (
          <span
            key={`${unit}-${index}`}
            ref={(node) => {
              if (node) unitRefs.current[unitIndex] = node
            }}
            className="blur-text__unit"
            aria-hidden="true"
            style={{
              '--blur-index': unitIndex,
              '--blur-delay': `${unitIndex * delay}ms`,
              '--blur-duration': `${duration}ms`
            }}
          >
            {unit}
          </span>
        )
      })}
    </Component>
  )
}
