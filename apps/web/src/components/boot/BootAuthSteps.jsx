/**
 * 注册 / 找回密码的步骤指示器。
 * 纯展示，样式由调用方 prefix 决定（bootd / bootm 各一套）。
 */
export function BootAuthSteps({ prefix, steps, step, itemClassName = '' }) {
  if (!steps?.length) return null

  return (
    <ol className={`${prefix}-steps ${itemClassName}`.trim()} aria-label="进度">
      {steps.map((label, index) => (
        <li
          key={label}
          aria-current={index === step ? 'step' : undefined}
          data-complete={index < step ? 'true' : undefined}
        >
          <span className={`${prefix}-step-dot`}>{index < step ? '✓' : index + 1}</span>
          <span className={`${prefix}-step-label`}>{label}</span>
        </li>
      ))}
    </ol>
  )
}

export default BootAuthSteps
