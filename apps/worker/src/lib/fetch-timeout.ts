// 上游 HTTP 调用超时护栏（2026-09-10）。
//
// 背景：worker 里有一批上游 fetch 此前没有任何超时保护（Shiphub token 刷新、Shiphub 程序化
// 登录、BI/Cube 登录与数据拉取、告警/验证码邮件）。上游静默不响应时调用方会无限期挂起；
// Cloudflare 回收调用后只在业务表留下「悬挂的 running」记录——没有失败、没有告警。
// 2026-09-10 实测 Shiphub 同步出现 3 段静默停摆（最长 2 小时 34 分），全部由这类挂死造成。
//
// 统一约定：worker 内所有上游 fetch 必须挂超时信号（AbortSignal.timeout），把「无限期挂起」
// 转成可控的超时错误；调用方用 isTimeoutError 判定并映射成自己的错误码，
// 交给既有的失败计数 / 重试 / 自愈逻辑接管。
// 回归测试：test/fetch-timeout.test.ts（逐文件断言每个 fetch 与超时信号配对）。

/** 非 Shiphub 上游（BI/Cube/邮件）的默认超时。Shiphub 链路由 SHIPHUB_REQUEST_TIMEOUT_MS 控制。 */
export const UPSTREAM_TIMEOUT_MS = 15_000

/**
 * 判定错误是否来自上游调用超时。
 * AbortSignal.timeout 触发的中止在多数运行时抛 TimeoutError（Node/Workers 标准），
 * 部分实现使用 AbortError；个别 fetch 包装层会把原因藏在 error.cause 里，
 * 因此沿 cause 链向下检查（最多 3 层），避免漏判。
 */
export function isTimeoutError(error: unknown): boolean {
  let current: unknown = error
  for (let depth = 0; depth < 3 && current; depth += 1) {
    const name = (current as { name?: unknown }).name
    if (name === 'TimeoutError' || name === 'AbortError') return true
    current = (current as { cause?: unknown }).cause
  }
  return false
}
