import { APP_VERSION, currentRelease } from '../../data/releaseNotes.js'

export default function ReleaseNotes() {
  return (
    <details className="release-notes" data-motion="data">
      <summary>
        <span>V{APP_VERSION}</span>
        <strong>{currentRelease.title}</strong>
        <small>{currentRelease.date}</small>
      </summary>
      <div className="release-notes-body">
        <p>{currentRelease.summary}</p>
        <ul>
          {currentRelease.changes.map((change) => <li key={change}>{change}</li>)}
        </ul>
      </div>
    </details>
  )
}
