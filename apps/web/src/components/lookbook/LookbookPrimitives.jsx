import { sceneById } from '../../data/lookbookScenes.js'

export function SceneTitle({ scene, as = 'h2', note, action }) {
  const Heading = as
  const resolved = sceneById(scene.id)
  return (
    <header className="scene-title" data-motion="title">
      <div className="scene-title-row">
        <div className="display-heading-group sr-only">
          <Heading id={`${scene.id}-title`}>{resolved.title}</Heading>
          <p className="title-translation" lang="zh-CN">{resolved.cn}</p>
        </div>
        {action}
      </div>
      {note ? <p className="scene-note">{note}</p> : null}
    </header>
  )
}
