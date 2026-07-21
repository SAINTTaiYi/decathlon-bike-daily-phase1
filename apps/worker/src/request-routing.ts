export type ApiRequestHandler = (request: Request) => Response | Promise<Response>

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
  if (!url.pathname.startsWith('/api/') && !url.pathname.startsWith('/health/')) {
    return assets.fetch(request)
  }
  return apiFetch(request)
}
