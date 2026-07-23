import { APP_VERSION } from '../../data/releaseNotes.js'

export default function LookbookHeader() {
  return (
    <header className="report-masthead signal-grid-masthead" data-motion="header">
      <div className="signal-grid-masthead-title">
        <span>WORKSHOP SIGNAL GRID</span>
        <h1 data-glitch-motion><b data-glitch-scan>WORKSHOP</b><strong data-glitch-scan>OPS</strong></h1>
        <p>门店作业信号系统</p>
      </div>
      <div className="signal-grid-masthead-meta">
        <span>LIVE OPERATIONS</span>
        <strong aria-label={`版本 ${APP_VERSION}`}>V{APP_VERSION}</strong>
      </div>
    </header>
  )
}
