import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'

const dir = new URL('../apps/web/src/styles/', import.meta.url)
const files = (await readdir(dir)).filter((f) => f.endsWith('.css'))
const sources = await Promise.all(
  files.map(async (f) => [f, await readFile(new URL(f, dir), 'utf8')]),
)
const allCss = sources.map(([, css]) => css).join('\n')

// JSX 在行内 style 注入的运行时变量：CSS 里没有定义是正确的。
const RUNTIME_INJECTED = new Set(['--ops-health-percent'])

test('被引用的 --ops-* token 必须真的有定义，不许靠 fallback 字面值撑着', () => {
  const referenced = new Set(
    [...allCss.matchAll(/var\((--ops-[a-z0-9-]+)/gu)].map((m) => m[1]),
  )
  const defined = new Set(
    [...allCss.matchAll(/(--ops-[a-z0-9-]+)\s*:/gu)].map((m) => m[1]),
  )

  const ghosts = [...referenced].filter(
    (t) => !defined.has(t) && !RUNTIME_INJECTED.has(t),
  )
  assert.deepEqual(
    ghosts,
    [],
    `这些 token 从未定义，取值全部落到 fallback，主题切换对它们无效：${ghosts.join(', ')}`,
  )
})

test('下沉表面统一引用 --ops-card-sunken，且不得保留暖底 fallback', () => {
  const borderless = sources.find(([f]) => f === 'borderless.css')[1]

  assert.equal(
    /--ops-surface-sunken/u.test(borderless),
    false,
    'borderless.css 仍在引用不存在的 --ops-surface-sunken',
  )
  assert.equal(
    /#f4f1e8/iu.test(borderless),
    false,
    'borderless.css 仍保留 #f4f1e8 暖底 fallback，冷色收敛会被它悄悄绕过',
  )

  const sunkenRefs = [...borderless.matchAll(/var\(--ops-card-sunken([^)]*)\)/gu)]
  assert.ok(sunkenRefs.length >= 4, `下沉表面引用数异常：${sunkenRefs.length}`)
  for (const [, tail] of sunkenRefs) {
    assert.equal(tail.trim(), '', `--ops-card-sunken 不得带 fallback，实测：${tail}`)
  }
})

test('--ops-card-sunken 只有一处定义，避免主题间再次漂移', () => {
  const hits = sources.flatMap(([f, css]) =>
    [...css.matchAll(/--ops-card-sunken\s*:/gu)].map(() => f),
  )
  assert.deepEqual(hits, ['flat-tokens.css'], `定义点应唯一，实测：${hits.join(', ')}`)
})
