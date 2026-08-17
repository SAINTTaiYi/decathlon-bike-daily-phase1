import { useState } from 'react'
import AppDialog from './AppDialog.jsx'

export default function ShipHubSettingsDialog({ open, onClose, shiphub, onNotify }) {
  const [busy, setBusy] = useState(false)
  if (!open) return null
  const connection = shiphub?.summary?.connection
  const fixture = shiphub?.summary?.mode === 'fixture'
  const status = fixture ? 'fixture' : connection?.authorizationStatus || 'disconnected'
  const connect = async () => {
    setBusy(true)
    try {
      const result = await shiphub.connect('/')
      if (result?.authorizationUrl) window.location.assign(result.authorizationUrl)
    } catch (error) {
      onNotify?.({ message: error?.message || '无法开始 Shiphub 授权', tone: 'error' })
    } finally {
      setBusy(false)
    }
  }
  const disconnect = async () => {
    setBusy(true)
    try {
      await shiphub.disconnect()
      onNotify?.('Shiphub 已断开；手工台账不受影响。')
    } catch (error) {
      onNotify?.({ message: error?.message || '无法断开 Shiphub', tone: 'error' })
    } finally {
      setBusy(false)
    }
  }
  return (
    <AppDialog open={open} onClose={() => { if (!busy) onClose() }} title="Shiphub 连接" eyebrow="SINGLE-STORE SSO" description="只连接当前账号主动授权的门店。密码只会提交到 Shiphub / Decathlon IdP 页面，Workshop 不接收或保存密码。">
      <div className="signed-in-user"><span>当前状态 · {fixture ? 'Preview fixture' : status === 'connected' ? '已连接' : status === 'reauth_required' ? '需要重新授权' : '未连接'}</span><strong>{fixture ? 'Synthetic data only' : 'Shiphub read-only'}</strong></div>
      <p className="dialog-copy">页面打开、切换模块和普通刷新只读取 Workshop D1 缓存，不直接访问 Shiphub。手工确认也只写入本地操作覆盖层。</p>
      {fixture ? <p className="dialog-copy">Preview 只使用仓库内人工构造的 fixture，不启用 SSO，也不会访问真实 Shiphub。</p> : status === 'connected' ? <button type="button" className="dialog-action" onClick={disconnect} disabled={busy}><span><strong>{busy ? '正在断开…' : '断开 Shiphub'}</strong><small>删除当前门店的本地 refresh token，不影响手工台账。</small></span></button> : <button type="button" className="dialog-action" onClick={connect} disabled={busy}><span><strong>{busy ? '正在打开授权…' : '连接 Shiphub'}</strong><small>跳转到 IdP 完成 OAuth2 authorization code + PKCE 授权。</small></span></button>}
      {status === 'reauth_required' ? <p className="dialog-error" role="alert">上次同步需要重新授权；不会显示或要求输入 Shiphub 密码。</p> : null}
    </AppDialog>
  )
}
