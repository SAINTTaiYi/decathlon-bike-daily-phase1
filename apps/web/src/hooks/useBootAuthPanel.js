import { useCallback, useMemo, useState } from 'react'
import {
  completeRegistration,
  requestRegistrationOtp,
  verifyRegistrationOtp,
  requestPasswordRecoveryOtp,
  verifyPasswordRecoveryOtp,
  completePasswordRecovery
} from '../api/auth.js'
import { PASSWORD_MIN_LENGTH, PASSWORD_MAX_LENGTH } from '../data/passwordChange.js'

/**
 * 登录框内的多模式认证状态机（登录 / 注册 / 找回密码）。
 *
 * 关键约束：注册与找回都不再跳页，全部在同一张登录卡里就地变形。
 * 因此这里只管业务与步骤，不碰任何布局；DOM 与动效由
 * BootLoaderMobile / BootLoaderDesktop 各自实现（项目规则 2026-08-28：
 * 双端两套独立 UI，不用单套 DOM + @media 硬凑）。
 *
 * 模式与步骤：
 *   login    : 单步
 *   register : 0 登记门店 → 1 验证邮箱 → 2 设置密码
 *   recover  : 0 认领账号 → 1 验证邮箱 → 2 重设密码
 */

export const AUTH_MODES = ['login', 'register', 'recover']

export const REGISTER_STEPS = ['登记门店', '验证邮箱', '设置密码']
export const RECOVER_STEPS = ['认领账号', '验证邮箱', '重设密码']

const EMPTY_FORM = {
  storeCode: '',
  storeName: '',
  username: '',
  displayName: '',
  email: '',
  otp: '',
  password: '',
  confirmPassword: ''
}

function validateNewPassword(password, confirmPassword) {
  if (password.length < PASSWORD_MIN_LENGTH) return `密码至少需要 ${PASSWORD_MIN_LENGTH} 个字符。`
  if (password.length > PASSWORD_MAX_LENGTH) return `密码不能超过 ${PASSWORD_MAX_LENGTH} 个字符。`
  if (password !== confirmPassword) return '两次输入的密码不一致。'
  return ''
}

