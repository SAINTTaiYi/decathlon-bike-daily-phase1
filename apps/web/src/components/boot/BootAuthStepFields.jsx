import { USERNAME_MAX_LENGTH } from '../../data/userSession.js'

/**
 * 注册 / 找回密码各步骤的输入字段。
 *
 * 与 BootLoginFields 同规格：只负责字段本身，不含布局与断点。
 * className 前缀由调用方通过 prefix 传入（bootd / bootm），
 * 两套样式互不覆盖。
 */

function Field({ prefix, itemClassName, label, hint, children }) {
  return (
    <label className={`${prefix}-field-wrap ${itemClassName}`.trim()}>
      <span className={`${prefix}-label`}>{label}</span>
      <div className={`${prefix}-input-box`}>{children}</div>
      {hint ? <small className={`${prefix}-field-hint`}>{hint}</small> : null}
    </label>
  )
}

export function BootAuthStepFields({ prefix, panel, itemClassName = '' }) {
  const { mode, step, form, error, setField } = panel
  const invalid = Boolean(error)

  const otpField = (
    <Field
      prefix={prefix}
      itemClassName={itemClassName}
      label="6 位验证码"
      hint={`验证码已发送至 ${form.email || '绑定邮箱'}，10 分钟内有效。`}
    >
      <input
        autoFocus
        type="text"
        name="otp"
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern="[0-9]{6}"
        maxLength={6}
        value={form.otp}
        onChange={(event) => setField('otp', event.target.value.replace(/\D/gu, ''))}
        aria-invalid={invalid}
        placeholder="000000"
        enterKeyHint="go"
      />
    </Field>
  )

  const passwordFields = (
    <>
      <Field prefix={prefix} itemClassName={itemClassName} label={mode === 'recover' ? '新密码' : '设置密码'}>
        <input
          autoFocus
          type="password"
          name="new-password"
          minLength={10}
          maxLength={128}
          autoComplete="new-password"
          value={form.password}
          onChange={(event) => setField('password', event.target.value)}
          aria-invalid={invalid}
          placeholder="至少 10 个字符"
        />
      </Field>
      <Field prefix={prefix} itemClassName={itemClassName} label="确认密码">
        <input
          type="password"
          name="confirm-password"
          minLength={10}
          maxLength={128}
          autoComplete="new-password"
          value={form.confirmPassword}
          onChange={(event) => setField('confirmPassword', event.target.value)}
          aria-invalid={invalid}
          placeholder="再次输入新密码"
          enterKeyHint="go"
        />
      </Field>
    </>
  )

  if (mode === 'register') {
    if (step === 0) {
      return (
        <div className={`${prefix}-fields-group`}>
          <div className={`${prefix}-field-pair`}>
            <Field prefix={prefix} itemClassName={itemClassName} label="门店编号">
              <input
                autoFocus
                type="text"
                name="storeCode"
                maxLength={32}
                autoComplete="organization"
                value={form.storeCode}
                onChange={(event) => setField('storeCode', event.target.value)}
                aria-invalid={invalid}
                placeholder="例如 1299"
              />
            </Field>
            <Field prefix={prefix} itemClassName={itemClassName} label="门店名称">
              <input
                type="text"
                name="storeName"
                maxLength={120}
                value={form.storeName}
                onChange={(event) => setField('storeName', event.target.value)}
                aria-invalid={invalid}
                placeholder="例如 五象店"
              />
            </Field>
          </div>
          <Field
            prefix={prefix}
            itemClassName={itemClassName}
            label="Profile"
            hint="门店编号需为公司内部唯一编号，重复时注册会被拒绝。"
          >
            <input
              type="text"
              name="username"
              maxLength={USERNAME_MAX_LENGTH}
              autoComplete="username"
              value={form.username}
              onChange={(event) => setField('username', event.target.value)}
              aria-invalid={invalid}
              placeholder="请输入真实 Profile"
            />
          </Field>
          <Field prefix={prefix} itemClassName={itemClassName} label="显示名（可选）">
            <input
              type="text"
              name="displayName"
              maxLength={USERNAME_MAX_LENGTH}
              autoComplete="name"
              value={form.displayName}
              onChange={(event) => setField('displayName', event.target.value)}
              placeholder="默认使用 Profile"
            />
          </Field>
          <Field
            prefix={prefix}
            itemClassName={itemClassName}
            label="公司邮箱"
            hint="验证码只发送到此邮箱，不会进入操作审计。"
          >
            <input
              type="email"
              name="email"
              inputMode="email"
              maxLength={320}
              autoComplete="email"
              value={form.email}
              onChange={(event) => setField('email', event.target.value)}
              aria-invalid={invalid}
              placeholder="name@decathlon.com"
              enterKeyHint="go"
            />
          </Field>
        </div>
      )
    }
    if (step === 1) return <div className={`${prefix}-fields-group`}>{otpField}</div>
    return <div className={`${prefix}-fields-group`}>{passwordFields}</div>
  }

  // recover
  if (step === 0) {
    return (
      <div className={`${prefix}-fields-group`}>
        <Field prefix={prefix} itemClassName={itemClassName} label="用户名">
          <input
            autoFocus
            type="text"
            name="username"
            maxLength={USERNAME_MAX_LENGTH}
            autoComplete="username"
            value={form.username}
            onChange={(event) => setField('username', event.target.value)}
            aria-invalid={invalid}
            placeholder="输入用户名（如：CHU13 / 小王）"
          />
        </Field>
        <Field
          prefix={prefix}
          itemClassName={itemClassName}
          label="绑定的公司邮箱"
          hint="需与注册时使用的公司邮箱一致，否则不会收到验证码。"
        >
          <input
            type="email"
            name="email"
            inputMode="email"
            maxLength={320}
            autoComplete="email"
            value={form.email}
            onChange={(event) => setField('email', event.target.value)}
            aria-invalid={invalid}
            placeholder="name@decathlon.com"
            enterKeyHint="go"
          />
        </Field>
      </div>
    )
  }
  if (step === 1) return <div className={`${prefix}-fields-group`}>{otpField}</div>
  return <div className={`${prefix}-fields-group`}>{passwordFields}</div>
}

export default BootAuthStepFields
