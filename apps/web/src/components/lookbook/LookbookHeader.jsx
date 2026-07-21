import { APP_VERSION } from '../../data/releaseNotes.js'
import VisualLineText from '../VisualLineText.jsx'

export default function LookbookHeader() {
  return (
    <header className="report-masthead">
      <div>
        <span data-editorial-logo>WORKSHOP LEDGER</span>
        <VisualLineText as="h1">WORKSHOP OPS</VisualLineText>
      </div>
      <strong aria-label={`版本 ${APP_VERSION}`}>V{APP_VERSION}</strong>
    </header>
  )
}
