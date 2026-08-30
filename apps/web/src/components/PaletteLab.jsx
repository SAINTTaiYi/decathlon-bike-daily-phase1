/*
 * PaletteLab — preview-only colour editor.
 *
 * Why this exists: iterating on the accent colour previously required a full
 * source edit -> commit -> version:preview -> build -> CI deploy cycle (~5-8
 * minutes) for every single hex value. This lets the palette be tuned live in
 * the browser, then exports the final token values to be committed properly.
 *
 * Deliberate constraints:
 * - Preview / localhost hosts ONLY. Never renders on workshop.skin.
 * - Pure client-side: CSS custom property overrides + localStorage. No D1,
 *   no API calls, no storage cost, no per-store theming.
 * - Output is a token block to paste into flat-tokens.css, so the committed
 *   source stays the single source of truth.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'

import { isPreviewHost } from '../utils/previewGate.js'

const STORAGE_KEY = 'workshop.palette-lab.v1'

/* Tokens exposed for editing, grouped for a sane UI order. Keys map 1:1 to
 * the custom properties declared in styles/flat-tokens.css. */
const TOKEN_GROUPS = [
  {
    id: 'accent',
    label: '强调色',
    tokens: [
      { name: '--ops-yellow', label: '主强调色', hint: '按钮、当前页签、队列号' },
      { name: '--ops-yellow-pressed', label: '按下态', hint: '主色的深色变体' },
      { name: '--ops-yellow-wash', label: '浅底', hint: '强调色的极浅背景' },
      { name: '--ops-pickup-expanded', label: '展开卡底色', hint: '待取卡展开时的底色' },
    ],
  },
  {
    id: 'surface',
    label: '表面',
    tokens: [
      { name: '--ops-page', label: '页面底色' },
      { name: '--ops-card', label: '卡片底色' },
      { name: '--ops-card-sunken', label: '下沉底色' },
    ],
  },
  {
    id: 'ink',
    label: '文字',
    tokens: [
      { name: '--ops-black', label: '主墨色' },
      { name: '--ops-text-muted', label: '次要文字' },
    ],
  },
  {
    id: 'status',
    label: '状态',
    tokens: [
      { name: '--ops-danger', label: '危险' },
      { name: '--ops-success', label: '成功' },
    ],
  },
  /* Numeric knobs. These are not colours, so they get sliders instead of an
   * <input type="color">, and they carry unit/min/max/step metadata because
   * a bare number is not a valid custom-property value for most of them. */
  {
    id: 'glass',
    label: '玻璃质感',
    tokens: [
      { name: '--ops-glass-alpha', label: '不透明度', kind: 'range', min: 0, max: 1, step: .01, unit: '', hint: '越低越透，背景光源越明显' },
      { name: '--ops-glass-edge-alpha', label: '描边', kind: 'range', min: 0, max: .4, step: .01, unit: '', hint: '卡片外缘暖色细线' },
      { name: '--ops-glass-hairline-alpha', label: '顶部高光', kind: 'range', min: 0, max: 1, step: .01, unit: '', hint: '卡片内侧顶边白线' },
    ],
  },
  {
    id: 'glow',
    label: '背景光源',
    tokens: [
      { name: '--ops-glow-scale', label: '光源尺寸', kind: 'range', min: .5, max: 2, step: .05, unit: '', hint: '整体缩放三层光斑' },
      { name: '--ops-glow-a-x', label: '光斑 A 横向', kind: 'range', min: -60, max: 160, step: 1, unit: '%' },
      { name: '--ops-glow-a-y', label: '光斑 A 纵向', kind: 'range', min: -60, max: 160, step: 1, unit: '%' },
      { name: '--ops-glow-b-x', label: '光斑 B 横向', kind: 'range', min: -60, max: 160, step: 1, unit: '%' },
      { name: '--ops-glow-b-y', label: '光斑 B 纵向', kind: 'range', min: -60, max: 160, step: 1, unit: '%' },
      { name: '--ops-glow-c-x', label: '光斑 C 横向', kind: 'range', min: -60, max: 160, step: 1, unit: '%' },
      { name: '--ops-glow-c-y', label: '光斑 C 纵向', kind: 'range', min: -60, max: 160, step: 1, unit: '%' },
    ],
  },
]

const ALL_TOKENS = TOKEN_GROUPS.flatMap((group) => group.tokens)

/* Only ever active on preview + local hosts. Shares one runtime host check with
 * the other preview-only surfaces (see utils/previewGate.js). */
