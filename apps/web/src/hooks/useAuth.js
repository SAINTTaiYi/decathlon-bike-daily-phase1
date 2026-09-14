import { useCallback, useEffect, useState } from 'react'
import { clearApiSession, setApiSession } from '../api/client.js'
import { changePasswordAccount, completeRegistration, loginAccount, logoutAccount, restoreSession, upgradeReadOnlySession, verifyEmailBinding } from '../api/auth.js'

// 只读会话自动恢复（2026-09-14 用户验收）：只读令牌是无状态的，服务端不会自动升级——
// 必须由客户端在额度恢复后主动「补签」。节奏：进入只读后先试一次，失败每 3 分钟静默重试，
// 直到成功或会话失效；切回前台且距上次尝试超过 1 分钟也会补一次。手动入口在横幅上。
const READONLY_UPGRADE_FIRST_DELAY_MS = 4 * 1000
const READONLY_UPGRADE_RETRY_MS = 3 * 60 * 1000
const READONLY_UPGRADE_MIN_GAP_MS = 60 * 1000

export default function useAuth() {
  const [state, setState] = useState({ status: 'restoring', source: 'restore', user: null, stores: [], currentStoreId: '', error: '', readOnly: false, recoveryAt: '', readOnlyMessage: '' })

  const apply = useCallback((payload, source = 'restore') => {
    setApiSession({ csrf: payload.csrfToken, store: payload.currentStoreId })
    // 只读降级（2026-09-14）：D1 写额度耗尽时服务端签发无状态只读会话，
    // 这里把状态带到界面，让门店明确知道「能看、不能改」以及恢复时间。
    setState({
      status: 'authenticated',
      source,
      user: payload.user,
      stores: payload.stores,
      currentStoreId: payload.currentStoreId,
      error: '',
      readOnly: Boolean(payload.readOnly),
      recoveryAt: payload.recoveryAt || '',
      readOnlyMessage: payload.message || ''
    })
  }, [])

  const clear = useCallback((error = '') => {
    clearApiSession()
    setState({ status: 'anonymous', source: 'logout', user: null, stores: [], currentStoreId: '', error })
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    restoreSession(controller.signal).then(apply).catch((error) => {
      if (error.name !== 'AbortError') clear('')
    })
    const expired = () => clear('登录状态已过期，请重新登录。')
    window.addEventListener('bike-ops:session-expired', expired)
    return () => { controller.abort(); window.removeEventListener('bike-ops:session-expired', expired) }
  }, [apply, clear])

  const login = useCallback(async (username, password) => {
    try {
      const payload = await loginAccount(username, password)
      apply(payload, 'login')
      return { ok: true }
    } catch (error) {
      return { ok: false, error: error.message }
    }
  }, [apply])

  // 只读会话 → 可写会话：额度恢复后由服务端补签数据库会话，换发正式 cookie 与新 CSRF。
  // 成功即解除横幅；失败静默（自动重试下轮再来），手动入口由 App 显示错误提示。
  const upgrade = useCallback(async () => {
    try {
      const payload = await upgradeReadOnlySession()
      if (payload?.user) apply(payload, 'upgrade')
      else setState((current) => ({ ...current, readOnly: false, recoveryAt: '', readOnlyMessage: '' }))
      return { ok: true }
    } catch (error) {
      return { ok: false, error: error?.message || '恢复失败，请稍后重试。', code: error?.code || '' }
    }
  }, [apply])

  // 只读模式自动恢复循环（2026-09-14）：额度一恢复就自动解除横幅，不需要门店操作。
  // 必须声明在 upgrade 之后：依赖数组会在 useEffect 调用点立即求值，写在声明前会
  // 触发 TDZ（Cannot access 'upgrade' before initialization），整页白屏（已实测踩坑）。
  useEffect(() => {
    if (state.status !== 'authenticated' || !state.readOnly) return undefined
    let cancelled = false
    let inFlight = false
    let timer = 0
    let lastAttemptAt = 0
    const attempt = async () => {
      if (cancelled || inFlight) return
      inFlight = true
      lastAttemptAt = Date.now()
      try {
        const result = await upgrade()
        if (cancelled || result.ok) return
        timer = window.setTimeout(attempt, READONLY_UPGRADE_RETRY_MS)
      } finally {
        inFlight = false
      }
    }
    timer = window.setTimeout(attempt, READONLY_UPGRADE_FIRST_DELAY_MS)
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return
      if (Date.now() - lastAttemptAt <= READONLY_UPGRADE_MIN_GAP_MS) return
      window.clearTimeout(timer)
      timer = window.setTimeout(attempt, 0)
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [state.status, state.readOnly, upgrade])

  const acceptRegistration = useCallback((payload) => {
    apply(payload, 'registration')
  }, [apply])

  const finishRegistration = useCallback(async (body) => {
    try {
      const payload = await completeRegistration(body)
      apply(payload, 'registration')
      return { ok: true }
    } catch (error) {
      return { ok: false, error: error.message }
    }
  }, [apply])

  const changePassword = useCallback(async (currentPassword, nextPassword, idempotencyKey) => {
    try {
      await changePasswordAccount(currentPassword, nextPassword, idempotencyKey)
      setState((current) => ({ ...current, user: current.user ? { ...current.user, mustChangePassword: false } : current.user, error: '' }))
      return { ok: true }
    } catch (error) {
      if (error?.code === 'PASSWORD_CHANGE_CONFLICT') {
        const message = '密码已在其它设备更新，请使用新密码重新登录。'
        clear(message)
        return { ok: false, error: message }
      }
      return { ok: false, error: error?.message || '密码修改失败，请稍后重试。' }
    }
  }, [clear])

  // 绑定成功后本地立即解锁（后端已置 must_change_password=0 且写入 email_key），
  // 无需整页刷新；其它设备的会话由后端撤销。
  const bindEmail = useCallback(async (body) => {
    try {
      await verifyEmailBinding(body)
      setState((current) => ({
        ...current,
        user: current.user
          ? { ...current.user, emailBindingRequired: false, mustChangePassword: false }
          : current.user,
        error: ''
      }))
      return { ok: true }
    } catch (error) {
      return { ok: false, error: error?.message || '邮箱绑定失败，请稍后重试。' }
    }
  }, [])

  const logout = useCallback(async () => {
    try { await logoutAccount() } catch { /* the local session still closes */ }
    clear('')
  }, [clear])

  return { ...state, login, changePassword, bindEmail, logout, acceptRegistration, finishRegistration, upgrade }
}
