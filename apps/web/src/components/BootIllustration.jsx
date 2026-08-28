export function BikeWorkshopIllustration({ className = '' }) {
  return (
    <svg
      className={className}
      viewBox="0 0 420 340"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="yellowGlow" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#ffea79" />
          <stop offset="100%" stopColor="#ffde59" />
        </linearGradient>
        <linearGradient id="skyGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#2a2e38" />
          <stop offset="100%" stopColor="#14161a" />
        </linearGradient>
        <filter id="softGlow" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="8" result="blur" />
          <feComposite in="SourceGraphic" in2="blur" operator="over" />
        </filter>
      </defs>

      {/* 背景动态装饰圆盘 */}
      <circle cx="210" cy="160" r="110" fill="url(#yellowGlow)" opacity="0.12" />
      <circle cx="210" cy="160" r="80" fill="url(#yellowGlow)" opacity="0.18" filter="url(#softGlow)" />

      {/* 几何星芒与粒子 */}
      <path d="M70 70L74 84L88 88L74 92L70 106L66 92L52 88L66 84Z" fill="#ffde59" opacity="0.8" />
      <path d="M350 90L353 100L363 103L353 106L350 116L347 106L337 103L347 100Z" fill="#ffffff" opacity="0.6" />
      <circle cx="95" cy="240" r="4" fill="#ffde59" opacity="0.5" />
      <circle cx="340" cy="220" r="5" fill="#ffffff" opacity="0.4" />
      <circle cx="140" cy="50" r="3" fill="#ffde59" opacity="0.6" />

      {/* 地面轻阴影基线 */}
      <ellipse cx="210" cy="275" rx="145" ry="12" fill="#000000" opacity="0.25" />

      {/* ====== 自行车车体 ====== */}
      {/* 后轮 */}
      <g className="wheel-rear">
        <circle cx="120" cy="210" r="52" stroke="#ffffff" strokeWidth="6" strokeDasharray="3 3" opacity="0.4" />
        <circle cx="120" cy="210" r="52" stroke="#ffde59" strokeWidth="4" />
        <circle cx="120" cy="210" r="16" fill="#2a2e39" stroke="#ffffff" strokeWidth="3" />
        {/* 轮辐 */}
        <line x1="120" y1="158" x2="120" y2="262" stroke="#ffffff" strokeWidth="1.5" opacity="0.5" />
        <line x1="68" y1="210" x2="172" y2="210" stroke="#ffffff" strokeWidth="1.5" opacity="0.5" />
        <line x1="83" y1="173" x2="157" y2="247" stroke="#ffffff" strokeWidth="1.5" opacity="0.5" />
        <line x1="83" y1="247" x2="157" y2="173" stroke="#ffffff" strokeWidth="1.5" opacity="0.5" />
      </g>

      {/* 前轮 */}
      <g className="wheel-front">
        <circle cx="300" cy="210" r="52" stroke="#ffffff" strokeWidth="6" strokeDasharray="3 3" opacity="0.4" />
        <circle cx="300" cy="210" r="52" stroke="#ffde59" strokeWidth="4" />
        <circle cx="300" cy="210" r="16" fill="#2a2e39" stroke="#ffffff" strokeWidth="3" />
        {/* 轮辐 */}
        <line x1="300" y1="158" x2="300" y2="262" stroke="#ffffff" strokeWidth="1.5" opacity="0.5" />
        <line x1="248" y1="210" x2="352" y2="210" stroke="#ffffff" strokeWidth="1.5" opacity="0.5" />
        <line x1="263" y1="173" x2="337" y2="247" stroke="#ffffff" strokeWidth="1.5" opacity="0.5" />
        <line x1="263" y1="247" x2="337" y2="173" stroke="#ffffff" strokeWidth="1.5" opacity="0.5" />
      </g>

      {/* 车架主结构 (极简运动几何设计) */}
      {/* 后叉下 */}
      <line x1="120" y1="210" x2="200" y2="210" stroke="#ffffff" strokeWidth="6" strokeLinecap="round" />
      {/* 后叉上 */}
      <line x1="120" y1="210" x2="175" y2="135" stroke="#ffffff" strokeWidth="6" strokeLinecap="round" />
      {/* 下管 */}
      <line x1="200" y1="210" x2="265" y2="120" stroke="#ffde59" strokeWidth="7" strokeLinecap="round" />
      {/* 立管 */}
      <line x1="200" y1="210" x2="175" y2="135" stroke="#ffffff" strokeWidth="6" strokeLinecap="round" />
      {/* 上管 */}
      <line x1="175" y1="135" x2="265" y2="120" stroke="#ffffff" strokeWidth="6" strokeLinecap="round" />
      {/* 前叉 */}
      <line x1="265" y1="120" x2="300" y2="210" stroke="#ffde59" strokeWidth="6" strokeLinecap="round" />

      {/* 车座管 & 座垫 */}
      <line x1="175" y1="135" x2="168" y2="115" stroke="#ffffff" strokeWidth="5" strokeLinecap="round" />
      <path d="M150 115C150 115 168 112 188 115C193 115 190 122 182 122L156 122C150 122 150 115 150 115Z" fill="#ffde59" />

      {/* 车把立管 & 弯把 */}
      <line x1="265" y1="120" x2="268" y2="98" stroke="#ffffff" strokeWidth="5" strokeLinecap="round" />
      <path d="M260 98H280C286 98 290 102 290 108C290 114 284 116 278 116" stroke="#ffffff" strokeWidth="5" strokeLinecap="round" fill="none" />

      {/* 中轴齿盘 & 曲柄脚踏 */}
      <circle cx="200" cy="210" r="18" fill="#14161a" stroke="#ffde59" strokeWidth="3.5" />
      <line x1="200" y1="210" x2="214" y2="230" stroke="#ffffff" strokeWidth="4.5" strokeLinecap="round" />
      <rect x="208" y="228" width="14" height="6" rx="2" fill="#ffde59" />

      {/* 维修扳手漂浮光效 (工坊元素) */}
      <g transform="translate(290, 60) rotate(25)" opacity="0.95">
        <rect x="0" y="8" width="45" height="7" rx="3.5" fill="#ffde59" />
        <path d="M40 3C37 3 35 5 35 8C35 11 37 13 40 13C41.5 13 43 12 44 10.5L39 8.5L44 6.5C43 5 41.5 3 40 3Z" fill="#ffffff" />
        <circle cx="6" cy="11.5" r="3" fill="#14161a" />
      </g>
    </svg>
  )
}
