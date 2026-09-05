import { useCallback, useEffect, useState } from 'react'
import { clearApiSession, setApiSession } from '../api/client.js'
import { changePasswordAccount, completeRegistration, loginAccount, logoutAccount, restoreSession, verifyEmailBinding } from '../api/auth.js'

export default function useAuth() {
  const [state, setState] = useState({ status: 'restoring', source: 'restore', user: null, stores: [], currentStoreId: '', error: '' })

  const apply = useCallback((payload, source = 'restore') => {
    setApiSession({ csrf: payload.csrfToken, store: payload.currentStoreId })
    setState({ status: 'authenticated', source, user: payload.user, stores: payload.stores, currentStoreId: payload.currentStoreId, error: '' })
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

  return { ...state, login, changePassword, bindEmail, logout, acceptRegistration, finishRegistration }
}
