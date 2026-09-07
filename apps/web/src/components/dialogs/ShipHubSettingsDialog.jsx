import { useState } from 'react'
import AppDialog from './AppDialog.jsx'

export default function ShipHubSettingsDialog({ open, onClose, shiphub, onNotify, canManage = false }) {
  const [busy, setBusy] = useState(false)
  const [showStoreLogin, setShowStoreLogin] = useState(false)
  const [storeLogin, setStoreLogin] = useState({ username: '', password: '', locationNum: '' })
  if (!open) return null
  const connection = shiphub?.summary?.connection
  const fixture = shiphub?.summary?.mode === 'fixture'
  const status = fixture ? 'fixture' : connection?.authorizationStatus || 'disconnected'
  // 未连接时本店账号表单默认展开：新门店接入的唯一路径就是填本店账号。
  // 不能折叠进"高级"——新店管理员找不到入口会误用部署级共享凭据（被身份互斥拒绝）。
  const effectiveShowStoreLogin = showStoreLogin || (!fixture && status !== 'connected' && canManage)
  const set = (field) => (event) => setStoreLogin((current) => ({ ...current, [field]: event.target.value }))
  const connect = async () => {
    setBusy(true)
    try {
      const hasStoreLogin = Boolean(storeLogin.username || storeLogin.password || storeLogin.locationNum)
      const result = await shiphub.connect('/', hasStoreLogin ? {
        username: storeLogin.username.trim(),
        password: storeLogin.password,
        locationNum: storeLogin.locationNum.trim() || undefined
      } : null)
      if (result?.authorizationUrl) window.location.assign(result.authorizationUrl)
      else if (result?.connected) {
        await shiphub.refresh?.()
        onNotify?.({ message: 'Shiphub 已连接，正在同步门店订单。', tone: 'success' })
      }
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
    <AppDialog open={open} onClose={() => { if (!busy) onClose() }} title="Shiphub 连接" eyebrow="SINGLE-STORE SSO" description="填写本店的 Shiphub 门店账号完成连接。凭据以 AES-256-GCM 加密保存在 Cloudflare 本店专属行，自动重连与同步只使用本店身份，绝不落日志或业务库。">
      <div className="signed-in-user"><span>当前状态 · {fixture ? 'Preview fixture' : status === 'connected' ? '已连接' : status === 'degraded' ? '同步异常' : status === 'reauth_required' ? '需要重新授权' : '未连接'}</span><strong>{fixture ? 'Synthetic data only' : 'Shiphub read-only'}</strong></div>
      <p className="dialog-copy">页面打开、切换模块和普通刷新只读取 Workshop D1 缓存，不直接访问 Shiphub。手工确认也只写入本地操作覆盖层。</p>
      {fixture ? <p className="dialog-copy">Preview 只使用仓库内人工构造的 fixture，不启用 SSO，也不会访问真实 Shiphub。</p> : <>
        {status === 'connected' ? <button type="button" className="dialog-action" onClick={disconnect} disabled={busy}><span><strong>{busy ? '正在断开…' : '断开 Shiphub'}</strong><small>删除当前门店的本地 refresh token，不影响手工台账。</small></span></button> : null}
        <button type="button" className="dialog-action" onClick={connect} disabled={busy}><span><strong>{busy ? '正在验证并连接…' : (status === 'connected' ? '更新账号并重连' : '连接 Shiphub')}</strong><small>{effectiveShowStoreLogin ? '使用上方本店账号完成 IdP 登录与授权（OAuth2 authorization code + PKCE）。' : '使用已保存的本店账号自动完成 IdP 登录与授权。'}</small></span></button>
        {canManage ? <button type="button" className="dialog-toggle" onClick={() => setShowStoreLogin((current) => !current)} aria-expanded={effectiveShowStoreLogin}><span>{effectiveShowStoreLogin ? '收起本店账号' : '更换本店 ShipHub 账号'}</span></button> : <p className="dialog-copy">本店 ShipHub 账号由门店管理员设置；操作员可直接重新连接。</p>}
        {canManage && effectiveShowStoreLogin ? <form className="data-form" data-motion="summary" onSubmit={(event) => { event.preventDefault(); void connect() }}>
          <label className="field-row"><span>门店账号用户名</span><input autoComplete="off" maxLength="128" value={storeLogin.username} onChange={set('username')} placeholder="本店的 ShipHub 门店账号" /></label>
          <label className="field-row"><span>门店账号密码</span><input type="password" autoComplete="new-password" maxLength="128" value={storeLogin.password} onChange={set('password')} placeholder="对应账号密码" /></label>
          <label className="field-row"><span>location_num（可选）</span><input autoComplete="off" maxLength="32" value={storeLogin.locationNum} onChange={set('locationNum')} placeholder="留空则使用部署默认值" /></label>
          <p className="dialog-copy">保存后凭据以 AES-256-GCM 加密存入 Cloudflare 本店专属行，自动重连与定时同步只使用本店身份；同一账号不能同时连接两家门店。</p>
        </form> : null}
      </>}
      {status === 'reauth_required' ? <p className="dialog-error" role="alert">上次同步需要重新授权；点击「连接 Shiphub」即可自动恢复。</p> : null}
      {status === 'degraded' ? <p className="dialog-error" role="alert">连接状态正常但上一轮同步失败，可能是授权凭据已失效。请点击「连接 Shiphub」重新授权。</p> : null}
    </AppDialog>
  )
}
