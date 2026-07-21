import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const app = readFileSync(new URL('../apps/web/src/App.jsx', import.meta.url), 'utf8')
const motion = readFileSync(new URL('../apps/web/src/hooks/useMotionSystem.js', import.meta.url), 'utf8')
const lineText = readFileSync(new URL('../apps/web/src/components/VisualLineText.jsx', import.meta.url), 'utf8')
const styles = readFileSync(new URL('../apps/web/src/styles/motion.css', import.meta.url), 'utf8')
const component = (path) => readFileSync(new URL(path, import.meta.url), 'utf8')

test('标题、介绍和品牌刊头使用语义化 editorial reveal 标记', () => {
  assert.match(component('../apps/web/src/components/lookbook/LookbookHeader.jsx'), /data-editorial-logo/)
  assert.match(component('../apps/web/src/components/lookbook/ClosingSummary.jsx'), /VisualLineText/)
  assert.match(component('../apps/web/src/components/lookbook/LookbookPrimitives.jsx'), /data-editorial-description/)
  assert.match(component('../apps/web/src/components/lookbook/MainHeadImage.jsx'), /VisualLineText/)
  assert.match(component('../apps/web/src/components/BootLoader.jsx'), /VisualLineText/)
  assert.match(component('../apps/web/src/components/BootLoader.jsx'), /data-editorial-pending="true"/)
  assert.match(component('../apps/web/src/components/InitialSetup.jsx'), /data-editorial-page/)
  assert.match(component('../apps/web/src/components/PasswordChangeGate.jsx'), /data-editorial-page/)
})

test('视觉行按真实换行测量，但动效目标始终是整行而非字或词', () => {
  assert.match(lineText, /ResizeObserver/)
  assert.match(lineText, /node\.offsetTop/)
  assert.match(lineText, /data-visual-line-measure/)
  assert.match(lineText, /visual-line-text__line/)
  assert.match(lineText, /completed visual line, never a character or word/)
  assert.match(styles, /visual-line-text__line \{ display: block; overflow: hidden; \}/)
})

test('首次页面保持 120ms 空白后按 logo、标题行、介绍的克制时间轴进入', () => {
  assert.match(motion, /window\.setTimeout\([\s\S]*?, 120\)/)
  assert.match(component('../apps/web/src/components/BootLoader.jsx'), /window\.setTimeout\([\s\S]*?, 120\)/)
  assert.match(motion, /duration: 450/)
  assert.match(motion, /duration: 500/)
  assert.match(motion, /stagger: 50/)
  assert.match(motion, /duration: 550/)
  assert.match(motion, /cubic-bezier\(0\.22, 0\.61, 0\.36, 1\)/)
  assert.match(motion, /window\.setTimeout\([\s\S]*?, 1370\)/)
  assert.match(motion, /reveal\(container, animations, 700\)/)
})

test('滚出再滚回会重新播放，且不使用 scale、rotate、blur、3D 或滚动监听', () => {
  assert.match(motion, /if \(!entry\.isIntersecting\)[\s\S]*?reset\(container, animations\)/)
  assert.match(motion, /!initial\.has\(container\) \|\| exited\.has\(container\)/)
  assert.match(motion, /target\.animate/)
  assert.doesNotMatch(motion, /scale|rotation|rotate|blur|translateZ|z:/i)
  assert.doesNotMatch(motion, /addEventListener\('scroll'/)
  assert.doesNotMatch(app, /useWorkspaceMotion|workspaceLaunching|workspace-depth-plane|workspace-launch-overlay/)
})

test('图片与功能模块不再进入页面滚动 reveal 路径', () => {
  assert.doesNotMatch(component('../apps/web/src/components/lookbook/MainHeadImage.jsx'), /data-motion|data-workspace-module|data-depth-card/)
  assert.doesNotMatch(component('../apps/web/src/scenes/PulseScene.jsx'), /data-motion|data-spatial-tilt|data-depth-section/)
  assert.doesNotMatch(component('../apps/web/src/components/lookbook/RecordLedger.jsx'), /data-motion|data-spatial-tilt|data-reveal-group/)
})
