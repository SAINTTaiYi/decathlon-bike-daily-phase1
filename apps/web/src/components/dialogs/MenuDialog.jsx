import { useState } from 'react'
import IconRefresh from '@iconoir/Refresh.mjs'
import IconNotes from '@iconoir/Notes.mjs'
import IconUndo from '@iconoir/UndoAction.mjs'
import IconLogOut from '@iconoir/LogOut.mjs'
import IconUpload from '@iconoir/Upload.mjs'
import IconUserPlus from '@iconoir/UserPlus.mjs'
import IconJournal from '@iconoir/Journal.mjs'
import IconShield from '@iconoir/Shield.mjs'
import AppDialog from './AppDialog.jsx'

export default function MenuDialog({ open, onClose, onUndo, canUndo, onCopyReport, onReset, locked, currentUser, currentRole, currentStore, onSwitchUser, hasLocalData, onMigrate, canGovernance, onGovernance, onOpenPermanentHistory, canAdmin, onAdmin }) {
  const [confirmReset, setConfirmReset] = useState(false)
  const [confirmSwitch, setConfirmSwitch] = useState(false)
  const [busy, setBusy] = useState(false)
  const close = () => {
    if (busy) return
    setConfirmReset(false)
    setConfirmSwitch(false)
    onClose()
  }

  const undo = async () => {
    setBusy(true)
    await onUndo()
    setBusy(false)
  }

  const reset = async () => {
    setBusy(true)
    const result = await onReset()
    setBusy(false)
    if (result?.ok) close()
  }

  const logout = async () => {
    setBusy(true)
    await onSwitchUser()
    setBusy(false)
  }

  return (
    <AppDialog open={open} onClose={close} title="日报菜单" eyebrow={`SIGNED IN · ${currentUser}`} description="复制当日报告、撤回最近操作、迁移旧数据，或重置今天的销售数据。所有正式修改由服务器写入数据库。">
      <div className="signed-in-user" aria-label={`当前登录用户：${currentUser}`}>
        <span>{currentStore} · {currentRole}</span>
        <strong>{currentUser}</strong>
      </div>
      <button type="button" className="dialog-action" onClick={undo} disabled={!canUndo || busy}><IconUndo width={20} height={20} aria-hidden="true" /><span><strong>{busy ? '正在处理…' : '撤回最近操作'}</strong><small>仅恢复当前仍可安全撤回的最近一次数据库操作。</small></span></button>
      <button type="button" className="dialog-action" onClick={onCopyReport} disabled={busy}><IconNotes width={20} height={20} aria-hidden="true" /><span><strong>复制当日报告</strong><small>复制销售数据、闭店状态和今天发生的台账操作。</small></span></button>
      <button type="button" className="dialog-action" onClick={() => { close(); onOpenPermanentHistory?.() }} disabled={busy}><IconJournal width={20} height={20} aria-hidden="true" /><span><strong>永久操作历史</strong><small>按日期和模块查询数据库审计记录，跨日清理不会删除。</small></span></button>
      {canGovernance ? <button type="button" className="dialog-action" onClick={() => { close(); onGovernance?.() }} disabled={busy}><IconUserPlus width={20} height={20} aria-hidden="true" /><span><strong>门店与权限治理</strong><small>申请提权或调店；CHU13 与目标门店管理员在此审批。</small></span></button> : null}
      {canAdmin ? <button type="button" className="dialog-action" onClick={() => { close(); onAdmin?.() }} disabled={busy}><IconShield width={20} height={20} aria-hidden="true" /><span><strong>平台管理后台</strong><small>全国目录、审批队列、用户与平台审计。</small></span></button> : null}
      {hasLocalData ? <button type="button" className="dialog-action" onClick={() => { close(); onMigrate() }} disabled={busy}><IconUpload width={20} height={20} aria-hidden="true" /><span><strong>迁移旧本机数据</strong><small>显式检查当前浏览器的 v5 台账，并创建管理员导入审核。</small></span></button> : null}
      {confirmReset ? (
        <div className="danger-confirm" role="alert"><strong>确认清空今天的销售数据？</strong><div><button type="button" onClick={() => setConfirmReset(false)} disabled={busy}>保留数据</button><button type="button" className="danger-action" disabled={locked || busy} onClick={reset}>{busy ? '正在清空…' : '清空销售数据'}</button></div></div>
      ) : (
        <button type="button" className="dialog-action" onClick={() => setConfirmReset(true)} disabled={locked || busy}><IconRefresh width={20} height={20} aria-hidden="true" /><span><strong>重置当日日报</strong><small>{locked ? '闭店或离线状态下不能重置。' : '只清空今天的销售数据，不删除长期业务台账。'}</small></span></button>
      )}
      {confirmSwitch ? (
        <div className="identity-confirm" role="alert"><strong>退出当前账号？</strong><p>未提交的表单内容会丢失；已同步至数据库的数据与审计记录不受影响。</p><div><button type="button" onClick={() => setConfirmSwitch(false)} disabled={busy}>继续使用 {currentUser}</button><button type="button" className="identity-switch-action" onClick={logout} disabled={busy}>{busy ? '正在退出…' : '退出登录'}</button></div></div>
      ) : (
        <button type="button" className="dialog-action" onClick={() => setConfirmSwitch(true)} disabled={busy}><IconLogOut width={20} height={20} aria-hidden="true" /><span><strong>退出登录</strong><small>撤销当前浏览器会话，返回账号登录页。</small></span></button>
      )}
    </AppDialog>
  )
}
