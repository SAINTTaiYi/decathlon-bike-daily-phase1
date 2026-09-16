/**
 * 应用选择屏 · 桌面端（独立实现，不与移动端共享 DOM）。
 * 三张大卡并排（Ops / 食品台账 / 门店设计）；信息层级 = 名称 → 一句话说明 → 当日状态。
 */
function statusLine(app, { closeState, flagged }) {
  if (app === 'ops') return closeState === 'closed' ? '今日已闭店' : '今日营业中'
  if (app === 'mass') return '云端图纸 · 门店共享'
  if (flagged === null) return '保质期登记 · 红标清查'
  return flagged > 0 ? `${flagged} 条红标待处理` : '暂无红标待处理'
}

export default function AppSelectDesktop({ rootRef, userName, storeName, closeState, flagged, leaving, onChoose }) {
  return (
    <div className="appselect-desktop" ref={rootRef} data-leaving={leaving || undefined}>
      <div className="appselect-d-frame">
        <header className="appselect-d-head" data-app-select-head>
          <p className="appselect-d-kicker">WORKSHOP</p>
          <h1 className="appselect-d-title">选择要进入的应用</h1>
          <p className="appselect-d-sub">{storeName || '门店'} · {userName || ''}</p>
        </header>
        <div className="appselect-d-cards">
          <button
            type="button"
            className="appselect-d-card"
            data-app-card="ops"
            data-tone="ops"
            onClick={() => onChoose('ops')}
            disabled={Boolean(leaving)}
          >
            <span className="appselect-d-card-eyebrow">01</span>
            <strong className="appselect-d-card-name">Workshop Ops</strong>
            <span className="appselect-d-card-desc">待取车 · 工作交接 · 维修 · 二手 · 销售核对</span>
            <span className="appselect-d-card-status" data-state={closeState === 'closed' ? 'closed' : 'open'}>
              {statusLine('ops', { closeState, flagged })}
            </span>
            <span className="appselect-d-card-go" aria-hidden="true">进入 →</span>
          </button>
          <button
            type="button"
            className="appselect-d-card"
            data-app-card="food"
            data-tone="food"
            onClick={() => onChoose('food')}
            disabled={Boolean(leaving)}
          >
            <span className="appselect-d-card-eyebrow">02</span>
            <strong className="appselect-d-card-name">食品台账</strong>
            <span className="appselect-d-card-desc">保质期登记 · 红标清查 · 临期处理</span>
            <span className="appselect-d-card-status" data-state={(flagged ?? 0) > 0 ? 'alert' : 'open'}>
              {statusLine('food', { closeState, flagged })}
            </span>
            <span className="appselect-d-card-go" aria-hidden="true">进入 →</span>
          </button>
          <button
            type="button"
            className="appselect-d-card"
            data-app-card="mass"
            data-tone="mass"
            onClick={() => onChoose('mass')}
            disabled={Boolean(leaving)}
          >
            <span className="appselect-d-card-eyebrow">03</span>
            <strong className="appselect-d-card-name">Super Mass</strong>
            <span className="appselect-d-card-desc">平面布局 · 3D 渲染 · 方案校验</span>
            <span className="appselect-d-card-status" data-state="open">
              {statusLine('mass', { closeState, flagged })}
            </span>
            <span className="appselect-d-card-go" aria-hidden="true">进入 →</span>
          </button>
        </div>
      </div>
    </div>
  )
}
