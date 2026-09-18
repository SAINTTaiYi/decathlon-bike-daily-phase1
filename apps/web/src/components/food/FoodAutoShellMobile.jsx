import { useEffect, useMemo, useRef } from 'react'
import { CONFIDENCE_LABEL, eventTone, formatClock, formatDuration, percentOf } from '../../utils/foodAutoPresentation.js'

/**
 * 食品自动登记 · 影子系统 · 移动端（独立实现，不与桌面端共享 DOM，memory 23）。
 *
 * 信息架构（用户定案）：
 *   顶部  标题 + 台账入口
 *   主操作「开始自动登记」大按钮（运行中变取消），下方是阶段 / 进度条 / 计数
 *   结果  判定完成后置顶显示（商品 / 数量 / 生产 / 过期 / 预警 / 置信）
 *   捕捉  逐商品实时战绩（命中条数 + 候选批次），随算法推进逐条长出来
 *   日志  算法事件流，每段扫描 / 每个新批次都实时追加，自动滚到底
 */
export default function FoodAutoShellMobile({ auto, userName, storeName, onOpenLedger }) {
  const { status, running, phase, events, progress, items, liveItems, judgements, savedRun, error, elapsedMs, start, cancel, reset } = auto
  const logRef = useRef(null)

  // 日志自动跟随：仅当用户停在底部附近时才自动滚动，向上翻阅时不被拽回。
  useEffect(() => {
    const node = logRef.current
    if (!node) return
    const nearBottom = node.scrollHeight - node.scrollTop - node.clientHeight < 96
    if (nearBottom) node.scrollTop = node.scrollHeight
  }, [events])

  const captured = useMemo(() => {
    const rows = Object.values(liveItems || {})
    return rows.sort((a, b) => (b.records || 0) - (a.records || 0))
  }, [liveItems])

  const totals = useMemo(() => {
    const rows = Object.values(liveItems || {})
    const records = rows.reduce((sum, row) => sum + (row.records || 0), 0)
    const batches = rows.reduce((sum, row) => sum + (row.batches?.length || 0), 0)
    return { records, batches, items: rows.length }
  }, [liveItems])

  const percent = percentOf(progress.done, progress.total)
  const phaseLabel = phaseText(phase)

  return (
    <div className="fa-m">
      <header className="fa-m-head">
        <div className="fa-m-brand">
          <strong>自动登记</strong>
          <span>影子系统{storeName ? ` · ${storeName}` : ''}</span>
        </div>
        <div className="fa-m-head-side">
          {onOpenLedger ? (
            <button type="button" className="fa-m-link" onClick={onOpenLedger}>
              台账 ↗
            </button>
          ) : null}
        </div>
      </header>

      <div className="fa-m-body">
        <section className="fa-m-hero" data-running={running || undefined}>
          <button type="button" className="fa-m-start" data-running={running || undefined} onClick={running ? cancel : start} disabled={!running && Boolean(status && !status.configured)}>
            {running ? '取消运行' : phase === 'done' || judgements.length ? '重新自动登记' : '开始自动登记'}
          </button>

          <div className="fa-m-status">
            <div className="fa-m-phase">
              <i className="fa-m-dot" data-on={running || undefined} />
              <span>{phaseLabel}</span>
              {running || elapsedMs ? <em>{formatDuration(elapsedMs)}</em> : null}
            </div>
            <div className="fa-m-bar" aria-hidden="true">
              <i style={{ width: `${percent}%` }} data-full={percent >= 100 || undefined} />
            </div>
            <div className="fa-m-counters">
              <span>
                遍历 <b>{progress.done}</b>/{progress.total || '—'} 段
              </span>
              <span>
                命中记录 <b>{totals.records}</b>
              </span>
              <span>
                商品 <b>{items.length || totals.items}</b>
              </span>
            </div>
          </div>

          {error ? <p className="fa-m-error">{error}</p> : null}
          {savedRun ? (
            <p className="fa-m-saved">
              影子运行已保存 · {savedRun.saved} 行 · <code>{String(savedRun.runId).slice(0, 8)}</code>
              <button type="button" className="fa-m-link" onClick={reset}>
                清空
              </button>
            </p>
          ) : null}
        </section>

        {judgements.length ? (
          <section className="fa-m-card">
            <h2 className="fa-m-title">本次判定结果（{judgements.length}）</h2>
            <ul className="fa-m-results">
              {judgements.map((row) => (
                <li key={row.item} className="fa-m-result" data-confidence={row.confidence}>
                  <div className="fa-m-result-head">
                    <strong>{row.name}</strong>
                    <span className="fa-m-qty">×{row.qty}</span>
                  </div>
                  <div className="fa-m-result-dates">
                    <span>
                      生产 <b>{row.productionDate || '—'}</b>
                    </span>
                    <span>
                      过期 <b>{row.expiryDate || '—'}</b>
                    </span>
                    <span>
                      预警 <b>{row.warnOn || '—'}</b>
                    </span>
                    <span className="fa-m-conf">置信 {CONFIDENCE_LABEL[row.confidence] || row.confidence}</span>
                  </div>
                  {row.note ? <p className="fa-m-note">{row.note}</p> : null}
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <section className="fa-m-card">
          <h2 className="fa-m-title">实时捕捉（{captured.length}）</h2>
          {captured.length ? (
            <ul className="fa-m-caps">
              {captured.map((row) => (
                <li key={row.item} className="fa-m-cap" data-active={row.segments < row.segmentsTotal || undefined}>
                  <div className="fa-m-cap-head">
                    <strong>{row.name}</strong>
                    <span>
                      段 {row.segments}/{row.segmentsTotal || '—'} · 命中 {row.records}
                    </span>
                  </div>
                  {row.batches?.length ? (
                    <div className="fa-m-cap-batches">
                      {row.batches.slice(0, 3).map((batch) => (
                        <span key={`${batch.obs}-${batch.exp}`} className="fa-m-chip">
                          {batch.exp ? batch.exp.slice(0, 10) : '无到期日'} · {batch.count}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <p className="fa-m-cap-idle">等待命中…</p>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="fa-m-empty">点击「开始自动登记」，扫描结果会实时出现在这里。</p>
          )}
        </section>

        <section className="fa-m-card fa-m-card-log">
          <h2 className="fa-m-title">
            算法日志 <span className="fa-m-count">{events.length}</span>
          </h2>
          <div className="fa-m-log" ref={logRef}>
            {events.length ? (
              events.map((event) => (
                <div key={event.id} className="fa-m-line" data-tone={eventTone(event.level)}>
                  <time>{formatClock(event.at)}</time>
                  <span>{event.text}</span>
                </div>
              ))
            ) : (
              <p className="fa-m-empty">尚未开始。</p>
            )}
          </div>
        </section>

        {status && !status.configured ? <p className="fa-m-error">自动登记未配置上游凭据，请先在部署里补齐 SNB secret。</p> : null}
        {userName ? <p className="fa-m-foot">{userName} · 影子数据仅供核验，不写正式台账</p> : null}
      </div>
    </div>
  )
}

/** 阶段文案：算法推进中显示「正在做什么」，与用户要求的「当前状态展示」对齐。 */
function phaseText(phase) {
  switch (phase) {
    case 'idle':
      return '待命'
    case 'done':
      return '完成'
    case 'cancelled':
    case '已取消':
      return '已取消'
    case '失败':
      return '失败'
    default:
      return phase || '待命'
  }
}
