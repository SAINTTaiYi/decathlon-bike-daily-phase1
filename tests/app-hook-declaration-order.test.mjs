import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

/**
 * TDZ 回归防线。
 *
 * App.jsx 里 hook 调用如果引用了在它下方才 const 声明的变量，渲染期会抛
 * ReferenceError: Cannot access 'x' before initialization，被 error boundary
 * 接住就是「日报界面暂时无法显示」白屏。这类错误是纯静态的声明顺序问题，
 * 但源码正则断言抓不到，必须显式校验顺序。
 */

const APP = new URL('../apps/web/src/App.jsx', import.meta.url)

/** 收集组件体内顶层 `const x =` 的首次声明行号。 */
function collectDeclarations(lines) {
  const decls = new Map()
  lines.forEach((line, index) => {
    const match = /^\s{2}const\s+([A-Za-z_$][\w$]*)\s*=/u.exec(line)
    if (match && !decls.has(match[1])) decls.set(match[1], index + 1)
  })
  return decls
}

/** 取一个 hook 调用的实参块（从调用行到配平括号处）。 */
function readCallBlock(lines, startIndex) {
  let depth = 0
  const collected = []
  for (let i = startIndex; i < lines.length; i += 1) {
    const line = lines[i]
    collected.push({ line, lineNo: i + 1 })
    for (const ch of line) {
      if (ch === '(') depth += 1
      else if (ch === ')') depth -= 1
    }
    if (depth <= 0) break
  }
  return collected
}

test('useShipHubReconnectPrompt 的依赖必须先声明后使用（防 TDZ 白屏）', async () => {
  const source = await readFile(APP, 'utf8')
  const lines = source.split('\n')
  const decls = collectDeclarations(lines)

  const callIndex = lines.findIndex((line) => /const\s+shiphubReconnectPrompt\s*=\s*useShipHubReconnectPrompt\(/u.test(line))
  assert.notEqual(callIndex, -1, '未找到 useShipHubReconnectPrompt 调用点')
  const callLineNo = callIndex + 1

  const block = readCallBlock(lines, callIndex)
  const violations = []
  for (const { line, lineNo } of block) {
    const body = line.replace(/\/\/.*$/u, '')
    for (const raw of body.matchAll(/\b([A-Za-z_$][\w$]*)\b/gu)) {
      const name = raw[1]
      if (name === 'shiphubReconnectPrompt') continue
      const declaredAt = decls.get(name)
      if (declaredAt === undefined) continue
      if (declaredAt > lineNo) violations.push(`${name} 声明于第 ${declaredAt} 行，却在第 ${lineNo} 行被使用`)
    }
  }

  assert.deepEqual(
    violations,
    [],
    `hook 调用（第 ${callLineNo} 行）引用了下方才声明的变量，渲染时会抛 TDZ ReferenceError：\n  ${violations.join('\n  ')}`
  )
})

test('App.jsx 组件体内不存在引用后置声明的 hook 调用', async () => {
  const source = await readFile(APP, 'utf8')
  const lines = source.split('\n')
  const decls = collectDeclarations(lines)

  const violations = []
  lines.forEach((line, index) => {
    if (!/^\s{2}const\s+[A-Za-z_$][\w$]*\s*=\s*use[A-Z][\w$]*\(/u.test(line)) return
    const owner = /^\s{2}const\s+([A-Za-z_$][\w$]*)/u.exec(line)[1]
    for (const { line: bodyLine, lineNo } of readCallBlock(lines, index)) {
      const body = bodyLine.replace(/\/\/.*$/u, '')
      for (const raw of body.matchAll(/\b([A-Za-z_$][\w$]*)\b/gu)) {
        const name = raw[1]
        if (name === owner) continue
        const declaredAt = decls.get(name)
        if (declaredAt !== undefined && declaredAt > lineNo) {
          violations.push(`${owner}（第 ${lineNo} 行）引用了第 ${declaredAt} 行才声明的 ${name}`)
        }
      }
    }
  })

  assert.deepEqual(violations, [], `以下 hook 调用会触发 TDZ：\n  ${violations.join('\n  ')}`)
})
