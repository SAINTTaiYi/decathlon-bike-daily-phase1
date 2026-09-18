import { Hono } from 'hono'
import { FOOD_SCAN_ZONES } from '../data/food-scan-zones.js'
import { FOOD_SHELF_LIFE_BY_ITEM } from '../data/food-shelf-life.js'
import type { AppConfig, WorkerEnv } from '../env.js'
import type { AuthContext } from '../auth/types.js'
import { createAuthMiddleware } from '../auth/middleware.js'
import {
  SEGMENT_SIZE,
  SCAN_WINDOW_HOURS,
  buildScanPlan,
  discoverTodayReceptions,
  fetchPendingReceptions,
  fetchReceptionItems,
  judgeAggregates,
  judgeBatches,
  sanitizeAggregates,
  listShadowRows,
  listShadowRuns,
  saveShadowRun,
  scanSegment,
  type PlanItem,
  type RawRecord
} from '../services/food-auto.js'
import { getSnbToken, isSnbConfigured } from '../services/snb-identity.js'
import { ApiProblem } from '../services/problems.js'

type Vars = { config: AppConfig; auth: AuthContext | null }

// 把上游错误（带 code 的 Error）转成结构化 ApiProblem；已是 ApiProblem 的原样抛出。
async function upstream<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn()
  } catch (error) {
    if (error instanceof ApiProblem) throw error
    const code = error && typeof error === 'object' ? (error as { code?: unknown }).code : undefined
    if (typeof code === 'string' && code) {
      const status = (error as { status?: unknown }).status
      const httpStatus = typeof status === 'number' && status >= 400 && status < 600 ? 502 : 502
      throw new ApiProblem(httpStatus, code, '自动登记上游调用失败，请稍后重试。')
    }
    throw error
  }
}

/**
 * 食品自动登记影子系统路由（2026-09-18）。
 *
 * 设计（用户定案）：只有「自动登记」一个功能，算法在 CF 侧执行，
 * 调度在前端（逐段调用 /scan 驱动实时进度），结果写影子表。
 *
 * 门店边界（铁律）：部署级凭据只服务绑定门店（FOOD_AUTO_BOUND_STORE），
 * 其它门店调用一律 403 —— 凭据属于谁就只服务谁。
 */
