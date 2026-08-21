import assert from 'node:assert/strict'
import test from 'node:test'
import { SHIPHUB_ALERT_THRESHOLD, shouldAlertOnShipHubFailure } from '../src/services/shiphub-alert.js'

test('ShipHub 告警阈值：3 次首报，之后每 +10 次补报，之前不报', () => {
  assert.equal(SHIPHUB_ALERT_THRESHOLD, 3)
  for (let failures = 0; failures < 3; failures += 1) {
    assert.equal(shouldAlertOnShipHubFailure(failures), false, `${failures} 次不应告警`)
  }
  assert.equal(shouldAlertOnShipHubFailure(3), true, '跨过阈值首报')
  assert.equal(shouldAlertOnShipHubFailure(4), false)
  assert.equal(shouldAlertOnShipHubFailure(12), false)
  assert.equal(shouldAlertOnShipHubFailure(13), true, '阈值后每 10 次补报')
  assert.equal(shouldAlertOnShipHubFailure(22), false)
  assert.equal(shouldAlertOnShipHubFailure(23), true)
  assert.equal(shouldAlertOnShipHubFailure(100), false)
  assert.equal(shouldAlertOnShipHubFailure(103), true)
})
