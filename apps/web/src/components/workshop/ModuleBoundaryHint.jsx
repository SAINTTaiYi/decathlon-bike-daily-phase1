import IconNavArrowDown from '@iconoir/NavArrowDown.mjs'
import { sceneById } from '../../data/lookbookScenes.js'

export default function ModuleBoundaryHint({ hint }) {
  if (!hint) return null
  const scene = sceneById(hint.target)
  return (
    <div className="module-boundary-hint" data-direction={hint.direction > 0 ? 'next' : 'previous'} role="status" aria-live="polite">
      <IconNavArrowDown width={18} height={18} aria-hidden="true" />
      <span><small>SCROLL AGAIN · 再滑一次</small><strong>{scene.no} / {scene.cn}</strong></span>
    </div>
  )
}