export function foodAutoRoutes() {
  const app = new Hono<{ Bindings: WorkerEnv; Variables: Vars }>()
  const auth = createAuthMiddleware()
  const read = [auth.loadSession, auth.requirePasswordChanged] as const
  const write = [auth.loadSession, auth.requirePasswordChanged, auth.requireCsrf] as const

  function assertBoundStore(config: AppConfig, context: AuthContext): string {
    const bound = config.SNB.boundStoreCode
    if (!bound || !isSnbConfigured(config)) {
      throw new ApiProblem(503, 'FOOD_AUTO_NOT_CONFIGURED', '自动登记未配置（缺少 SNB 上游凭据）。')
    }
    if (context.storeCode !== bound) {
      throw new ApiProblem(403, 'FOOD_AUTO_STORE_MISMATCH', '自动登记仅对绑定门店开放。')
    }
    return bound
  }

  // ⚠️ 临时探针（2026-09-18 验证 CF 出口连通性，验证后立即移除）：
  // 检查 Worker 出口能否到达 api.decathlon.net（RDS）与 api-cn.decathlon.com.cn（收货单）。
  app.get('/api/v1/food-auto/__probe', async (c) => {
    const config = c.get('config')
    const out: Record<string, unknown> = { at: new Date().toISOString() }
    try {
      const token = await getSnbToken(config)
      out.snbToken = token.length
    } catch (error) {
      out.snbLoginError = String((error as Error).message).slice(0, 160)
    }
    try {
      const response = await fetch('https://api.decathlon.net/rds/v1/epc/expiryList', {
        method: 'POST',
        headers: {
          'user-agent': 'Mozilla/5.0 (Linux; Android 16)',
          authorization: `Bearer ${await getSnbToken(config)}`,
          'x-api-key': config.SNB.rdsApiKey!,
          'content-type': 'application/json'
        },
        body: JSON.stringify({ epcs: ['30395DFA8332E48000ECE0C7'] }),
        signal: AbortSignal.timeout(20_000)
      })
      const text = await response.text()
      out.rdsStatus = response.status
      out.rdsBytes = text.length
      out.rdsSample = text.slice(0, 160)
    } catch (error) {
      out.rdsError = String((error as Error).message).slice(0, 200)
    }
    try {
      const receptions = await fetchPendingReceptions(config)
      out.receptions = receptions.length
    } catch (error) {
      out.receptionError = String((error as Error).message).slice(0, 200)
    }
    return c.json(out)
  })

  app.get('/api/v1/food-auto/status', ...read, async (c) => {
    const config = c.get('config')
    const context = c.get('auth')!
    return c.json({
      configured: isSnbConfigured(config),
      boundStoreCode: config.SNB.boundStoreCode ?? null,
      storeAllowed: Boolean(config.SNB.boundStoreCode) && context.storeCode === config.SNB.boundStoreCode,
      windowHours: SCAN_WINDOW_HOURS,
      segmentSize: SEGMENT_SIZE
    })
  })

  // 待收货单列表（当前门店）。
  app.post('/api/v1/food-auto/receptions', ...read, async (c) => {
    const config = c.get('config')
    assertBoundStore(config, c.get('auth')!)
    const receptions = await upstream(() => fetchPendingReceptions(config))
    return c.json({ receptions })
  })

  // 回查今日已确认收货单（待收货列表为空时的 fallback）。
  // 逐商品扫收货流水找 receipt → reference 提取 reception_id。
  app.post('/api/v1/food-auto/discover', ...read, async (c) => {
    const config = c.get('config')
    assertBoundStore(config, c.get('auth')!)
    const body = (await c.req.json().catch(() => ({}))) as { items?: unknown }
    const requested = normalizeItems(body.items)
    const items = requested.length ? requested.map((row) => row.item) : Object.keys(FOOD_SHELF_LIFE_BY_ITEM)
    const result = await upstream(() => discoverTodayReceptions(config, { items }))
    return c.json(result)
  })

  // 一个收货单的食品明细（分页拉取包裹 details）。
  app.post('/api/v1/food-auto/reception-items', ...read, async (c) => {
    const config = c.get('config')
    assertBoundStore(config, c.get('auth')!)
    const body = (await c.req.json().catch(() => ({}))) as { receptionId?: unknown; offset?: unknown; limit?: unknown }
    const receptionId = typeof body.receptionId === 'string' ? body.receptionId.trim() : ''
    if (!receptionId) throw new ApiProblem(400, 'FOOD_AUTO_RECEPTION_ID_REQUIRED', '缺少收货单号。')
    const offset = Number.isInteger(body.offset) && (body.offset as number) >= 0 ? (body.offset as number) : 0
    const limit = Number.isInteger(body.limit) && (body.limit as number) > 0 ? Math.min(body.limit as number, 40) : 40
    const result = await upstream(() => fetchReceptionItems(config, receptionId, offset, limit))
    return c.json(result)
  })

  // 扫描计划：到货商品 → 分片列表（服务端用区段表生成，客户端只做调度）。
  app.post('/api/v1/food-auto/plan', ...read, async (c) => {
    const config = c.get('config')
    assertBoundStore(config, c.get('auth')!)
    const body = (await c.req.json().catch(() => ({}))) as { items?: unknown }
    const items = normalizeItems(body.items)
    if (!items.length) throw new ApiProblem(400, 'FOOD_AUTO_ITEMS_REQUIRED', '缺少到货商品清单。')
    return c.json(buildScanPlan(items))
  })

  // 扫描一个分片：Worker 侧拉 RDS 并过滤，只回传窗口内记录。
  app.post('/api/v1/food-auto/scan', ...read, async (c) => {
    const config = c.get('config')
    assertBoundStore(config, c.get('auth')!)
    const body = (await c.req.json().catch(() => ({}))) as { item?: unknown; from?: unknown; count?: unknown }
    const item = typeof body.item === 'string' ? body.item.trim() : ''
    const zone = FOOD_SCAN_ZONES[item]
    if (!zone) throw new ApiProblem(400, 'FOOD_AUTO_ITEM_NOT_COVERED', `商品 ${item || '?'} 不在扫描区段表内。`)
    const from = Number.isInteger(body.from) && (body.from as number) >= 0 ? (body.from as number) : NaN
    if (!Number.isFinite(from)) throw new ApiProblem(400, 'FOOD_AUTO_FROM_INVALID', '分片起点无效。')
    const rawCount = Number.isInteger(body.count) && (body.count as number) > 0 ? (body.count as number) : SEGMENT_SIZE
    const count = Math.min(rawCount, SEGMENT_SIZE)
    const pairParts = zone.pair.split('|')
    const comp = pairParts[0] ?? ''
    const ir = pairParts[1] ?? ''
    if (!comp || !ir) throw new ApiProblem(500, 'FOOD_AUTO_ZONE_INVALID', `商品 ${item} 的区段数据异常。`)
    const result = await upstream(() => scanSegment(config, { item, comp, ir, from, count }))
    return c.json(result)
  })

  // 批次判定：前端把扫描结果压成「每商品批次摘要」后提交（紧凑载荷）；
  // 也接受原始 records（测试 / 调试），两条路径同一算法。
  app.post('/api/v1/food-auto/judge', ...read, async (c) => {
    const config = c.get('config')
    assertBoundStore(config, c.get('auth')!)
    const body = (await c.req.json().catch(() => ({}))) as { items?: unknown; records?: unknown; aggregates?: unknown }
    const items = normalizeItems(body.items)
    if (!items.length) throw new ApiProblem(400, 'FOOD_AUTO_ITEMS_REQUIRED', '缺少到货商品清单。')
    const aggregates = sanitizeAggregates(body.aggregates)
    if (Object.keys(aggregates).length) {
      return c.json({ judgements: judgeAggregates(items, aggregates) })
    }
    const records = normalizeRecords(body.records)
    return c.json({ judgements: judgeBatches({ items, records }) })
  })

  // 影子表落库（写权限 + CSRF）。
  app.post('/api/v1/food-auto/save', ...write, async (c) => {
    const config = c.get('config')
    const context = c.get('auth')!
    assertBoundStore(config, context)
    const body = (await c.req.json().catch(() => ({}))) as { receptions?: unknown; judgements?: unknown; stats?: unknown; startedAt?: unknown }
    const items = normalizeItems(
      Array.isArray(body.judgements) ? (body.judgements as Record<string, unknown>[]).map((row) => ({ item: row.item, name: row.name, qty: row.qty })) : null
    )
    if (!items.length) throw new ApiProblem(400, 'FOOD_AUTO_RESULTS_REQUIRED', '缺少登记结果。')
    const judgements = (body.judgements as Record<string, unknown>[]).map((row) => ({
      item: String(row.item ?? ''),
      name: String(row.name ?? ''),
      qty: Number(row.qty ?? 0),
      confidence: (['high', 'medium', 'low', 'none'] as const).includes(row.confidence as never) ? (row.confidence as 'high' | 'medium' | 'low' | 'none') : 'none',
      candidates: Array.isArray(row.candidates) ? (row.candidates as unknown[]) : [],
      productionDate: typeof row.productionDate === 'string' ? row.productionDate : null,
      expiryDate: typeof row.expiryDate === 'string' ? row.expiryDate : null,
      warnOn: typeof row.warnOn === 'string' ? row.warnOn : null,
      shelfLifeMonths: typeof row.shelfLifeMonths === 'number' ? row.shelfLifeMonths : null,
      note: typeof row.note === 'string' ? row.note : ''
    }))
    const receptions = (Array.isArray(body.receptions) ? body.receptions : []).map((row) => ({
      receptionId: String((row as Record<string, unknown>).receptionId ?? ''),
      state: String((row as Record<string, unknown>).state ?? ''),
      expectedAt: typeof (row as Record<string, unknown>).expectedAt === 'string' ? ((row as Record<string, unknown>).expectedAt as string) : null,
      shipmentAt: typeof (row as Record<string, unknown>).shipmentAt === 'string' ? ((row as Record<string, unknown>).shipmentAt as string) : null,
      packageCount: Number((row as Record<string, unknown>).packageCount ?? 0),
      itemCount: Number((row as Record<string, unknown>).itemCount ?? 0),
      totalQuantities: Number((row as Record<string, unknown>).totalQuantities ?? 0)
    }))
    const result = await saveShadowRun(c.env.DB as never, {
      storeId: context.storeId,
      createdBy: context.userId,
      input: {
        receptions,
        judgements: judgements as never,
        stats: body.stats && typeof body.stats === 'object' ? (body.stats as Record<string, unknown>) : {}
      },
      startedAt: typeof body.startedAt === 'string' ? body.startedAt : new Date().toISOString()
    })
    return c.json(result)
  })

  app.get('/api/v1/food-auto/runs', ...read, async (c) => {
    const config = c.get('config')
    const context = c.get('auth')!
    assertBoundStore(config, context)
    const runs = await listShadowRuns(c.env.DB as never, context.storeId, 10)
    return c.json({ runs })
  })

  app.get('/api/v1/food-auto/runs/:runId', ...read, async (c) => {
    const config = c.get('config')
    const context = c.get('auth')!
    assertBoundStore(config, context)
    const rows = await listShadowRows(c.env.DB as never, c.req.param('runId'))
    return c.json({ rows })
  })

  return app
}

function normalizeItems(input: unknown): PlanItem[] {
  if (!Array.isArray(input)) return []
  return input
    .map((row) => {
      const record = row && typeof row === 'object' ? (row as Record<string, unknown>) : {}
      return {
        item: String(record.item ?? '').trim(),
        name: String(record.name ?? '').trim(),
        qty: Number(record.qty ?? 0)
      }
    })
    .filter((row) => /^\d{6,9}$/u.test(row.item))
}

function normalizeRecords(input: unknown): Record<string, RawRecord[]> {
  if (!input || typeof input !== 'object') return {}
  const out: Record<string, RawRecord[]> = {}
  for (const [item, rows] of Object.entries(input as Record<string, unknown>)) {
    if (!Array.isArray(rows)) continue
    const list: RawRecord[] = []
    for (const row of rows.slice(0, 200_000)) {
      const record = row && typeof row === 'object' ? (row as Record<string, unknown>) : {}
      if (typeof record.epc !== 'string') continue
      list.push({
        epc: record.epc,
        exp: typeof record.exp === 'string' ? record.exp : null,
        obs: typeof record.obs === 'string' ? record.obs : null,
        upd: String(record.upd ?? '')
      })
    }
    out[item] = list
  }
  return out
}
