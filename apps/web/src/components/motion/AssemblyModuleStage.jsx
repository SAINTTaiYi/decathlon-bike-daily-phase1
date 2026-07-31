import AssemblyText from './AssemblyText.jsx'

const visualByScene = {
  pickup: { image: '/images/ops/reference-home/obsidian-orange-cut-900.webp', layout: 'places', overline: 'READY FOR RELEASE', copy: '核对、通知、交付。每一辆车都沿同一条清晰路径完成。' },
  poster: { image: '/images/ops/assembly/bicycle-tools-1600.webp', layout: 'objects', overline: 'CONTEXT ACROSS SHIFTS', copy: '把没有完成的上下文留在现场，让下一班准确接续。' },
  repair: { image: '/images/ops/assembly/wheel-truing-1600.webp', layout: 'about', overline: 'DIAGNOSE / REPAIR / VERIFY', copy: '从判断到复核，维修记录始终与真实车辆同步。' },
  resale: { image: '/images/ops/assembly/brixton-cycles-1600.webp', layout: 'people', overline: 'BEGIN ANOTHER CYCLE', copy: '评估、整备、上架，让每一辆车重新进入使用周期。' },
  sales: { image: '/images/ops/reference-home/mechanic-workbench-1600.webp', layout: 'policy', overline: 'COUNT THE DAY', copy: '核对当日信号，保存真实数据，再完成闭店。' }
}

export default function AssemblyModuleStage({ scene }) {
  const visual = visualByScene[scene.id]
  if (!visual) return null
  return <div className="assembly-module-stage" data-assembly-stage={visual.layout} aria-hidden="true">
    <div className="assembly-stage-field" />
    <figure className="assembly-stage-image"><img src={visual.image} alt="" width="1600" height="1067" loading="lazy" decoding="async" /></figure>
    <div className="assembly-stage-copy">
      <span>{scene.no} / 06 · {visual.overline}</span>
      <AssemblyText as="strong" text={scene.title} seed={Number(scene.no) + 6} />
      <p>{visual.copy}</p>
    </div>
    <i className="assembly-stage-orbit" /><i className="assembly-stage-cross" />
  </div>
}