export function useBootAuthPanel({ onRegistered, onRecovered } = {}) {
  const [mode, setMode] = useState('login')
  const [step, setStep] = useState(0)
  const [form, setForm] = useState(EMPTY_FORM)
  const [challenge, setChallenge] = useState(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)

  const clearFeedback = useCallback(() => {
    setError('')
    setNotice('')
  }, [])

  const setField = useCallback((key, value) => {
    setForm((current) => ({ ...current, [key]: value }))
    setError((prev) => (prev ? '' : prev))
  }, [])

  /** 切换模式：重置步骤与挑战态，避免上一轮的 token 串味 */
  const switchMode = useCallback((nextMode) => {
    if (!AUTH_MODES.includes(nextMode)) return
    setMode(nextMode)
    setStep(0)
    setChallenge(null)
    setError('')
    setNotice('')
    setForm((current) => ({
      ...EMPTY_FORM,
      // 用户名 / 邮箱在模式间是同一个人的信息，保留可减少重复输入
      username: current.username,
      email: current.email
    }))
  }, [])

  const backToLogin = useCallback(() => switchMode('login'), [switchMode])

  /** 回到上一步（信息填错时不必从头开始） */
  const previousStep = useCallback(() => {
    clearFeedback()
    setStep((current) => (current > 0 ? current - 1 : 0))
  }, [clearFeedback])

  const run = useCallback(async (task, fallbackMessage) => {
    setBusy(true)
    clearFeedback()
    try {
      return { ok: true, data: await task() }
    } catch (requestError) {
      setError(requestError?.message || fallbackMessage)
      return { ok: false }
    } finally {
      setBusy(false)
    }
  }, [clearFeedback])

  // ---- 注册 ---------------------------------------------------------------

  const submitRegisterStore = useCallback(async (event) => {
    event?.preventDefault?.()
    if (!form.storeCode.trim() || !form.storeName.trim()) return setError('请填写门店编号和门店名称。')
    if (!form.username.trim() || !form.email.trim()) return setError('请填写 Profile 和公司邮箱。')

    const result = await run(() => requestRegistrationOtp({
      storeCode: form.storeCode.trim(),
      storeName: form.storeName.trim(),
      username: form.username.trim(),
      displayName: form.displayName.trim() || form.username.trim(),
      email: form.email.trim()
    }), '验证码暂时无法发送。')

    if (!result.ok) return undefined
    if (result.data?.challengeId) {
      setChallenge({ id: result.data.challengeId, completionToken: '' })
      setStep(1)
    }
    setNotice(result.data?.message || '验证码已发送，请检查公司邮箱。')
    return undefined
  }, [form, run])

  const submitRegisterOtp = useCallback(async (event) => {
    event?.preventDefault?.()
    if (!challenge?.id || !/^\d{6}$/u.test(form.otp.trim())) return setError('请输入 6 位验证码。')

    const result = await run(
      () => verifyRegistrationOtp({ challengeId: challenge.id, otp: form.otp.trim() }),
      '验证码无效或已过期。'
    )
    if (!result.ok) return undefined

    setChallenge({ id: result.data.challengeId, completionToken: result.data.completionToken })
    setNotice(result.data?.message || '邮箱已验证，请设置登录密码。')
    setStep(2)
    return undefined
  }, [challenge, form.otp, run])

  const submitRegisterPassword = useCallback(async (event) => {
    event?.preventDefault?.()
    if (!challenge?.completionToken) return setError('验证状态已失效，请重新获取验证码。')
    const invalid = validateNewPassword(form.password, form.confirmPassword)
    if (invalid) return setError(invalid)

    const result = await run(() => completeRegistration({
      challengeId: challenge.id,
      completionToken: challenge.completionToken,
      password: form.password
    }), '注册未完成，请重新开始。')
    if (!result.ok) return undefined

    onRegistered?.(result.data)
    return undefined
  }, [challenge, form.password, form.confirmPassword, run, onRegistered])

  // ---- 找回密码 -----------------------------------------------------------

  const submitRecoverClaim = useCallback(async (event) => {
    event?.preventDefault?.()
    if (!form.username.trim()) return setError('请输入用户名。')
    if (!form.email.trim()) return setError('请输入账号绑定的公司邮箱。')

    const result = await run(() => requestPasswordRecoveryOtp({
      username: form.username.trim(),
      email: form.email.trim()
    }), '验证码暂时无法发送。')
    if (!result.ok) return undefined

    // 后端对不存在的账号也返回中性响应，这里同样不区分，避免账号探测
    if (result.data?.challengeId) setChallenge({ id: result.data.challengeId, completionToken: '' })
    setNotice(result.data?.message || '如果账号存在，验证码已发送到绑定邮箱。')
    setStep(1)
    return undefined
  }, [form.username, form.email, run])

  const submitRecoverOtp = useCallback(async (event) => {
    event?.preventDefault?.()
    if (!/^\d{6}$/u.test(form.otp.trim())) return setError('请输入 6 位验证码。')
    if (!challenge?.id) return setError('验证状态已失效，请重新获取验证码。')

    const result = await run(
      () => verifyPasswordRecoveryOtp({ challengeId: challenge.id, otp: form.otp.trim() }),
      '验证码无效或已过期。'
    )
    if (!result.ok) return undefined

    setChallenge({ id: result.data.challengeId, completionToken: result.data.completionToken })
    setNotice(result.data?.message || '验证通过，请设置新密码。')
    setStep(2)
    return undefined
  }, [challenge, form.otp, run])

  const submitRecoverPassword = useCallback(async (event) => {
    event?.preventDefault?.()
    if (!challenge?.completionToken) return setError('验证状态已失效，请重新获取验证码。')
    const invalid = validateNewPassword(form.password, form.confirmPassword)
    if (invalid) return setError(invalid)

    const result = await run(() => completePasswordRecovery({
      challengeId: challenge.id,
      completionToken: challenge.completionToken,
      password: form.password
    }), '密码重设未完成，请重新开始。')
    if (!result.ok) return undefined

    onRecovered?.(result.data)
    return undefined
  }, [challenge, form.password, form.confirmPassword, run, onRecovered])

  // ---- 当前步骤的派生描述（两端 UI 共用同一套文案与提交函数） -------------

  const steps = mode === 'register' ? REGISTER_STEPS : mode === 'recover' ? RECOVER_STEPS : []

  const submitCurrent = useMemo(() => {
    if (mode === 'register') return [submitRegisterStore, submitRegisterOtp, submitRegisterPassword][step]
    if (mode === 'recover') return [submitRecoverClaim, submitRecoverOtp, submitRecoverPassword][step]
    return undefined
  }, [
    mode, step,
    submitRegisterStore, submitRegisterOtp, submitRegisterPassword,
    submitRecoverClaim, submitRecoverOtp, submitRecoverPassword
  ])

  const primaryLabel = useMemo(() => {
    if (busy) return ['正在发送…', '正在验证…', '正在提交…'][step] || '处理中…'
    if (mode === 'register') return ['发送验证码', '验证邮箱', '完成注册'][step]
    if (mode === 'recover') return ['发送验证码', '验证邮箱', '重设密码'][step]
    return '登录并进入'
  }, [busy, mode, step])

  const title = mode === 'register' ? '登记并开通门店' : mode === 'recover' ? '找回登录密码' : ''
  const hint = mode === 'register'
    ? '门店无需预先建档。首位完成注册的人成为该门店管理员。'
    : mode === 'recover'
      ? '验证码只发送到账号绑定的公司邮箱。'
      : ''

  return {
    mode,
    step,
    steps,
    form,
    error,
    notice,
    busy,
    title,
    hint,
    primaryLabel,
    submitCurrent,
    setField,
    switchMode,
    backToLogin,
    previousStep,
    // 变形动效的 key：模式或步骤一变就重播进场
    transitionKey: `${mode}:${step}`
  }
}

export default useBootAuthPanel
