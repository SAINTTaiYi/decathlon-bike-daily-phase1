export default function MainHeadImage() {
  return (
    <figure className="main-head-image" data-motion="photo" aria-labelledby="main-head-title">
      <picture>
        <source type="image/webp" srcSet="/images/workshop-head-480.webp 480w, /images/workshop-head-800.webp 800w, /images/workshop-head-1200.webp 1200w" sizes="(min-width: 860px) 728px, calc(100vw - 1.5rem)" />
        <img src="/images/workshop-head-800.webp" srcSet="/images/workshop-head-480.webp 480w, /images/workshop-head-800.webp 800w, /images/workshop-head-1200.webp 1200w" sizes="(min-width: 860px) 728px, calc(100vw - 1.5rem)" width="1200" height="864" alt="自行车技师在工坊内检修悬挂的自行车，周围是工具和维修设备。" loading="eager" decoding="async" fetchPriority="high" />
      </picture>
      <figcaption className="head-photo-caption"><span>WORKSHOP STUDY · 工坊场景</span><strong id="main-head-title">CLOSING WORKSHOP <small>闭店工坊</small></strong><em>示意图 · Unsplash</em></figcaption>
    </figure>
  )
}
