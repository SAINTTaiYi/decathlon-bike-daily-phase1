import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import { normalizeShipHubLocationNum } from '../src/lib/shiphub-location.js'

// ── 门店位置标识规范化（2026-09-19 事故回归）─────────────────────────────
// 1670 门店以短码「1670」连接，上游 pick/ship 端点在解析门店时调用其位置
// 服务失败（500 / 417），两个分类自接入起持续失败 8 小时。
// 规则：partyNumber = `0070{门店号}0{门店号}`（三家门店样本反推并验证）。

test('短码展开为 partyNumber，长码与非法输入原样透传', () => {
  assert.equal(normalizeShipHubLocationNum('1670'), '0070167001670', '正是本次事故的门店')
  assert.equal(normalizeShipHubLocationNum('1299'), '0070129901299', '五象店样本')
  assert.equal(normalizeShipHubLocationNum('1297'), '0070129701297', '钟村店样本')
  assert.equal(normalizeShipHubLocationNum('1298'), '0070129801298', '潭西店样本')
  assert.equal(normalizeShipHubLocationNum(' 1670 '), '0070167001670', '首尾空白必须先清理')
  assert.equal(normalizeShipHubLocationNum('0070129901299'), '0070129901299', '已是长码不得二次展开')
  assert.equal(normalizeShipHubLocationNum(''), null)
  assert.equal(normalizeShipHubLocationNum('   '), null)
  assert.equal(normalizeShipHubLocationNum(null), null)
  assert.equal(normalizeShipHubLocationNum(undefined), null)
  assert.equal(normalizeShipHubLocationNum('AB-12'), 'AB-12', '无法识别的输入原样透传（不猜测、不拦截）')
})

test('连接存储与上游读取两条路径都必须经规范化（防回归）', async () => {
  const routes = await readFile(new URL('../src/routes/shiphub.ts', import.meta.url), 'utf8')
  assert.match(routes, /normalizeShipHubLocationNum\(login\?\.locationNum\)/u, '连接时必须规范化后入库（1670 事故根因）')
  const sync = await readFile(new URL('../src/services/shiphub-sync.ts', import.meta.url), 'utf8')
  assert.match(sync, /normalizeShipHubLocationNum\(row\.location_num\)/u, '读取路径必须规范化（历史短码行无需人工修数即可自愈）')
})
