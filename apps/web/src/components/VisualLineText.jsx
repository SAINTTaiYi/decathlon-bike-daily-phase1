import { useLayoutEffect, useMemo, useRef, useState } from 'react'

function tokenize(value) {
  const parts = String(value ?? '').split(/(\s+)/u).filter(Boolean)
  return parts.flatMap((part) => {
    if (/^\s+$/u.test(part)) return [part]
    // Spans measure browser wrapping only. Animation always targets the completed visual line, never a character or word.
    return /\p{Script=Han}/u.test(part) ? [...part] : [part]
  })
}

function sameLines(left, right) {
  return left.length === right.length && left.every((line, index) => line.join('') === right[index]?.join(''))
}

export default function VisualLineText({ as: Tag = 'h2', children, className = '', ...props }) {
  const rootRef = useRef(null)
  const tokens = useMemo(() => tokenize(children), [children])
  const [lines, setLines] = useState([])
  const renderTokens = (items, prefix) => items.map((token, index) => <span key={`${prefix}-${token}-${index}`} data-visual-line-token>{token}</span>)

  useLayoutEffect(() => {
    const root = rootRef.current
    const measureRoot = root?.querySelector('[data-visual-line-measure]')
    if (!root || !measureRoot) return undefined
    const measure = () => {
      const nodes = [...measureRoot.querySelectorAll('[data-visual-line-token]')]
      if (!nodes.length) return
      const grouped = []
      let currentTop = null
      nodes.forEach((node) => {
        const top = Math.round(node.offsetTop)
        if (currentTop === null || Math.abs(top - currentTop) > 1) {
          grouped.push([])
          currentTop = top
        }
        grouped[grouped.length - 1].push(node.textContent || '')
      })
      setLines((current) => sameLines(current, grouped) ? current : grouped)
    }
    measure()
    if (!('ResizeObserver' in window)) {
      window.addEventListener('resize', measure)
      return () => window.removeEventListener('resize', measure)
    }
    const observer = new ResizeObserver(measure)
    observer.observe(root)
    return () => observer.disconnect()
  }, [tokens])

  return (
    <Tag ref={rootRef} className={`visual-line-text ${className}`.trim()} data-editorial-lines {...props}>
      <span className="visual-line-text__measure" data-visual-line-measure aria-hidden="true">{renderTokens(tokens, 'measure')}</span>
      {lines.length
        ? <span className="visual-line-text__render">{lines.map((line, index) => <span className="visual-line-text__line" key={`line-${index}`}><span className="visual-line-text__content">{renderTokens(line, `line-${index}`)}</span></span>)}</span>
        : <span className="visual-line-text__flow">{renderTokens(tokens, 'flow')}</span>}
    </Tag>
  )
}
