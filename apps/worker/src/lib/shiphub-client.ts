import type { ShipHubConfig, ShipHubMode } from '../env.js'

export const SHIPHUB_CATEGORIES = ['hand', 'receive', 'ship'] as const
export type ShipHubCategory = (typeof SHIPHUB_CATEGORIES)[number]

export type ShipHubOrderItem = {
  id: string
  productLabel: string
  sku: string
  quantity: number
  vehicleInfo?: string | null
  serialNumberMasked?: string | null
  imageUrl?: string | null
}

export type ShipHubOrder = {
  id: string
  category: ShipHubCategory
  displayLabel: string
  orderNumber?: string | null
  sourceLabel: string
  status: string
  customerPhone?: string | null
  vehicleInfo?: string | null
  scheduledAt?: string | null
  updatedAt?: string | null
  detailKey?: string | null
  items: ShipHubOrderItem[]
}

export type ShipHubPage = { orders: ShipHubOrder[]; nextCursor: string | null }

export interface ShipHubClient {
  readonly mode: ShipHubMode
  count(category: ShipHubCategory): Promise<number>
  list(category: ShipHubCategory, cursor?: string | null, pageSize?: number): Promise<ShipHubPage>
  detail(category: ShipHubCategory, id: string, detailKey?: string | null): Promise<ShipHubOrder | null>
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

const DEFAULT_FIXTURE: ShipHubOrder[] = [
  { id: 'fixture-hand-001', category: 'hand', orderNumber: '订单-20260818-001', displayLabel: '订单-20260818-001', sourceLabel: 'Shiphub 自提', status: 'pending', customerPhone: '13800138001', vehicleInfo: '城市通勤车 · 黑色 · M码', scheduledAt: '2026-08-18T10:30:00.000Z', updatedAt: '2026-08-18T01:00:00.000Z', items: [{ id: 'fixture-hand-item-001', productLabel: '城市通勤自行车', sku: 'SKU-CITY-BIKE-001', quantity: 1, vehicleInfo: '城市通勤车 · 黑色 · M码', serialNumberMasked: '***0001' }] },
  { id: 'fixture-receive-001', category: 'receive', orderNumber: '收货-20260818-001', displayLabel: '收货-20260818-001', sourceLabel: 'Shiphub 待收货', status: 'pending', updatedAt: '2026-08-18T01:00:00.000Z', items: [{ id: 'fixture-receive-item-001', productLabel: '自行车配件箱', sku: 'SKU-PARTS-001', quantity: 2 }] },
  { id: 'fixture-ship-001', category: 'ship', orderNumber: '发货-20260818-001', displayLabel: '发货-20260818-001', sourceLabel: 'Shiphub 待发货', status: 'pending', updatedAt: '2026-08-18T01:00:00.000Z', items: [{ id: 'fixture-ship-item-001', productLabel: '整备完成自行车', sku: 'SKU-PREPARED-BIKE-001', quantity: 1, vehicleInfo: '城市通勤车 · 蓝色 · L码', serialNumberMasked: '***0002' }] }
]

function parseFixture(value: string | undefined): ShipHubOrder[] {
  if (!value) return DEFAULT_FIXTURE.map(normalizeOrder)
  try {
    const parsed: unknown = JSON.parse(value)
    if (!Array.isArray(parsed)) throw new Error('not-array')
    return parsed.map((item) => normalizeOrder(item))
  } catch {
    throw new ShipHubUpstreamError('INVALID_FIXTURE')
  }
}

function firstText(...values: unknown[]): string {
  for (const value of values) {
    if (typeof value === 'string' || typeof value === 'number') {
      const text = String(value).trim()
      if (text) return text.slice(0, 240)
    }
  }
  return ''
}

function nestedText(value: unknown, ...keys: string[]): string {
  if (!value || typeof value !== 'object') return ''
  const row = value as Record<string, unknown>
  return firstText(...keys.map((key) => row[key]))
}

function vehicleText(value: unknown): string {
  if (typeof value === 'string' || typeof value === 'number') return String(value).trim().slice(0, 240)
  if (!value || typeof value !== 'object') return ''
  const row = value as Record<string, unknown>
  return [
    firstText(row.brand, row.brandName, row.brand_name),
    firstText(row.model, row.modelName, row.model_name, row.name, row.label),
    firstText(row.color, row.colour),
    firstText(row.size),
    firstText(row.frameNumber, row.frame_number, row.vin, row.vehicleId, row.vehicle_id)
  ].filter(Boolean).join(' · ').slice(0, 240)
}

export function normalizeOrder(input: unknown): ShipHubOrder {
  if (!input || typeof input !== 'object') throw new ShipHubUpstreamError('INVALID_ORDER')
  const row = input as Record<string, unknown>
  const id = String(row.id ?? row.orderId ?? '').trim()
  const category = String(row.category ?? '').trim()
  if (!id) throw new ShipHubUpstreamError('INVALID_ORDER_ID')
  assertCategory(category)
  const rawItems = Array.isArray(row.items) ? row.items : []
  const orderNumber = firstText(row.orderNumber, row.order_number, row.orderNo, row.order_no, row.number)
  const customerPhone = firstText(
    row.customerPhone, row.customer_phone, row.phone, row.mobile, row.contactPhone, row.contact_phone,
    nestedText(row.customer, 'phone', 'mobile', 'phoneNumber'),
    nestedText(row.recipient, 'phone', 'mobile', 'phoneNumber')
  )
  return {
    id,
    category,
    orderNumber: orderNumber || null,
    displayLabel: String(row.displayLabel ?? orderNumber ?? id).slice(0, 160),
    sourceLabel: String(row.sourceLabel ?? 'Shiphub').slice(0, 80),
    status: String(row.status ?? '').slice(0, 80),
    customerPhone: customerPhone || null,
    vehicleInfo: vehicleText(row.vehicleInfo ?? row.vehicle_info ?? row.vehicle ?? row.bike ?? row.bicycle),
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
  const vehicleInfo = vehicleText(row.vehicleInfo ?? row.vehicle_info ?? row.vehicle ?? row.bike ?? row.bicycle)
  const serial = firstText(row.serialNumberMasked, row.serial_number_masked, row.serialNumber, row.serial_number, row.frameNumber, row.frame_number)
  return {
    id: String(row.id ?? row.itemId ?? `item-${index + 1}`).slice(0, 120),
    productLabel: firstText(row.productLabel, row.product_label, row.title, row.name, row.productName, row.product_name, vehicleInfo) || '未命名商品',
    sku: firstText(row.sku, row.skuId, row.sku_id, row.productSku, row.product_sku),
    quantity: Number.isInteger(quantity) && quantity > 0 ? Math.min(quantity, 999) : 1,
    vehicleInfo: vehicleInfo || null,
    serialNumberMasked: serial ? maskSerial(serial) : null,
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

  detail(category: ShipHubCategory, id: string, _detailKey?: string | null): Promise<ShipHubOrder | null> {
    const order = this.orders.find((item) => item.category === category && item.id === id)
    if (!order) return Promise.reject(new ShipHubUpstreamError('UPSTREAM_NOT_FOUND', 404))
    return Promise.resolve(order)
  }
}

export function createFixtureClient(config: ShipHubConfig): FixtureShipHubClient {
  return new FixtureShipHubClient(parseFixture(config.fixtureJson))
}

const CATEGORY_COUNT_PATH: Record<ShipHubCategory, string> = {
  hand: 'to_hand_count',
  receive: 'to_receive_count',
  ship: 'to_ship_count'
}

const CATEGORY_SOURCE_LABEL: Record<ShipHubCategory, string> = {
  hand: 'Shiphub 自提',
  receive: 'Shiphub 待收货',
  ship: 'Shiphub 待发货'
}

function normalizeListOrder(category: ShipHubCategory, input: unknown): ShipHubOrder {
  if (!input || typeof input !== 'object') throw new ShipHubUpstreamError('INVALID_ORDER')
  const row = input as Record<string, unknown>
  const id = firstText(row.b2c_order_id, row.b2cOrderId)
  if (!id) throw new ShipHubUpstreamError('INVALID_ORDER_ID')
  const detailKey = firstText(row.ship_group_id, row.shipGroupId) || null
  const mailNo = firstText(row.mail_no, row.mailNo)
  const orderType = firstText(row.order_type, row.orderType)
  const orderPlatform = firstText(row.order_platform, row.orderPlatform)
  const statusCode = firstText(row.order_latest_status, row.orderLatestStatus)
  const scheduledAt = firstText(row.carrier_arrive_time, row.receive_time, row.expect_pick_time_start, row.expect_delivery_time_start) || null
  return {
    id,
    detailKey,
    category,
    displayLabel: mailNo || id,
    orderNumber: id,
    sourceLabel: CATEGORY_SOURCE_LABEL[category],
    status: orderType || orderPlatform || statusCode || 'pending',
    scheduledAt,
    updatedAt: null,
    items: []
  }
}

function isBikeItem(input: unknown): boolean {
  if (!input || typeof input !== 'object') return false
  const row = input as Record<string, unknown>
  const uniId = String(row.universe_id ?? '').trim()
  const uniEn = String(row.universe_label_en ?? '').toUpperCase()
  const uniZh = String(row.universe_label_zh ?? '')
  return uniId === '2' || uniEn.includes('CYCLING') || uniEn.includes('CYCLE') || uniZh.includes('自行车') || uniZh.includes('骑行')
}

function rawDetailItems(input: unknown): unknown[] {
  if (!input || typeof input !== 'object') return []
  const row = input as Record<string, unknown>
  return Array.isArray(row.order_item_list) ? row.order_item_list : []
}

function mapDetailItem(input: unknown, index: number): ShipHubOrderItem {
  const row = input && typeof input === 'object' ? input as Record<string, unknown> : {}
  const sku = firstText(row.sku_id, row.skuId, row.model_code, row.modelCode)
  const productLabel = firstText(row.sku_name, row.skuName, row.product_label, row.productLabel) || '未命名商品'
  const color = firstText(row.sku_color, row.skuColor)
  const size = firstText(row.sku_size, row.skuSize)
  const brand = firstText(row.brand_label, row.brandLabel)
  const rawQty = Number(row.purchase_qty ?? row.quantity ?? 1)
  const imageUrl = firstText(row.image_url, row.imageUrl) || null
  const vehicleInfo = [color, size].filter(Boolean).join(' · ') || brand || null
  return {
    id: sku || `item-${index + 1}`,
    productLabel,
    sku,
    quantity: Number.isInteger(rawQty) && rawQty > 0 ? Math.min(rawQty, 999) : 1,
    vehicleInfo: vehicleInfo || null,
    serialNumberMasked: null,
    imageUrl
  }
}

function mapDetailItems(input: unknown): ShipHubOrderItem[] {
  if (!input || typeof input !== 'object') return []
  const row = input as Record<string, unknown>
  const rawItems = Array.isArray(row.order_item_list) ? row.order_item_list : []
  return rawItems.map((item, index) => mapDetailItem(item, index))
}

function receiverField(receiverBody: unknown, key: string): string | null {
  if (!receiverBody || typeof receiverBody !== 'object') return null
  const row = receiverBody as Record<string, unknown>
  const data = row.data && typeof row.data === 'object' ? row.data as Record<string, unknown> : {}
  return firstText(data[key]) || null
}

function normalizeDetailOrder(category: ShipHubCategory, listOrder: ShipHubOrder, detailBody: unknown, receiverBody: unknown): ShipHubOrder | null {
  const rawItems = rawDetailItems(detailBody)
  const bikeItems = rawItems.filter(isBikeItem)
  const keptRaw = category === 'ship' ? rawItems : bikeItems
  if (category !== 'ship' && keptRaw.length === 0) return null
  const items = keptRaw.map((item, index) => mapDetailItem(item, index))
  const customerPhone = receiverField(receiverBody, 'mobile')
  const productName = items[0]?.productLabel || null
  const vehicleInfo = items.slice(0, 3).map((item) => item.productLabel).join('、') || null
  return {
    ...listOrder,
    displayLabel: category === 'ship' ? listOrder.displayLabel : (productName || listOrder.displayLabel),
    customerPhone: customerPhone || null,
    vehicleInfo: vehicleInfo || listOrder.vehicleInfo || null,
    updatedAt: new Date().toISOString(),
    items
  }
}

export class HttpShipHubClient implements ShipHubClient {
  readonly mode = 'live' as const
  constructor(
    private readonly config: ShipHubConfig,
    private readonly accessToken: string
  ) {}

  private get locationNum(): string {
    const value = this.config.locationNum?.trim()
    if (!value) throw new ShipHubUpstreamError('LOCATION_NUM_NOT_CONFIGURED')
    return value
  }

  count(category: ShipHubCategory): Promise<number> {
    const path = CATEGORY_COUNT_PATH[category]
    return this.request<unknown>(`/shiphub_web/stores/orders/count/${path}?location_num=${encodeURIComponent(this.locationNum)}`).then((body) => {
      const count = Number(body)
      if (!Number.isInteger(count) || count < 0) return 0
      return count
    })
  }

  list(category: ShipHubCategory, cursor?: string | null, pageSize = 20): Promise<ShipHubPage> {
    const pageNum = cursor ? Math.max(Number(cursor), 0) : 0
    const size = Math.min(Math.max(pageSize, 1), 100)
    const path = `/shiphub_web/stores/orders/${category}/list?location_num=${encodeURIComponent(this.locationNum)}&page_num=${pageNum}&page_size=${size}`
    return this.request<{ total_page_num?: number; order_list?: unknown[] }>(path).then((body) => {
      const rawOrders = Array.isArray(body.order_list) ? body.order_list : []
      const totalPages = Number(body.total_page_num ?? 0)
      const orders = rawOrders.map((row) => normalizeListOrder(category, row))
      const nextPage = pageNum + 1
      const nextCursor = nextPage < totalPages ? String(nextPage) : null
      return { orders, nextCursor }
    })
  }

  detail(category: ShipHubCategory, id: string, detailKey?: string | null): Promise<ShipHubOrder | null> {
    const key = detailKey ?? id
    const listOrder: ShipHubOrder = {
      id,
      detailKey: key,
      category,
      displayLabel: id,
      sourceLabel: CATEGORY_SOURCE_LABEL[category],
      status: 'pending',
      items: []
    }
    const detailPath = `/shiphub_web/stores/orders/${category}/detail?location_num=${encodeURIComponent(this.locationNum)}&ship_group_id=${encodeURIComponent(key)}&decrypt=true`
    return this.request<unknown>(detailPath).then(async (detailBody) => {
      let receiverBody: unknown = null
      try {
        receiverBody = await this.request<unknown>(`/shiphub_web/stores/receiver?b2c_order_id=${encodeURIComponent(id)}`)
      } catch {
        receiverBody = null
      }
      return normalizeDetailOrder(category, listOrder, detailBody, receiverBody)
    })
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
          await new Promise((resolve) => setTimeout(resolve, Math.min(retryAfter * 1000, 3000)))
          continue
        }
        if (!response.ok) {
          const status = response.status
          if (status === 404) throw new ShipHubUpstreamError('UPSTREAM_NOT_FOUND', status)
          if (status === 401 || status === 403) throw new ShipHubUpstreamError('OAUTH_UNAUTHORIZED', status)
          throw new ShipHubUpstreamError('UPSTREAM_ERROR', status, status >= 500 && status < 600)
        }
        return await response.json() as T
      } catch (error: unknown) {
        clearTimeout(timeout)
        if (error instanceof ShipHubUpstreamError) throw error
        if ((error as any)?.name === 'AbortError') throw new ShipHubUpstreamError('UPSTREAM_TIMEOUT', undefined, true)
        throw new ShipHubUpstreamError('UPSTREAM_NETWORK_ERROR', undefined, true)
      } finally {
        clearTimeout(timeout)
      }
    }
    throw new ShipHubUpstreamError('UPSTREAM_MAX_RETRIES')
  }
}

export function createShipHubClient(config: ShipHubConfig, accessToken?: string): ShipHubClient {
  if (config.mode === 'fixture') return createFixtureClient(config)
  if (!accessToken) throw new ShipHubUpstreamError('ACCESS_TOKEN_MISSING')
  return new HttpShipHubClient(config, accessToken)
}
