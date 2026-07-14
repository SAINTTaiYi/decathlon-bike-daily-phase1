import { APP_VERSION, currentRelease } from '../../data/releaseNotes.js'

export default function ReleaseNotes() {
  return (
    <section className="release-notes" aria-labelledby="release-notes-title" data-motion="data">
      <header className="release-notes-head">
        <span>RELEASE NOTES · 版本更新记录</span>
        <strong>V{APP_VERSION} · {currentRelease.date}</strong>
      </header>
      <div className="release-notes-summary">
        <div className="release-version-mark" aria-hidden="true">V{APP_VERSION}</div>
        <div>
          <h2 id="release-notes-title">本次版本更新</h2>
          <strong>{currentRelease.title}</strong>
          <p>{currentRelease.summary}</p>
        </div>
      </div>
      <ol className="release-change-list">
        {currentRelease.changes.map((change, index) => (
          <li key={change}>
            <span aria-hidden="true">{String(index + 1).padStart(2, '0')}</span>
            <p>{change}</p>
          </li>
        ))}
      </ol>
    </section>
  )
}
