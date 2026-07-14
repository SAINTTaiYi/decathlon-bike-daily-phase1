import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const [directory = 'apps/web/dist', apiOrigin, environment = 'staging'] = process.argv.slice(2)
if (!apiOrigin || !/^https:\/\//u.test(apiOrigin)) throw new Error('API origin must be an HTTPS URL')
const robots = environment === 'production' ? 'noindex, nofollow, noarchive, nosnippet' : 'noindex, nofollow, noarchive, nosnippet'
const content = `/*
  X-Robots-Tag: ${robots}
  X-Content-Type-Options: nosniff
  X-Frame-Options: DENY
  Referrer-Policy: no-referrer
  Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=(), usb=()
  Cross-Origin-Opener-Policy: same-origin
  Cross-Origin-Resource-Policy: same-site
  Content-Security-Policy: default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; form-action 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https://*.r2.cloudflarestorage.com; font-src 'self'; connect-src 'self' ${apiOrigin} https://*.r2.cloudflarestorage.com; worker-src 'self'; upgrade-insecure-requests

/index.html
  Cache-Control: no-cache, no-store, must-revalidate

/sw.js
  Cache-Control: no-cache, no-store, must-revalidate

/assets/*
  Cache-Control: public, max-age=31536000, immutable
`
await mkdir(resolve(directory), { recursive: true })
await writeFile(resolve(directory, '_headers'), content)
console.log(`PAGES HEADERS WRITTEN · ${environment} · ${apiOrigin}`)
