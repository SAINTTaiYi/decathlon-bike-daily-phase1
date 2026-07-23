import { sceneById } from '../../data/lookbookScenes.js'
import { SignalModuleMetrics } from './SignalStateMark.jsx'

export function LookNumber({ scene }) {
  return <p className="look-number"><strong>{scene.no}</strong><span>{scene.label}</span></p>
}

export function SceneTitle({ scene, as = 'h2', note, action, metrics = [], signalHeader = false }) {
  const Heading = as
  const resolved = sceneById(scene.id)
  const glitchPrototype = scene.id === 'pulse' || scene.id === 'repair'
  return (
    <header className={`scene-title${signalHeader ? ' signal-module-header' : ''}`} data-motion="title">
      <div className="scene-title-row">
        <div className="display-heading-group">
          <LookNumber scene={resolved} />
          <div className="glitch-title-stack" data-glitch-motion={glitchPrototype ? '' : undefined}>
            <Heading id={`${scene.id}-title`} data-glitch-scan={glitchPrototype ? '' : undefined}>{scene.title}</Heading>
            <p className="title-translation" lang="zh-CN" data-glitch-scan={glitchPrototype ? '' : undefined}>{scene.cn}</p>
          </div>
        </div>
        {action}
      </div>
      {note ? <p className="scene-note">{note}</p> : null}
      <SignalModuleMetrics items={metrics} ariaLabel={`${resolved.cn}实时指标`} />
    </header>
  )
}
