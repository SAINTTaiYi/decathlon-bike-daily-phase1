interface InjectionResponse {
  statusCode: number
  headers: Record<string, string | string[] | undefined>
  rawPayload: Buffer
}

export interface EdgeOneRequestContext {
  request: Request
  env?: Record<string, string | undefined>
  clientIp?: string
}

export interface InjectableApp {
  inject(options: {
    method: string
    url: string
    headers: Record<string, string>
    payload?: Buffer
    remoteAddress?: string
  }): Promise<InjectionResponse>
}

const hopByHopHeaders = new Set([
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade'
])

function requestHeaders(request: Request): Record<string, string> {
  return Object.fromEntries(request.headers.entries())
}

function remoteAddress(request: Request): string | undefined {
  const forwarded = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
  return forwarded || request.headers.get('x-real-ip') || undefined
}

async function requestPayload(request: Request): Promise<Buffer | undefined> {
  if (request.method === 'GET' || request.method === 'HEAD') return undefined
  const body = await request.arrayBuffer()
  return body.byteLength ? Buffer.from(body) : undefined
}

function responseHeaders(source: InjectionResponse['headers']): Headers {
  const headers = new Headers()
  for (const [name, value] of Object.entries(source)) {
    if (value === undefined || hopByHopHeaders.has(name.toLowerCase())) continue
    if (Array.isArray(value)) {
      for (const item of value) headers.append(name, item)
    } else {
      headers.set(name, value)
    }
  }
  return headers
}

export function createFetchHandler(getApp: (context: EdgeOneRequestContext) => Promise<InjectableApp>) {
  return async function onRequest(context: EdgeOneRequestContext): Promise<Response> {
    const request = context.request
    const url = new URL(request.url)
    const app = await getApp(context)
    const clientIp = context.clientIp || remoteAddress(request)
    const payload = await requestPayload(request)
    const injected = await app.inject({
      method: request.method,
      url: `${url.pathname}${url.search}`,
      headers: requestHeaders(request),
      ...(payload ? { payload } : {}),
      ...(clientIp ? { remoteAddress: clientIp } : {})
    })
    const body = request.method === 'HEAD' || injected.statusCode === 204 || injected.statusCode === 304
      ? null
      : injected.rawPayload
    return new Response(body, {
      status: injected.statusCode,
      headers: responseHeaders(injected.headers)
    })
  }
}
