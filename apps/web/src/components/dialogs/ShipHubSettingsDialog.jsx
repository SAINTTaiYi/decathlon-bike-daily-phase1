import { useEffect, useRef, useState } from 'react'
import AppDialog from './AppDialog.jsx'

export default function ShipHubSettingsDialog({ open, onClose, shiphub, onNotify, canManage = false }) {
  const [busy, setBusy] = useState(false)
  // 账号表单的展开态（2026-09-18 用户定案）：本店账号已配置时默认收起。
  const [editingLogin, setEditingLogin] = useState(false)
  const [storeLogin, setStoreLogin] = useState({ username: '', password: '', locationNum: '' })
  const usernameRef = useRef(null)

  // 关闭即收起编辑态：下次打开回到「已配置」的紧凑形态，不残留上一次的展开状态。
  useEffect(() => {
    if (!open) setEditingLogin(false)
  }, [open])

  if (!open) return null
  const connection = shiphub?.summary?.connection
  const fixture = shiphub?.summary?.mode === 'fixture'
  const status = fixture ? 'fixture' : connection?.authorizationStatus || 'disconnected'
  // 本店账号是否已配置（服务端 connection.hasPerStoreLogin；preview 可用状态模拟覆盖展示值）。
  //
  // 已配置 → 紧凑态：只给一个「更改账号密码」按钮，点开才变回账号表单。
  //   旧实现无条件铺开三个空输入框：已配置门店每次打开都被它挡住主要动作，
  //   也容易被读成「要重填一遍」。
  // 未配置 → 表单默认展开：新门店接入的唯一路径就是填本店账号，
  //   入口不能折叠起来（否则新店管理员找不到，会误用部署级共享凭据被互斥拒绝）。
  const storeLoginConfigured = Boolean(shiphub?.storeLoginConfigured)
  const showLoginForm = canManage && (!storeLoginConfigured || editingLogin)
  const openLoginEditor = () => {
    setEditingLogin(true)
    // 点「更改账号密码」就是要改它：展开后把焦点交给第一个输入框。
    window.requestAnimationFrame(() => usernameRef.current?.focus())
  }
  const set = (field) => (event) => setStoreLogin((current) => ({ ...current, [field]: event.target.value }))
  const connect = async () => {
    setBusy(true)
    try {
      const hasSubmittedLogin = Boolean(storeLogin.username || storeLogin.password || storeLogin.locationNum)
      const result = await shiphub.connect('/', hasSubmittedLogin ? {
        username: storeLogin.username.trim(),
        password: storeLogin.password,
        locationNum: storeLogin.locationNum.trim() || undefined
      } : null)
      if (result?.authorizationUrl) window.location.assign(result.authorizationUrl)
      else if (result?.connected) {
        // 提交成功后收起编辑态并清空输入：凭据已加密入库，界面上不继续留明文。
        setEditingLogin(false)
        setStoreLogin({ username: '', password: '', locationNum: '' })
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
  const primaryLabel = fixture
    ? 'Preview 下不可用'
    : busy
      ? '正在验证并连接…'
      : status === 'connected'
        ? (showLoginForm ? '更新账号并重连' : '重新连接')
        : '连接 Shiphub'
  return (
    <AppDialog open={open} onClose={() => { if (!busy) onClose() }} title="Shiphub 连接" eyebrow="SINGLE-STORE SSO" description="填写本店 Shiphub 门店账号，凭据加密保存在 Cloudflare 本店专属行，自动重连与同步只使用本店身份。">
      <div className="signed-in-user"><span>当前状态 · {fixture ? 'Preview fixture' : status === 'connected' ? '已连接' : status === 'degraded' ? '同步异常' : status === 'reauth_required' ? '需要重新授权' : '未连接'}</span><strong>{fixture ? 'Synthetic data only' : 'Shiphub read-only'}</strong></div>
      <p className="dialog-copy">页面打开、切换模块和普通刷新只读取 Workshop D1 缓存，不直接访问 Shiphub。手工确认也只写入本地操作覆盖层。</p>
      {fixture ? <p className="dialog-error" role="note">Preview 使用仓库内人工构造的 fixture：按钮停用，不会访问真实 Shiphub。</p> : null}
      {canManage ? (
        showLoginForm ? (
          <form className="data-form" data-motion="summary" onSubmit={(event) => { event.preventDefault(); void connect() }}>
            <label className="field-row"><span>门店账号用户名</span><input ref={usernameRef} autoComplete="off" maxLength="128" value={storeLogin.username} onChange={set('username')} placeholder="本店的 ShipHub 门店账号" /></label>
            <label className="field-row"><span>门店账号密码</span><input type="password" autoComplete="new-password" maxLength="128" value={storeLogin.password} onChange={set('password')} placeholder="对应账号密码" /></label>
            <label className="field-row"><span>门店编号 location_num（可选）</span><input autoComplete="off" maxLength="32" value={storeLogin.locationNum} onChange={set('locationNum')} placeholder="留空则使用部署默认值" /></label>
            <p className="dialog-copy">同一账号不能同时连接两家门店；操作员无需填写，可直接重新连接。</p>
            {storeLoginConfigured ? <button type="button" className="shiphub-connect-btn shiphub-connect-btn--ghost" onClick={() => setEditingLogin(false)} disabled={busy}>取消更改</button> : null}
          </form>
        ) : (
          <div className="shiphub-store-login" data-motion="summary">
            <p className="dialog-copy">已配置本店 Shiphub 账号，凭据加密保存在 Cloudflare 本店专属行；自动重连与同步只使用本店身份。</p>
            <button type="button" className="shiphub-connect-btn shiphub-connect-btn--ghost" onClick={openLoginEditor} disabled={busy}>更改账号密码</button>
          </div>
        )
      ) : <p className="dialog-copy">本店 ShipHub 账号由门店管理员设置；操作员可直接重新连接。</p>}
      {shiphub?.summary?.cubeAuth?.hasCredentials ? (
        <p className="dialog-copy" data-cube-auth={shiphub.summary.cubeAuth.status}>
          {shiphub.summary.cubeAuth.status === 'available'
            ? '数据身份可用：本店账号已接入 BI 销量与周报自动同步。'
            : shiphub.summary.cubeAuth.status === 'pending'
              ? '数据身份探测中：正在验证本店账号能否访问 BI 系统。'
              : 'BI 数据身份未开通：本店账号暂无法登录 BI 系统（不影响 Shiphub 使用）。'}
        </p>
      ) : null}
      {status === 'reauth_required' ? <p className="dialog-error" role="alert">上次同步需要重新授权；点击下方连接即可自动恢复。</p> : null}
      {status === 'degraded' ? <p className="dialog-error" role="alert">连接状态正常但上一轮同步失败，可能是授权凭据已失效，请重新连接。</p> : null}
      <button type="button" className="shiphub-connect-btn" onClick={connect} disabled={busy || fixture}>{primaryLabel}</button>
      {!fixture && status === 'connected' ? <button type="button" className="shiphub-connect-btn shiphub-connect-btn--ghost" onClick={disconnect} disabled={busy}>断开 Shiphub</button> : null}
    </AppDialog>
    )
}
