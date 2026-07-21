import { sceneById } from '../../data/lookbookScenes.js'
import VisualLineText from '../VisualLineText.jsx'

export function LookNumber({ scene }) {
  return <p className="look-number"><strong>{scene.no}</strong><span>{scene.label}</span></p>
}

export function SceneTitle({ scene, as = 'h2', note, action }) {
  const resolved = sceneById(scene.id)
  return (
    <header className="scene-title">
      <div className="scene-title-row">
        <div className="display-heading-group">
          <LookNumber scene={resolved} />
          <VisualLineText as={as} id={`${scene.id}-title`}>{scene.title}</VisualLineText>
          <p className="title-translation" lang="zh-CN" data-editorial-description>{scene.cn}</p>
        </div>
        {action}
      </div>
      {note ? <p className="scene-note" data-editorial-description>{note}</p> : null}
    </header>
  )
}
