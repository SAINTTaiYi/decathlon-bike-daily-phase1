import { sceneById } from '../../data/lookbookScenes.js'

export function LookNumber({ scene }) {
  return <p className="look-number"><strong>{scene.no}</strong><span>{scene.label}</span></p>
}

export function SceneTitle({ scene, as = 'h2', note, action }) {
  const Heading = as
  const resolved = sceneById(scene.id)
  return (
    <header className="scene-title" data-motion="title">
      <div className="scene-title-row">
        <div className="display-heading-group">
          <LookNumber scene={resolved} />
          <Heading id={`${scene.id}-title`}>{scene.title}</Heading>
          <p className="title-translation" lang="zh-CN">{scene.cn}</p>
        </div>
        {action}
      </div>
      {note ? <p className="scene-note">{note}</p> : null}
    </header>
  )
}
