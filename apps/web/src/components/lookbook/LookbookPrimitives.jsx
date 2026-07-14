import BlurText from '../BlurText.jsx'
import { formatLook } from '../../data/lookbookScenes.js'

export function LookNumber({ scene }) {
  return <p className="look-number"><span>LOOK</span><strong>{formatLook(scene.no)}</strong></p>
}

export function SceneTitle({ scene, as = 'h2', note, action }) {
  return (
    <header className="scene-title" data-motion="title">
      <LookNumber scene={scene} />
      <div className="scene-title-row">
        <div className="display-heading-group">
          <BlurText as={as} id={`${scene.id}-title`} text={scene.title} className="blur-text--block blur-text--display" splitBy="words" delay={72} duration={620} scrollStart={1.02} scrollEnd={0.72} scrollStagger={0.18} />
          <p className="title-translation" lang="zh-CN">{scene.cn}</p>
        </div>
        {action}
      </div>
      {note ? <p className="scene-note">{note}</p> : null}
    </header>
  )
}
