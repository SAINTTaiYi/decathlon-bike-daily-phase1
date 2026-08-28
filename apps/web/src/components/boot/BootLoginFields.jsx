import { USERNAME_MAX_LENGTH } from '../../data/userSession.js'

/**
 * 登录表单的输入字段（用户名 / 密码 / 显示密码开关）。
 *
 * 只负责字段本身，不含任何布局与断点：外层容器、间距、栅格由
 * BootLoaderMobile / BootLoaderDesktop 各自的 CSS 决定。
 * className 前缀由调用方通过 prefix 传入，两套样式互不覆盖。
 */
export function BootLoginFields({
  prefix,
  form,
  itemClassName = '',
  onForgotPassword
}) {
  const {
    username,
    password,
    showPassword,
    error,
    inputRef,
    setUsernameFocused,
    changeUsername,
    changePassword,
    togglePassword
  } = form

  return (
    <div className={`${prefix}-fields-group`}>
      <label className={`${prefix}-field-wrap ${itemClassName}`.trim()}>
        <span className={`${prefix}-label`}>用户名</span>
        <div className={`${prefix}-input-box`}>
          <svg className={`${prefix}-input-icon`} viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
            <circle cx="12" cy="7" r="4" />
          </svg>
          <input
            ref={inputRef}
            type="text"
            name="username"
            value={username}
            onChange={(event) => changeUsername(event.target.value)}
            onFocus={() => setUsernameFocused(true)}
            onBlur={() => setUsernameFocused(false)}
            maxLength={USERNAME_MAX_LENGTH}
            autoComplete="username"
            enterKeyHint="next"
            aria-invalid={Boolean(error)}
            placeholder="输入用户名（如：CHU13 / 小王）"
          />
        </div>
      </label>

      <label className={`${prefix}-field-wrap ${itemClassName}`.trim()}>
        <div className={`${prefix}-label-row`}>
          <span className={`${prefix}-label`}>密码</span>
          <button
            type="button"
            className={`${prefix}-link-action`}
            onClick={onForgotPassword}
            tabIndex={-1}
          >
            忘记密码？
          </button>
        </div>
        <div className={`${prefix}-input-box`}>
          <svg className={`${prefix}-input-icon`} viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
          </svg>
          <input
            type={showPassword ? 'text' : 'password'}
            name="password"
            value={password}
            onChange={(event) => changePassword(event.target.value)}
            minLength="10"
            maxLength="128"
            autoComplete="current-password"
            enterKeyHint="go"
            aria-invalid={Boolean(error)}
            placeholder="输入登录密码"
          />
          <button
            type="button"
            className={`${prefix}-pwd-toggle`}
            onClick={togglePassword}
            aria-label={showPassword ? '隐藏密码' : '显示密码'}
            tabIndex={-1}
          >
            {showPassword ? (
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                <line x1="1" y1="1" x2="23" y2="23" />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                <circle cx="12" cy="12" r="3" />
              </svg>
            )}
          </button>
        </div>
      </label>
    </div>
  )
}

export default BootLoginFields
