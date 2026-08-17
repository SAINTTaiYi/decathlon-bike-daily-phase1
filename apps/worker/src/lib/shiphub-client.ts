import type { ShipHubConfig, ShipHubMode } from '../env.js'

export const SHIPHUB_CATEGORIES = ['hand', 'receive', 'ship'] as const
export type ShipHubCategory = (typeof SHIPHUB_CATEGORIES)[number]

export type ShipHubOrderItem = {
  id: string
  productLabel: string
  sku: string
  quantity: number
  serialNumberMasked?: string | null
  imageUrl?: string | null
}

export type ShipHubOrder = {
  id: string
  category: ShipHubCategory
  displayLabel: string
  sourceLabel: string
  status: string
  scheduledAt?: string | null
  updatedAt?: string | null
  items: ShipHubOrderItem[]
}

export type ShipHubPage = { orders: ShipHubOrder[]; nextCursor: string | null }

export interface ShipHubClient {
  readonly mode: ShipHubMode
  count(category: ShipHubCategory): Promise<number>
  list(category: ShipHubCategory, cursor?: string | null, pageSize?: number): Promise<ShipHubPage>
  detail(category: ShipHubCategory, id: string): Promise<ShipHubOrder>
}

export class ShipHubUpstreamError extends Error {
  constructor(
    readonly code: string,
    readonly status?: number,
    readonly retryable = false
  ) {
    super(code)
    this.name = 'ShipHubUpstreamError'
  }
}

function assertCategory(value: string): asserts value is ShipHubCategory {
  if (!SHIPHUB_CATEGORIES.includes(value as ShipHubCategory)) throw new ShipHubUpstreamError('INVALID_CATEGORY')
}

function parseFixture(value: string | undefined): ShipHubOrder[] {
  if (!value) return []
  try {
    const parsed: unknown = JSON.parse(value)
    if (!Array.isArray(parsed)) throw new Error('not-array')
    return parsed.map((item) => normalizeOrder(item))
  } catch {
    throw new ShipHubUpstreamError('INVALID_FIXTURE')
  }
}

export function normalizeOrder(input: unknown): ShipHubOrder {
  if (!input || typeof input !== 'object') throw new ShipHubUpstreamError('INVALID_ORDER')
  const row = input as Record<string, unknown>
  const id = String(row.id ?? row.orderId ?? '').trim()
  const category = String(row.category ?? '').trim()
  if (!id) throw new ShipHubUpstreamError('INVALID_ORDER_ID')
  assertCategory(category)
  const rawItems = Array.isArray(row.items) ? row.items : []
  return {
    id,
    category,
    displayLabel: String(row.displayLabel ?? row.orderNumber ?? id).slice(0, 160),
    sourceLabel: String(row.sourceLabel ?? 'Shiphub').slice(0, 80),
    status: String(row.status ?? '').slice(0, 80),
    scheduledAt: typeof row.scheduledAt === 'string' ? row.scheduledAt : null,
    updatedAt: typeof row.updatedAt === 'string' ? row.updatedAt : null,
    items: rawItems.map((item, index) => normalizeItem(item, index))
  }
}

function maskSerial(value: string): string {
  const compact = value.trim().slice(0, 120)
  if (!compact) return ''
  const suffix = compact.slice(-4)
  return `${'*'.repeat(Math.max(compact.length - suffix.length, 3))}${suffix}`
}

function normalizeItem(input: unknown, index: number): ShipHubOrderItem {
  const row = input && typeof input === 'object' ? input as Record<string, unknown> : {}
  const quantity = Number(row.quantity ?? 1)
  return {
    id: String(row.id ?? row.itemId ?? `item-${index + 1}`).slice(0, 120),
    productLabel: String(row.productLabel ?? row.title ?? '').slice(0, 240),
    sku: String(row.sku ?? row.skuId ?? '').slice(0, 120),
    quantity: Number.isInteger(quantity) && quantity > 0 ? Math.min(quantity, 999) : 1,
    serialNumberMasked: typeof row.serialNumberMasked === 'string' ? maskSerial(row.serialNumberMasked) : null,
    // Image URLs remain withheld until an approved, credential-free public URL contract exists.
    imageUrl: null
  }
}

export class FixtureShipHubClient implements ShipHubClient {
  readonly mode = 'fixture' as const
  private readonly orders: ShipHubOrder[]

  constructor(orders: ShipHubOrder[] = []) {
    this.orders = orders.map(normalizeOrder)
  }

