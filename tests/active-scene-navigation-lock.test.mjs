import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const hook = fs.readFileSync(path.join(root, 'apps/web/src/hooks/useActiveScene.js'), 'utf8')
const app = fs.readFileSync(path.join(root, 'apps/web/src/App.jsx'), 'utf8')

test('dock navigation locks the requested module until it arrives', () => {
  assert.match(hook, /const navigationRef = useRef\(null\)/)
  assert.match(hook, /if \(navigationRef\.current\) return/)
  assert.match(hook, /setActiveScene\(id\)[\s\S]*?section\.scrollIntoView/s)
  assert.match(hook, /isAtNavigationTarget\(section\)/)
})

test('manual scroll intent releases a pending dock-navigation lock', () => {
  for (const eventName of ['pointerdown', 'touchstart', 'wheel', 'keydown', 'scrollend']) {
    assert.ok(hook.includes(eventName), `missing ${eventName} cancellation listener`)
  }
  assert.match(hook, /scrollKeys/)
  assert.doesNotMatch(hook, /preventDefault/)
  assert.ok(hook.includes('cancelNavigation()'))
})

test('credential login resets persisted document scroll before the workspace becomes interactive', () => {
  assert.match(app, /useLayoutEffect/)
  assert.match(app, /auth\.source !== 'login'/)
  assert.match(app, /root\.style\.scrollBehavior = 'auto'/)
  assert.match(app, /window\.scrollTo\(\{ top: 0, left: 0, behavior: 'auto' \}\)/)
  assert.match(app, /window\.requestAnimationFrame\(\(\) => \{/)
})
