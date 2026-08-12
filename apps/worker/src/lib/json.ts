import type { MiddlewareHandler } from 'hono'
import { ApiProblem } from '../services/problems.js'

// JSON-consuming routes must pin the media type: browsers cannot send
// `application/json` in a CORS-simple request, so enforcing it closes the
// login-CSRF / text-plain smuggling channel while legitimate clients
// (same-origin fetch) are unaffected.
export const requireJsonBody: MiddlewareHandler = async (c, next) => {
  const contentType = c.req.header('content-type') ?? ''
  if (!contentType.toLowerCase().includes('application/json')) {
    throw new ApiProblem(415, 'CONTENT_TYPE_NOT_SUPPORTED', '仅接受 application/json 请求。')
  }
  return next()
}
