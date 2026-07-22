export default function MainHeadImage() {
  return (
    <figure className="main-head-image signal-overview-media" data-signal-module="overview" data-motion="photo" data-workspace-module="true" aria-labelledby="main-head-title">
      <picture>
        <source type="image/webp" srcSet="/images/workshop-head-480.webp 480w, /images/workshop-head-800.webp 800w, /images/workshop-head-1200.webp 1200w" sizes="(min-width: 860px) 760px, 100vw" />
        <img src="/images/workshop-head-800.webp" srcSet="/images/workshop-head-480.webp 480w, /images/workshop-head-800.webp 800w, /images/workshop-head-1200.webp 1200w" sizes="(min-width: 860px) 760px, 100vw" width="1200" height="864" alt="自行车技师在工坊内检修悬挂的自行车，周围是工具和维修设备。" loading="eager" decoding="async" fetchPriority="high" />
      </picture>
      <figcaption className="head-photo-caption">
        <span>WORKSHOP OPERATIONS</span>
        <strong id="main-head-title">维修与闭店工作台</strong>
        <em>Workshop Ledger</em>
      </figcaption>
    </figure>
  )
}
