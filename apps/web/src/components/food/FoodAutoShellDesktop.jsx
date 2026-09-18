import { useEffect, useMemo, useRef } from 'react'
import { CONFIDENCE_LABEL, eventTone, formatClock, formatDuration, percentOf } from '../../utils/foodAutoPresentation.js'

/**
 * 食品自动登记 · 影子系统 · 桌面端（独立实现，不与移动端共享 DOM，memory 23）。
 *
 * 三栏工作台：左栏 = 主操作 + 阶段 / 进度 / 计数；中栏 = 实时捕捉看板；
 * 右栏 = 算法事件流（高位滚动区）。判定完成后底部展开结果表（全宽）。
 */
export default function FoodAutoShellDesktop({ auto, userName, storeName, onOpenLedger }) {
  const { status, running, phase, events, progress, items, liveItems, judgements, savedRun, error, elapsedMs, start, cancel, reset } = auto
  const logRef = useRef(null)

  useEffect(() => {
    const node = logRef.current
    if (!node) return
    const nearBottom = node.scrollHeight - node.scrollTop - node.clientHeight < 120
    if (nearBottom) node.scrollTop = node.scrollHeight
  }, [events])

  const captured = useMemo(() => Object.values(liveItems || {}).sort((a, b) => (b.records || 0) - (a.records || 0)), [liveItems])
  const totals = useMemo(() => {
    const rows = Object.values(liveItems || {})
    return {
      records: rows.reduce((sum, row) => sum + (row.records || 0), 0),
      batches: rows.reduce((sum, row) => sum + (row.batches?.length || 0), 0)
    }
  }, [liveItems])

  const percent = percentOf(progress.done, progress.total)

  return (
    <div className="fa-d">
      <header className="fa-d-head">
        <div className="fa-d-brand">
          <strong>食品自动登记</strong>
          <span>影子系统 · 算法在 CF 侧执行 · 结果写影子表待核验</span>
        </div>
        <div className="fa-d-head-side">
          {storeName ? <span className="fa-d-store">{storeName}</span> : null}
          {userName ? <span className="fa-d-user">{userName}</span> : null}
          {onOpenLedger ? (
            <button type="button" className="fa-d-link" onClick={onOpenLedger}>
              打开台账 ↗
            </button>
          ) : null}
        </div>
      </header>

      <div className="fa-d-grid">
        <aside className="fa-d-rail">
          <button type="button" className="fa-d-start" data-running={running || undefined} onClick={running ? cancel : start} disabled={!running && Boolean(status && !status.configured)}>
            {running ? '取消运行' : judgements.length ? '重新自动登记' : '开始自动登记'}
          </button>

          <div className="fa-d-phase">
            <i className="fa-d-dot" data-on={running || undefined} />
            <span>{phase || '待命'}</span>
            <em>{formatDuration(elapsedMs)}</em>
          </div>

          <div className="fa-d-bar" aria-hidden="true">
            <i style={{ width: `${percent}%` }} data-full={percent >= 100 || undefined} />
          </div>

          <dl className="fa-d-stats">
            <div>
              <dt>遍历段</dt>
              <dd>
                {progress.done}/{progress.total || '—'}
              </dd>
            </div>
            <div>
              <dt>命中记录</dt>
              <dd>{totals.records}</dd>
            </div>
            <div>
              <dt>候选批次</dt>
              <dd>{totals.batches}</dd>
            </div>
            <div>
              <dt>今日商品</dt>
              <dd>{items.length}</dd>
            </div>
          </dl>

          {error ? <p className="fa-d-error">{error}</p> : null}
          {savedRun ? (
            <p className="fa-d-saved">
              已保存 {savedRun.saved} 行
              <code>{String(savedRun.runId).slice(0, 8)}</code>
              <button type="button" className="fa-d-link" onClick={reset}>
                清空
              </button>
            </p>
          ) : null}
          {status && !status.configured ? <p className="fa-d-error">未配置 SNB 上游凭据。</p> : null}
        </aside>

        <section className="fa-d-board">
          <h2>
            实时捕捉 <span>{captured.length}</span>
          </h2>
          <div className="fa-d-caps">
            {captured.length ? (
              captured.map((row) => (
                <article key={row.item} className="fa-d-cap" data-active={row.segments < row.segmentsTotal || undefined}>
                  <header>
                    <strong>{row.name}</strong>
                    <span>
                      {row.segments}/{row.segmentsTotal || '—'} 段 · {row.records} 条
                    </span>
                  </header>
                  {row.batches?.length ? (
                    <ul>
                      {row.batches.map((batch) => (
                        <li key={`${batch.obs}-${batch.exp}`}>
                          <b>{batch.exp ? batch.exp.slice(0, 10) : '无到期日'}</b>
                          <span>{batch.count} 条</span>
                          <em>{(batch.obs || '—').slice(0, 19)}</em>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p>等待命中…</p>
                  )}
                </article>
              ))
            ) : (
              <p className="fa-d-empty">点击「开始自动登记」后，逐商品的命中与批次会实时出现在这里。</p>
            )}
          </div>
        </section>

        <section className="fa-d-logcard">
          <h2>
            算法日志 <span>{events.length}</span>
          </h2>
          <div className="fa-d-log" ref={logRef}>
            {events.length ? (
              events.map((event) => (
                <div key={event.id} className="fa-d-line" data-tone={eventTone(event.level)}>
                  <time>{formatClock(event.at)}</time>
                  <span>{event.text}</span>
                </div>
              ))
            ) : (
              <p className="fa-d-empty">尚未开始。</p>
            )}
          </div>
        </section>
      </div>

      {judgements.length ? (
        <section className="fa-d-results">
          <h2>本次判定结果（{judgements.length}）</h2>
          <table>
            <thead>
              <tr>
                <th>商品</th>
                <th>数量</th>
                <th>生产日期</th>
                <th>过期日期</th>
                <th>预警日</th>
                <th>置信</th>
                <th>备注</th>
              </tr>
            </thead>
            <tbody>
              {judgements.map((row) => (
                <tr key={row.item} data-confidence={row.confidence}>
                  <td>
                    <strong>{row.name}</strong>
                    <small>{row.item}</small>
                  </td>
                  <td>×{row.qty}</td>
                  <td>{row.productionDate || '—'}</td>
                  <td>{row.expiryDate || '—'}</td>
                  <td>{row.warnOn || '—'}</td>
                  <td>
                    <span className="fa-d-conf">{CONFIDENCE_LABEL[row.confidence] || row.confidence}</span>
                  </td>
                  <td>{row.note || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ) : null}
    </div>
  )
}
