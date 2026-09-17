export type ApiRequestHandler = (request: Request) => Response | Promise<Response>

const HTML_CSP = "default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; form-action 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'; worker-src 'self' blob:; manifest-src 'self'"
// 门店设计渲染（2026-09-15）：这一页由**同源**宿主（mass.workshop.skin 的门店设计
// 外壳 / 预览站的就地嵌入）以 iframe 承载，必须放行同源嵌套；其余页面保持
// frame-ancestors 'none' + DENY（默认拒绝任何嵌套，anti-clickjacking 不回退）。
// 注意：该页不得引用内联脚本 —— CSP 的 script-src 只有 'self'（见 boot.js）。
const EMBEDDABLE_ASSET_PREFIX = '/store-design/'
const EMBEDDABLE_CSP = HTML_CSP.replace("frame-ancestors 'none'", "frame-ancestors 'self'")

function secureResponse(response: Response, sensitive: boolean, embeddable: boolean): Response {
  // WebSocket 升级响应（101，带 webSocket 属性）必须原样放行：重建 Response
  // 会丢失升级通道，且 Workerd 不允许构造「没有 webSocket 的 101」——
  // 重建即抛错、握手 500（2026-09-17 冒烟实测的第三处根因）。
  if (response.status === 101 || response.webSocket) return response
  const headers = new Headers(response.headers)
  headers.set('X-Content-Type-Options', 'nosniff')
  headers.set('Referrer-Policy', 'strict-origin-when-cross-origin')
  headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()')
  headers.set('X-Frame-Options', embeddable ? 'SAMEORIGIN' : 'DENY')
  headers.set('Strict-Transport-Security', 'max-age=31536000')
  if (sensitive) {
    headers.set('Cache-Control', 'no-store, private')
    headers.set('Pragma', 'no-cache')
    headers.set('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'; base-uri 'none'")
  } else if ((headers.get('content-type') ?? '').toLowerCase().includes('text/html')) {
    headers.set('Content-Security-Policy', embeddable ? EMBEDDABLE_CSP : HTML_CSP)
  }
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers })
}

export async function routeIncomingRequest(
  request: Request,
  assets: Pick<Fetcher, 'fetch'>,
  apiFetch: ApiRequestHandler
): Promise<Response> {
  const url = new URL(request.url)
  if (url.protocol === 'http:') {
    url.protocol = 'https:'
    return Response.redirect(url.toString(), 308)
  }
  const sensitive = url.pathname.startsWith('/api/') || url.pathname.startsWith('/health/')
  const embeddable = !sensitive && url.pathname.startsWith(EMBEDDABLE_ASSET_PREFIX)
  const response = sensitive ? await apiFetch(request) : await assets.fetch(request)
  return secureResponse(response, sensitive, embeddable)
}
