import { APP_VERSION } from '../data/releaseNotes.js'

export function SignalAccessBrand({ mode = 'access' }) {
  const labels = {
    access: ['ACCESS', 'SECURE DATABASE LINK'],
    setup: ['SETUP', 'ONE-TIME ADMIN REGISTRATION'],
    password: ['SECURITY', 'CREDENTIAL ROTATION']
  }
  const [code, status] = labels[mode] || labels.access
  return (
    <aside className="signal-access-brand" aria-label="WORKSHOP SIGNAL GRID">
      <div className="signal-access-registration"><span>WSG / {code}</span><strong>V{APP_VERSION}</strong></div>
      <div className="signal-access-lockup" aria-hidden="true">
        <strong>WORKSHOP</strong>
        <strong>SIGNAL GRID</strong>
        <span>门店作业信号系统</span>
      </div>
      <div className="signal-access-status">
        <span>OPERATIONS LEDGER</span>
        <strong>{status}</strong>
        <small>AUTHENTICATED · AUDITED · STORE-SCOPED</small>
      </div>
    </aside>
  )
}

export function SignalAccessHeading({ eyebrow, title, description, titleId, descriptionId }) {
  return (
    <header className="signal-access-heading">
      <span>{eyebrow}</span>
      <h1 id={titleId}>{title}</h1>
      <p id={descriptionId}>{description}</p>
    </header>
  )
}
