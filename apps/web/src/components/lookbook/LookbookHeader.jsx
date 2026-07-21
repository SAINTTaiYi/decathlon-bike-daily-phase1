import { APP_VERSION } from '../../data/releaseNotes.js'

export default function LookbookHeader() {
  return (
    <header className="report-masthead" data-motion="header">
      <div>
        <span>WORKSHOP LEDGER</span>
        <h1>WORKSHOP OPS</h1>
      </div>
      <strong aria-label={`版本 ${APP_VERSION}`}>V{APP_VERSION}</strong>
    </header>
  )
}
