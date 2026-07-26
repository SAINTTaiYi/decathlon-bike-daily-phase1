export type ApiRequestHandler = (request: Request) => Response | Promise<Response>

const HTML_CSP = "default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; form-action 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'; worker-src 'self' blob:; manifest-src 'self'"

function secureResponse(response: Response, sensitive: boolean): Response {
  const headers = new Headers(response.headers)
  headers.set('X-Content-Type-Options', 'nosniff')
  headers.set('Referrer-Policy', 'strict-origin-when-cross-origin')
  headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()')
  headers.set('X-Frame-Options', 'DENY')
  headers.set('Strict-Transport-Security', 'max-age=31536000')
  if (sensitive) {
    headers.set('Cache-Control', 'no-store, private')
    headers.set('Pragma', 'no-cache')
    headers.set('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'; base-uri 'none'")
  } else if ((headers.get('content-type') ?? '').toLowerCase().includes('text/html')) {
    headers.set('Content-Security-Policy', HTML_CSP)
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
  const response = sensitive ? await apiFetch(request) : await assets.fetch(request)
  return secureResponse(response, sensitive)
}
