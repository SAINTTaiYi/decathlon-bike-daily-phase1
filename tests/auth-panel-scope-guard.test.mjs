import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'
import { transformSync } from 'esbuild'

const SRC = path.resolve(import.meta.dirname, '../apps/web/src')

const walk = (dir) => readdirSync(dir).flatMap((entry) => {
  const full = path.join(dir, entry)
  return statSync(full).isDirectory() ? walk(full) : [full]
})

const sources = walk(SRC).filter((file) => /\.(jsx?|mjs)$/.test(file))

// 把每个源文件编译一遍：esbuild 会把 JSX 转掉，语法错误直接抛出。
// 然后逐文件检查 setXxx / useXxx 形态的标识符是否在同文件内有绑定或导入。
const declared = (code) => new Set([
  ...[...code.matchAll(/\[\s*([A-Za-z0-9_$]+)\s*,\s*([A-Za-z0-9_$]+)\s*\]\s*=/g)].flatMap((m) => [m[1], m[2]]),
  ...[...code.matchAll(/(?:const|let|var|function)\s+([A-Za-z0-9_$]+)/g)].map((m) => m[1]),
  ...[...code.matchAll(/import\s+(?:\*\s+as\s+)?([A-Za-z0-9_$]+)/g)].map((m) => m[1]),
  ...[...code.matchAll(/import\s*\{([^}]*)\}/g)].flatMap((m) => m[1].split(',').map((s) => s.trim().split(/\s+as\s+/).pop()).filter(Boolean)),
  ...[...code.matchAll(/([A-Za-z0-9_$]+)\s*:\s*[A-Za-z0-9_$]+\s*[,}]/g)].map((m) => m[1]),
  ...[...code.matchAll(/\{\s*([^}]*?)\s*\}\s*=/g)].flatMap((m) => m[1].split(',').map((s) => s.trim().split(':').pop().trim()).filter((s) => /^[A-Za-z0-9_$]+$/.test(s))),
])

test('web 源码不存在语法错误，且 React setter 调用都有对应绑定', () => {
  const problems = []
  for (const file of sources) {
    const code = readFileSync(file, 'utf8')
    transformSync(code, { loader: file.endsWith('.jsx') ? 'jsx' : 'js', jsx: 'automatic' })
    const bound = declared(code)
    const GLOBALS = new Set(['setTimeout', 'setInterval', 'setImmediate'])
    const calls = new Set([...code.matchAll(/(?<![.\w$])(set[A-Z][A-Za-z0-9_$]*)\s*\(/g)].map((m) => m[1]))
    for (const name of calls) {
      if (GLOBALS.has(name)) continue
      if (!bound.has(name)) problems.push(`${path.relative(SRC, file)} 调用了未绑定的 ${name}`)
    }
  }
  assert.deepEqual(problems, [], `发现未定义的 setter 调用：\n${problems.join('\n')}`)
})
