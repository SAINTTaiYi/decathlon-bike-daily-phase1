import { useCallback, useEffect, useRef, useState } from 'react'
import { normalizeLoginUsername } from '../data/userSession.js'

/**
 * 登录页的业务逻辑（表单状态 / 校验 / 提交 / 完成收尾）。
 *
 * UI 分两套（BootLoaderMobile / BootLoaderDesktop），但业务只有一份，
 * 都从这里取。两端各自负责自己的动效与 DOM，本 hook 不碰任何布局。
 *
 * @param {object}   options
 * @param {string}   options.initialError  外部带入的初始错误（如会话过期）
 * @param {Function} options.onLogin       (username, password) => { ok, error }
 * @param {Function} options.onComplete    登录成功且退场动画结束后调用
 * @param {Function} options.onExit        由 UI 层提供的退场动画；返回 true 表示已接管收尾
 */
export function useBootLoginForm({ initialError = '', onLogin, onComplete, onExit } = {}) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [hidden, setHidden] = useState(false)
  const [usernameFocused, setUsernameFocused] = useState(false)

  const inputRef = useRef(null)

  useEffect(() => {
    if (initialError) setError(initialError)
  }, [initialError])

  useEffect(() => {
    if (hidden && typeof document !== 'undefined') document.body.classList.remove('is-booting')
  }, [hidden])

  const completeLogin = useCallback(() => {
    setHidden(true)
    onComplete?.()
  }, [onComplete])

  const changeUsername = useCallback((value) => {
    setUsername(value)
    setError((prev) => (prev ? '' : prev))
  }, [])

  const changePassword = useCallback((value) => {
    setPassword(value)
    setError((prev) => (prev ? '' : prev))
  }, [])

  const togglePassword = useCallback(() => setShowPassword((prev) => !prev), [])

  const submitLogin = useCallback(async (event) => {
    event?.preventDefault?.()

    const actorName = normalizeLoginUsername(username)
    if (!actorName || !password) {
      setError(!actorName ? '请输入用户名。' : '请输入密码。')
      inputRef.current?.focus()
      return { ok: false, reason: 'validation' }
    }

    setError('')
    setSubmitting(true)
    const result = await onLogin?.(actorName, password)
    setSubmitting(false)

    if (!result?.ok) {
      setError(result?.error || '登录失败，请稍后重试。')
      inputRef.current?.focus()
      return { ok: false, reason: 'rejected' }
    }

    // UI 层可接管退场动画；未接管则立即收尾
    const handled = onExit?.(completeLogin)
    if (!handled) completeLogin()
    return { ok: true }
  }, [username, password, onLogin, onExit, completeLogin])

  return {
    username,
    password,
    showPassword,
    error,
    submitting,
    hidden,
    usernameFocused,
    inputRef,
    // 角色互动派生态：两端插画共用同一套输入信号
    isTyping: usernameFocused && username.length > 0,
    setUsernameFocused,
    changeUsername,
    changePassword,
    togglePassword,
    submitLogin,
    completeLogin
  }
}

export default useBootLoginForm
