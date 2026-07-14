import { useCallback, useEffect, useState } from 'react'
import { clearApiSession, setApiSession } from '../api/client.js'
import { changePasswordAccount, loginAccount, logoutAccount, restoreSession } from '../api/auth.js'

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

  const changePassword = useCallback(async (currentPassword, nextPassword) => {
    try {
      await changePasswordAccount(currentPassword, nextPassword)
      setState((current) => ({ ...current, user: current.user ? { ...current.user, mustChangePassword: false } : current.user, error: '' }))
      return { ok: true }
    } catch (error) {
      return { ok: false, error: error.message }
    }
  }, [])

  const logout = useCallback(async () => {
    try { await logoutAccount() } catch { /* the local session still closes */ }
    clear('')
  }, [clear])

  return { ...state, login, changePassword, logout }
}
