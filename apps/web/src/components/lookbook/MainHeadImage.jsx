const glitchFragments = [
  ['overview', 'OVR'],
  ['pickup', 'PUP'],
  ['repair', 'RPR'],
  ['resale', 'USD'],
  ['sales', 'SAL'],
  ['closing', 'CLS']
]

export default function MainHeadImage() {
  return (
    <figure className="signal-glitch-field" data-signal-module="overview" data-glitch-motion data-workspace-module="true" aria-labelledby="signal-field-title">
      <div className="signal-glitch-canvas" aria-hidden="true">
        <span className="signal-glitch-raster" data-glitch-scan />
        <span className="signal-glitch-scanline" data-glitch-scan />
        {glitchFragments.map(([module, code], index) => (
          <span key={module} className={`signal-glitch-fragment signal-glitch-fragment-${module}`} data-glitch-scan style={{ '--glitch-index': index }}>{code}</span>
        ))}
        <span className="signal-glitch-cross signal-glitch-cross-a" data-glitch-scan>+</span>
        <span className="signal-glitch-cross signal-glitch-cross-b" data-glitch-scan>+</span>
        <span className="signal-glitch-code" data-glitch-scan>SG/00:OPERATIONS-SIGNAL</span>
        <span className="signal-glitch-coordinate" data-glitch-scan>X 031.7 / Y 086.2</span>
      </div>
      <figcaption className="signal-glitch-caption">
        <span>ABSTRACT SIGNAL FIELD / 00</span>
        <strong id="signal-field-title">当日业务信号场</strong>
        <em>LIVE OPERATIONS / CURRENT BUSINESS DAY</em>
      </figcaption>
    </figure>
  )
}