  count(category: ShipHubCategory): Promise<number> {
    return Promise.resolve(this.orders.filter((order) => order.category === category).length)
  }

  list(category: ShipHubCategory, cursor?: string | null, pageSize = 100): Promise<ShipHubPage> {
    const orders = this.orders.filter((order) => order.category === category)
    const start = cursor ? Math.max(Number(cursor), 0) : 0
    const page = orders.slice(start, start + pageSize)
    const next = start + page.length < orders.length ? String(start + page.length) : null
    return Promise.resolve({ orders: page, nextCursor: next })
  }

  detail(category: ShipHubCategory, id: string): Promise<ShipHubOrder> {
    const order = this.orders.find((item) => item.category === category && item.id === id)
    if (!order) return Promise.reject(new ShipHubUpstreamError('UPSTREAM_NOT_FOUND', 404))
    return Promise.resolve(order)
  }
}

export function createFixtureClient(config: ShipHubConfig): FixtureShipHubClient {
  return new FixtureShipHubClient(parseFixture(config.fixtureJson))
}

export class HttpShipHubClient implements ShipHubClient {
  readonly mode = 'live' as const
  constructor(private readonly config: ShipHubConfig, private readonly accessToken: string) {}

  count(category: ShipHubCategory): Promise<number> {
    return this.request<{ count: number }>(`/v1/orders/${category}/count`).then((body) => {
      const count = Number(body.count)
      if (!Number.isInteger(count) || count < 0) throw new ShipHubUpstreamError('INVALID_COUNT')
      return count
    })
  }

  list(category: ShipHubCategory, cursor?: string | null, pageSize = 100): Promise<ShipHubPage> {
    const params = new URLSearchParams({ page_size: String(Math.min(Math.max(pageSize, 1), 500)) })
    if (cursor) params.set('cursor', cursor)
    return this.request<{ orders: unknown[]; next_cursor?: string | null }>(`/v1/orders/${category}?${params}`)
      .then((body) => ({
        orders: (body.orders ?? []).map(normalizeOrder),
        nextCursor: body.next_cursor ?? null
      }))
  }

  detail(category: ShipHubCategory, id: string): Promise<ShipHubOrder> {
    return this.request<unknown>(`/v1/orders/${category}/${encodeURIComponent(id)}`).then(normalizeOrder)
  }

  private async request<T>(path: string): Promise<T> {
    if (!this.config.baseUrl) throw new ShipHubUpstreamError('LIVE_BASE_URL_NOT_CONFIGURED')
    const url = new URL(path, this.config.baseUrl.endsWith('/') ? this.config.baseUrl : `${this.config.baseUrl}/`)
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), this.config.requestTimeoutMs)
      try {
        const response = await fetch(url, {
          headers: { accept: 'application/json', authorization: `Bearer ${this.accessToken}` },
          signal: controller.signal
        })
        if ((response.status === 429 || response.status >= 500) && attempt === 0) {
          const retryAfter = Number(response.headers.get('retry-after') ?? 0)
          await new Promise((resolve) => setTimeout(resolve, Math.min(Math.max(retryAfter * 1000, 100), 1000)))
          continue
        }
        if (!response.ok) throw new ShipHubUpstreamError(`UPSTREAM_HTTP_${response.status}`, response.status, response.status >= 500)
        try {
          return await response.json() as T
        } catch {
          throw new ShipHubUpstreamError('UPSTREAM_INVALID_JSON')
        }
      } catch (error) {
        if (error instanceof ShipHubUpstreamError) throw error
        if (attempt === 0) continue
        throw new ShipHubUpstreamError(error instanceof DOMException && error.name === 'AbortError' ? 'UPSTREAM_TIMEOUT' : 'UPSTREAM_NETWORK_ERROR', undefined, true)
      } finally {
        clearTimeout(timeout)
      }
    }
    throw new ShipHubUpstreamError('UPSTREAM_RETRY_EXHAUSTED', undefined, true)
  }
}

export function createShipHubClient(config: ShipHubConfig, accessToken?: string): ShipHubClient {
  if (config.mode === 'fixture') return createFixtureClient(config)
  if (!config.liveConfirmed) throw new ShipHubUpstreamError('LIVE_NOT_CONFIRMED')
  if (!accessToken) throw new ShipHubUpstreamError('ACCESS_TOKEN_NOT_AVAILABLE')
  return new HttpShipHubClient(config, accessToken)
}
