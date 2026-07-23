import { useEffect, useState } from 'react'
import { OPERATIONS_DAY_PREFIX, OPERATIONS_LEDGER_KEY } from '../../data/operationsData.js'
import AppDialog from './AppDialog.jsx'
import SignalTaskState from '../SignalTaskState.jsx'

function stripPickupCodes(value) {
  if (Array.isArray(value)) return value.map(stripPickupCodes)
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(Object.entries(value).filter(([key]) => !['pickupCode', 'verificationCode', '取货码'].includes(key)).map(([key, nested]) => [key, stripPickupCodes(nested)]))
}

async function sourcePayload() {
  const ledgerRaw = window.localStorage.getItem(OPERATIONS_LEDGER_KEY)
  if (!ledgerRaw) return null
  const ledger = stripPickupCodes(JSON.parse(ledgerRaw))
  const days = []
  for (let index = 0; index < window.localStorage.length; index += 1) {
    const key = window.localStorage.key(index)
    if (key?.startsWith(`${OPERATIONS_DAY_PREFIX}:`)) days.push(stripPickupCodes(JSON.parse(window.localStorage.getItem(key))))
  }
  const bytes = new TextEncoder().encode(JSON.stringify({ ledger, days }))
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  const sourceFingerprint = [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, '0')).join('')
  return { sourceFingerprint, ledger, days, confirmed: true }
}

export function hasLocalV5Data() {
  try { return Boolean(window.localStorage.getItem(OPERATIONS_LEDGER_KEY)) } catch { return false }
}

export default function LocalMigrationDialog({ open, onClose, workflow, onNotify }) {
  const [plan, setPlan] = useState(null)
  const [payload, setPayload] = useState(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!open) return
    setPlan(null)
    setPayload(null)
    setError('')
    setBusy(true)
    sourcePayload().then(async (nextPayload) => {
      if (!nextPayload) throw new Error('当前浏览器没有找到 v5 本机数据。')
      setPayload(nextPayload)
      setPlan(await workflow.previewLocalV5(nextPayload))
    }).catch((requestError) => setError(requestError.message)).finally(() => setBusy(false))
  }, [open])

  const submit = async () => {
    if (!payload) return
    setBusy(true)
    try {
      const result = await workflow.planLocalV5Import(payload)
      if (!result.ok) throw new Error(result.error)
      onNotify?.(`旧 v5 数据已导入：${result.acceptedCount} 条成功，${result.rejectedCount} 条需修复；原本机数据仍保留`)
      onClose()
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <AppDialog open={open} onClose={onClose} title="迁移旧本机数据" eyebrow="LOCAL V5 · 显式迁移" description="只有你确认后，当前浏览器中的 v5 数据才会提交至服务器。取货码字段会在本机剥离；原数据不会自动删除。" signalModule="other" registration="MIGRATION / REVIEW">
      {busy && !plan ? <SignalTaskState tone="loading" title="正在检查本机数据" description="剥离取货码并生成可导入、需修复与日报日期摘要。" /> : null}
      {plan ? <><dl className="migration-summary"><div><dt>可导入记录</dt><dd>{plan.acceptedCount}</dd></div><div><dt>需修复记录</dt><dd>{plan.rejectedCount}</dd></div><div><dt>日报日期</dt><dd>{plan.dayCount}</dd></div></dl>{plan.rejectedCount ? <p className="form-error" role="status">{plan.rejectedCount} 条记录缺少新数据库要求的结构化字段，本次不会导入。</p> : null}</> : null}
      {error ? <SignalTaskState tone="error" title="本机数据检查未完成" description={error} compact /> : null}
      <p className="conditional-field-note"><strong>敏感数据提醒</strong><span>旧台账可能包含手机号或会员号。提交后先进入管理员审核和字段修复，不会静默覆盖现有数据库记录。</span></p>
      <div className="dialog-footer"><button type="button" className="secondary-action" onClick={onClose} disabled={busy}>暂不迁移</button><button type="button" className="primary-action" onClick={submit} disabled={busy || !plan}>{busy ? '正在提交…' : '确认并导入合法记录'}</button></div>
    </AppDialog>
  )
}