export function isPaletteLabEnabled() {
  return isPreviewHost()
}

/* Normalises whatever getComputedStyle hands back into #rrggbb so it can feed
 * an <input type="color">, which rejects anything else. */
function toHex(raw) {
  const value = String(raw || '').trim()
  if (/^#[0-9a-f]{6}$/i.test(value)) return value.toLowerCase()
  if (/^#[0-9a-f]{3}$/i.test(value)) {
    return `#${value[1]}${value[1]}${value[2]}${value[2]}${value[3]}${value[3]}`.toLowerCase()
  }
  const rgb = value.match(/^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/i)
  if (rgb) {
    const hex = rgb.slice(1, 4)
      .map((part) => Math.max(0, Math.min(255, Math.round(Number(part)))).toString(16).padStart(2, '0'))
      .join('')
    return `#${hex}`
  }
  return '#000000'
}

/* Strips the unit off a computed value so it can drive a range input, e.g.
 * "20px" -> 20, "135%" -> 135, ".34" -> 0.34. */
function toNumber(raw, token) {
  const parsed = Number.parseFloat(String(raw || '').trim())
  if (Number.isFinite(parsed)) return parsed
  return typeof token?.min === 'number' ? token.min : 0
}

/* Range tokens round-trip through the same string store as colours, so the
 * unit has to be reattached before the value hits the DOM. */
function formatRange(value, token) {
  const unit = token?.unit ?? ''
  return `${value}${unit}`
}

function isRange(token) {
  return token?.kind === 'range'
}

function readStored() {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || '{}')
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

/* Reads the committed source values by temporarily stripping any inline
 * override, so "重置" always returns to what is actually in the CSS file. */
function readBaseline() {
  const root = document.documentElement
  const saved = ALL_TOKENS.map(({ name }) => [name, root.style.getPropertyValue(name)])
  saved.forEach(([name]) => root.style.removeProperty(name))
  const computed = getComputedStyle(root)
  const baseline = {}
  ALL_TOKENS.forEach((token) => {
    const raw = computed.getPropertyValue(token.name)
    baseline[token.name] = isRange(token)
      ? formatRange(toNumber(raw, token), token)
      : toHex(raw)
  })
  saved.forEach(([name, value]) => { if (value) root.style.setProperty(name, value) })
  return baseline
}

export default function PaletteLab() {
  const [open, setOpen] = useState(false)
  const [baseline, setBaseline] = useState({})
  const [values, setValues] = useState({})
  const [copied, setCopied] = useState(false)

  /* Apply persisted overrides on mount so a reload keeps the tuned palette. */
  useEffect(() => {
    const base = readBaseline()
    setBaseline(base)
    const stored = readStored()
    const merged = { ...base, ...stored }
    setValues(merged)
    Object.entries(stored).forEach(([name, value]) => {
      document.documentElement.style.setProperty(name, value)
    })
  }, [])

  const dirtyTokens = useMemo(
    () => ALL_TOKENS.filter(({ name }) => values[name] && values[name] !== baseline[name]),
    [values, baseline],
  )

  const persist = useCallback((next) => {
    const overrides = {}
    ALL_TOKENS.forEach(({ name }) => {
      if (next[name] && next[name] !== baseline[name]) overrides[name] = next[name]
    })
    try {
      if (Object.keys(overrides).length) {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(overrides))
      } else {
        window.localStorage.removeItem(STORAGE_KEY)
      }
    } catch { /* storage full or blocked; live preview still works */ }
  }, [baseline])

  const handleChange = useCallback((name, raw) => {
    const token = ALL_TOKENS.find((entry) => entry.name === name)
    const value = isRange(token)
      ? formatRange(toNumber(raw, token), token)
      : toHex(raw)
    document.documentElement.style.setProperty(name, value)
    setValues((prev) => {
      const next = { ...prev, [name]: value }
      persist(next)
      return next
    })
    setCopied(false)
  }, [persist])

  const handleReset = useCallback(() => {
    ALL_TOKENS.forEach(({ name }) => document.documentElement.style.removeProperty(name))
    try { window.localStorage.removeItem(STORAGE_KEY) } catch { /* noop */ }
    setValues(baseline)
    setCopied(false)
  }, [baseline])

  /* Exports only what changed, as a paste-ready CSS block. */
  const exportText = useMemo(() => {
    if (!dirtyTokens.length) return '/* 没有改动 */'
    const lines = dirtyTokens.map(({ name }) => `  ${name}: ${values[name]};`)
    return `:root {\n${lines.join('\n')}\n}`
  }, [dirtyTokens, values])

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(exportText)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      setCopied(false)
    }
  }, [exportText])

  if (!isPaletteLabEnabled()) return null

  return (
    <>
      <button
        type="button"
        className="palette-lab-trigger"
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
        aria-controls="palette-lab-panel"
        title="配色编辑器（仅 Preview）"
      >
        <span aria-hidden="true">🎨</span>
        <span className="palette-lab-trigger-label">配色</span>
        {dirtyTokens.length > 0 && (
          <span className="palette-lab-badge" aria-label={`${dirtyTokens.length} 项已修改`}>
            {dirtyTokens.length}
          </span>
        )}
      </button>

      {open && (
        <section id="palette-lab-panel" className="palette-lab-panel" aria-label="配色编辑器">
          <header className="palette-lab-head">
            <div>
              <p className="palette-lab-eyebrow">PALETTE LAB</p>
              <h2 className="palette-lab-title">配色编辑器</h2>
            </div>
            <button type="button" className="palette-lab-close" onClick={() => setOpen(false)} aria-label="关闭配色编辑器">
              ✕
            </button>
          </header>

          <p className="palette-lab-note">
            仅 Preview 环境可见。改动实时生效并保存在本机浏览器，不会影响其他人。调好后复制 token 交给我落进源码。
          </p>

          <div className="palette-lab-groups">
            {TOKEN_GROUPS.map((group) => (
              <div key={group.id} className="palette-lab-group">
                <p className="palette-lab-group-label">{group.label}</p>
                {group.tokens.map((token) => {
                  const fallback = isRange(token) ? formatRange(token.min ?? 0, token) : '#000000'
                  const value = values[token.name] || fallback
                  const changed = value !== baseline[token.name]

                  /* Numeric knobs: slider + live readout, no colour swatch. */
                  if (isRange(token)) {
                    return (
                      <div
                        key={token.name}
                        className="palette-lab-row"
                        data-kind="range"
                        data-changed={changed ? 'true' : 'false'}
                      >
                        <span className="palette-lab-meta">
                          <span className="palette-lab-name">{token.label}</span>
                          {token.hint && <span className="palette-lab-hint">{token.hint}</span>}
                        </span>
                        <input
                          id={`palette-${token.name}`}
                          className="palette-lab-range"
                          type="range"
                          min={token.min}
                          max={token.max}
                          step={token.step}
                          value={toNumber(value, token)}
                          aria-label={token.label}
                          onChange={(event) => handleChange(token.name, event.target.value)}
                        />
                        <output className="palette-lab-readout" htmlFor={`palette-${token.name}`}>
                          {value}
                        </output>
                      </div>
                    )
                  }

                  return (
                    <div key={token.name} className="palette-lab-row" data-changed={changed ? 'true' : 'false'}>
                      <label className="palette-lab-swatch" htmlFor={`palette-${token.name}`}>
                        <input
                          id={`palette-${token.name}`}
                          type="color"
                          value={value}
                          onChange={(event) => handleChange(token.name, event.target.value)}
                        />
                      </label>
                      <span className="palette-lab-meta">
                        <span className="palette-lab-name">{token.label}</span>
                        {token.hint && <span className="palette-lab-hint">{token.hint}</span>}
                      </span>
                      <input
                        className="palette-lab-hex"
                        type="text"
                        value={value}
                        spellCheck="false"
                        aria-label={`${token.label} 色值`}
                        onChange={(event) => {
                          const raw = event.target.value
                          setValues((prev) => ({ ...prev, [token.name]: raw }))
                          if (/^#[0-9a-f]{6}$/i.test(raw.trim())) handleChange(token.name, raw.trim())
                        }}
                      />
                    </div>
                  )
                })}
              </div>
            ))}
          </div>

          <footer className="palette-lab-foot">
            <pre className="palette-lab-export">{exportText}</pre>
            <div className="palette-lab-actions">
              <button type="button" className="palette-lab-btn" onClick={handleReset} disabled={!dirtyTokens.length}>
                重置
              </button>
              <button type="button" className="palette-lab-btn is-primary" onClick={handleCopy} disabled={!dirtyTokens.length}>
                {copied ? '已复制' : '复制 token'}
              </button>
            </div>
          </footer>
        </section>
      )}
    </>
  )
}
