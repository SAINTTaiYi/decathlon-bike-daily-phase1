// 本机快照（2026-09-13，应急方案 C）：
// D1 读额度被限 / 断网时，工作台退回「最近一次成功加载的数据」，而不是只剩一个错误页。
//
// 设计约束：
//   ① 只存看板必需字段（业务日 / 销售 / 记录 / 门店 / 成员）；不存会话、凭据、审计流水；
//   ② 键按门店隔离（多店账号/后台切换门店互不串数据）；
//   ③ 超过体积上限（1.5MB）直接放弃写入 —— 快照永远不许拖垮正常刷新；
//   ④ 任何异常静默（localStorage 配额、隐私模式等）。

const PREFIX = 'bike-ops:workflow-snapshot'
export const WORKFLOW_SNAPSHOT_MAX_BYTES = 1_500_000

export function workflowSnapshotKey(storeId) {
  return `${PREFIX}:${storeId || 'default'}`
}

/** 从 workflow state 提炼快照载荷（白名单字段，防未来误加敏感字段）。 */
export function buildWorkflowSnapshotPayload(state) {
  return {
    businessDate: state?.businessDate || '',
    day: state?.day || null,
    records: Array.isArray(state?.records) ? state.records : [],
    store: state?.store || null,
    members: Array.isArray(state?.members) ? state.members : []
  }
}

export function saveWorkflowSnapshot(storeId, state, now = new Date()) {
  if (typeof window === 'undefined' || !window.localStorage) return false
  try {
    const serialized = JSON.stringify({ savedAt: now.toISOString(), payload: buildWorkflowSnapshotPayload(state) })
    if (serialized.length > WORKFLOW_SNAPSHOT_MAX_BYTES) return false
    window.localStorage.setItem(workflowSnapshotKey(storeId), serialized)
    return true
  } catch {
    return false
  }
}

export function loadWorkflowSnapshot(storeId) {
  if (typeof window === 'undefined' || !window.localStorage) return null
  try {
    const raw = window.localStorage.getItem(workflowSnapshotKey(storeId))
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (!parsed || !parsed.payload || !Array.isArray(parsed.payload.records)) return null
    return { savedAt: typeof parsed.savedAt === 'string' ? parsed.savedAt : '', payload: parsed.payload }
  } catch {
    return null
  }
}

export function clearWorkflowSnapshot(storeId) {
  if (typeof window === 'undefined' || !window.localStorage) return
  try {
    window.localStorage.removeItem(workflowSnapshotKey(storeId))
  } catch {
    // 忽略
  }
}
