/*
 * Preview-only connection-state simulator.
 *
 * Preview runs Shiphub in fixture mode, so the "未连接" and "需重新授权" notices
 * never appear there naturally — reviewing them otherwise means waiting for a
 * real refresh token to die on staging. This forces the rendered state.
 *
 * Constraints, matching PaletteLab:
 * - Preview / localhost hosts ONLY. Never renders on workshop.skin.
 * - Display layer only: it overrides the status the board renders, not the
 *   backend state. The reconnect button still performs the real action.
 * - Client-side localStorage. No API calls, no D1, no storage cost.
 */
import { SIMULATED_STATUSES } from '../../hooks/useShipHub.js'

const LABELS = {
  fixture: '演示数据',
  connected: '已连接',
  reauth_required: '需重新授权',
  disconnected: '未连接',
}

export default function ShipHubConnectionSimulator({ available = false, active = '', onSimulate }) {
  if (!available) return null
  return (
    <div className="shiphub-connection-sim" role="group" aria-label="连接状态模拟（仅 Preview）">
      <strong>状态模拟</strong>
      <small>仅 Preview 可见，不影响真实连接</small>
      <div className="shiphub-connection-sim-options">
        <button
          type="button"
          data-active={active ? 'false' : 'true'}
          aria-pressed={active ? 'false' : 'true'}
          onClick={() => onSimulate?.('')}
        >真实状态</button>
        {SIMULATED_STATUSES.map((status) => (
          <button
            key={status}
            type="button"
            data-active={active === status ? 'true' : 'false'}
            aria-pressed={active === status ? 'true' : 'false'}
            onClick={() => onSimulate?.(status)}
          >{LABELS[status] || status}</button>
        ))}
      </div>
    </div>
  )
}
