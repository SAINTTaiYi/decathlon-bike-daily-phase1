import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'

const app = await readFile(new URL('../apps/web/src/App.jsx', import.meta.url), 'utf8')
const css = await readFile(new URL('../apps/web/src/styles/workshop-system.css', import.meta.url), 'utf8')
const index = await readFile(new URL('../apps/web/src/styles/index.css', import.meta.url), 'utf8')
const tokens = await readFile(new URL('../apps/web/src/styles/tokens.css', import.meta.url), 'utf8')

test('主工作台不再挂载旧纸张磨损和三维深度装饰层', () => {
  for (const layer of ['workspace-paper-film', 'workspace-paper-fibre', 'workspace-paper-scratches', 'workspace-depth-plane-far', 'workspace-depth-plane-near']) {
    assert.doesNotMatch(app, new RegExp(layer, 'u'))
  }
  assert.doesNotMatch(index, /endfield\.css|desktop-endfield\.css|noto-serif-sc\.css/u)
})

test('唯一运行设计层采用 DESIGN.md 暖白、黑色和信号黄 token', () => {
  for (const rule of [
    /--ops-page: #f7f5ef/u,
    /--ops-card: #fffdf8/u,
    /--ops-black: #0c0e0c/u,
    /--ops-yellow: #[0-9a-fA-F]{6}/u,
    /--ops-radius: 8px/u,
    /--ops-card-shadow: 0 5px 18px/u,
    /@media \(prefers-reduced-motion: reduce\)/u,
    /@media \(forced-colors: active\)/u
  ]) assert.match(css, rule)
  assert.match(tokens, /--accent: var\(--ops-yellow, #[0-9a-fA-F]{6}\)/u)
  assert.doesNotMatch(tokens, /#075dff/u)
})


test('认证与安全入口不再声明已废弃主题，正文使用自托管中文字体且无系统 fallback', async () => {
  const sources = await Promise.all([
    'BootLoader.jsx',
    'InitialSetup.jsx',
    'PasswordChangeGate.jsx',
    'PlatformAdminSetup.jsx',
    'RegistrationWizard.jsx'
  ].map((name) => readFile(new URL(`../apps/web/src/components/${name}`, import.meta.url), 'utf8')))
  for (const source of sources) assert.doesNotMatch(source, /data-ark-theme|data-ark-depth|endfield/u)
  assert.match(tokens, /--font-body: 'Noto Sans SC Variable'/u)
  assert.match(tokens, /--font-display: 'Barlow Condensed Ops', 'Noto Sans SC Variable'/u)
  assert.doesNotMatch(tokens, /Albert Sans Local|Noto Serif SC Variable|sans-serif|system-ui/u)
  // 登录页视觉由 boot.css 独占（2026-08-28 重做）：workshop 层不得再覆盖登录表面，
  // 否则会把 boot.css 的浅底卡片刷成旧的深色主题。
  for (const leaked of [/^\.boot-sequence \{/mu, /^\.boot-login \{/mu, /^\.boot-login-submit \{/mu]) {
    assert.doesNotMatch(css, leaked)
  }
})
