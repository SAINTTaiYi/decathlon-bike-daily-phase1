import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8')
const [board, script] = await Promise.all([
  read('apps/web/src/components/shiphub/ShipHubOrderBoard.jsx'),
  read('apps/web/public/shiphub-pickup-locator.user.js')
])

test('install guide adapts to mobile browsers (Edge Android)', () => {
  // 手机端判定与 Edge 安卓 UA（EdgA/）识别
  assert.match(board, /const isMobileUA = \/Android\|iPhone\|iPad\|Mobile\/i\.test\(ua\)/u)
  assert.match(board, /const isEdgeAndroid = \/Android\/i\.test\(ua\) && \/EdgA\\\/\/\.test\(ua\)/u)
  // 引导卡按平台标记，测试/样式可区分
  assert.match(board, /data-platform=\{isMobileUA \? 'mobile' : 'desktop'\}/u)
  // 手机端安装入口指向 Edge 扩展商店（手机 Edge 装不了 Chrome 网上应用店的扩展）
  assert.match(board, /microsoftedge\.microsoft\.com\/addons\/detail\/tampermonkey\/iikmkjmpaadaobahmlepeloendndfphd/u)
  // 手机端必须引导开启「允许用户脚本」（油猴 5.3+ 在 Edge 安卓同样需要）
  assert.match(board, /Allow User Scripts/u)
})

test('mobile opens the raw .user.js link instead of the tampermonkey.net middle page', () => {
  // Edge 安卓上 tampermonkey.net 一键安装中间页不弹安装框（Tampermonkey issue #2805），
  // 手机端直开脚本链接；桌面端保留官方中间页路径。
  assert.match(board, /if \(isMobileUA\) \{ window\.open\(locatorScriptUrl, '_blank', 'noopener'\); return \}/u)
  assert.match(board, /locatorScriptUrl = \(\(typeof window !== 'undefined' && window\.location\.origin\) \|\| 'https:\/\/workshop\.skin'\) \+ '\/shiphub-pickup-locator\.user\.js'/u)
  assert.match(board, /tampermonkey\.net\/script_installation\.php#url='/u)
  // 手机端保留长按直开脚本的兜底链接
  assert.match(board, /<a href=\{locatorScriptUrl\} target="_blank" rel="noreferrer">这个脚本链接<\/a>/u)
})

test('desktop guide keeps its flow and gets an Edge store link when running in desktop Edge', () => {
  assert.match(board, /const isEdgeDesktop = !isMobileUA && \/Edg\\\/\/\.test\(ua\)/u)
  assert.match(board, /去 Edge 扩展商店安装/u)
  assert.match(board, /去 Chrome 应用商店安装/u)
  assert.match(board, /一键去油猴安装/u)
  assert.match(board, /重新检测/u)
})

test('locator userscript v0.4.0 ships mobile + multi-page + update-check adaptations', () => {
  assert.match(script, /@version\s+0\.4\.0/u)
  // 安装标记版本同步（Workshop 依赖 DOM 属性检测安装状态）
  assert.match(script, /window\.__shiphubLocatorInstalled = \{ installed: true, version: VERSION, outdated: null \}/u)
  assert.match(script, /setAttribute\('data-shiphub-locator', VERSION\)/u)
  // 提示浮层加大触控尺寸（手机可读性）
  assert.match(script, /font-size:15px;line-height:1\.5;box-sizing:border-box/u)
  // 手机端首屏慢时补发「待交接」导航（pushState 同路径幂等）
  assert.match(script, /tryCount <= 20 && tryCount % 4 === 0/u)
  // 跳转目标与匹配域不变：官方待交接页 + workshop 域标记
  assert.match(script, /@match\s+https:\/\/shiphub-asia-cn\.decathlon\.com\.cn\/\*/u)
  assert.match(script, /@match\s+https:\/\/workshop\.skin\/\*/u)
  assert.match(script, /@match\s+https:\/\/bike-ops-preview\.geeklightonefish\.workers\.dev\/\*/u)
  // v0.4.0：三页定位（待交接/待拣货/待收货）
  assert.match(script, /var TARGET_PAGES = \['\/to_handover', '\/to_pick', '\/to_receive'\]/u)
  assert.match(script, /if \(TARGET_PAGES\.indexOf\(location\.pathname\) !== -1\)/u)
  // pick 页搜索框 placeholder 为 Order id 的自定义组件，选择器放宽
  assert.match(script, /input\[placeholder\*="Order id" i\]/u)
  // 展开成功判定不再硬依赖「顾客取货」文案（三页共用）
  assert.match(script, /getAttribute\('aria-expanded'\) === 'true'/u)
  // 更新检测：对比本站脚本 @version，落后时提示并可点击直达更新
  assert.match(script, /function checkForUpdate\(\)/u)
  assert.match(script, /data-shiphub-locator-outdated/u)
  assert.match(script, /isNewer\(m\[1\], VERSION\)/u)
  // 定位成功提示按页面区分
  assert.match(script, /Validate 拣货完成/u)
  assert.match(script, /完成收货确认/u)
})
