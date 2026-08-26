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
]

const ALL_TOKENS = TOKEN_GROUPS.flatMap((group) => group.tokens)

/* Only ever active on preview + local hosts. Checked at runtime rather than
 * build time because preview and production share one build artifact. */
export function isPaletteLabEnabled() {
  if (typeof window === 'undefined') return false
  const host = window.location.hostname
  return host === 'localhost' || host === '127.0.0.1' || host.endsWith('.workers.dev')
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
  ALL_TOKENS.forEach(({ name }) => { baseline[name] = toHex(computed.getPropertyValue(name)) })
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
    const hex = toHex(raw)
    document.documentElement.style.setProperty(name, hex)
    setValues((prev) => {
      const next = { ...prev, [name]: hex }
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
                  const value = values[token.name] || '#000000'
                  const changed = value !== baseline[token.name]
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
