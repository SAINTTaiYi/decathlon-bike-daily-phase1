/**
 * 应用选择屏 · 移动端（独立实现，不与桌面端共享 DOM）。
 * 纵向堆叠两卡，卡片整行可点；底部留出安全区。
 */
function statusLine(app, { closeState, flagged }) {
  if (app === 'ops') return closeState === 'closed' ? '今日已闭店' : '今日营业中'
  if (flagged === null) return '保质期登记 · 红标清查'
  return flagged > 0 ? `${flagged} 条红标待处理` : '暂无红标待处理'
}

export default function AppSelectMobile({ rootRef, userName, storeName, closeState, flagged, leaving, onChoose }) {
  return (
    <div className="appselect-mobile" ref={rootRef} data-leaving={leaving || undefined}>
      <header className="appselect-m-head" data-app-select-head>
        <p className="appselect-m-kicker">WORKSHOP</p>
        <h1 className="appselect-m-title">选择要进入的应用</h1>
        <p className="appselect-m-sub">{storeName || '门店'} · {userName || ''}</p>
      </header>
      <div className="appselect-m-cards">
        <button
          type="button"
          className="appselect-m-card"
          data-app-card="ops"
          data-tone="ops"
          onClick={() => onChoose('ops')}
          disabled={Boolean(leaving)}
        >
          <span className="appselect-m-card-main">
            <strong className="appselect-m-card-name">Workshop Ops</strong>
            <span className="appselect-m-card-desc">待取车 · 交接 · 维修 · 销售</span>
          </span>
          <span className="appselect-m-card-side">
            <span className="appselect-m-card-status" data-state={closeState === 'closed' ? 'closed' : 'open'}>
              {statusLine('ops', { closeState, flagged })}
            </span>
            <span className="appselect-m-card-go" aria-hidden="true">→</span>
          </span>
        </button>
        <button
          type="button"
          className="appselect-m-card"
          data-app-card="food"
          data-tone="food"
          onClick={() => onChoose('food')}
          disabled={Boolean(leaving)}
        >
          <span className="appselect-m-card-main">
            <strong className="appselect-m-card-name">食品台账</strong>
            <span className="appselect-m-card-desc">保质期登记 · 红标清查</span>
          </span>
          <span className="appselect-m-card-side">
            <span className="appselect-m-card-status" data-state={(flagged ?? 0) > 0 ? 'alert' : 'open'}>
              {statusLine('food', { closeState, flagged })}
            </span>
            <span className="appselect-m-card-go" aria-hidden="true">→</span>
          </span>
        </button>
      </div>
    </div>
  )
}
