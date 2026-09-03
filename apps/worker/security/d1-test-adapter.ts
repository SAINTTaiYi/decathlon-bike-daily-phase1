import { DatabaseSync } from 'node:sqlite'
import { readFile } from 'node:fs/promises'

class ReadBarrier {
  private arrived = 0
  private release!: () => void
  private readonly ready = new Promise<void>((resolve) => { this.release = resolve })

  constructor(private readonly participants: number) {}

  async hit(): Promise<void> {
    this.arrived += 1
    if (this.arrived >= this.participants) this.release()
    await this.ready
  }
}

type BarrierRule = { pattern: RegExp; barrier: ReadBarrier }

class ManualGate {
  private signalEntered!: () => void
  private signalRelease!: () => void
  readonly entered = new Promise<void>((resolve) => { this.signalEntered = resolve })
  private readonly released = new Promise<void>((resolve) => { this.signalRelease = resolve })

  async hit(): Promise<void> {
    this.signalEntered()
    await this.released
  }

  release(): void {
    this.signalRelease()
  }
}

type ManualGateRule = { pattern: RegExp; occurrence: number; seen: number; gate: ManualGate }

class TestPreparedStatement {
  private params: unknown[] = []

  constructor(
    private readonly owner: TestD1Database,
    readonly sql: string
  ) {}

  bind(...params: unknown[]): TestPreparedStatement {
    const bound = new TestPreparedStatement(this.owner, this.sql)
    bound.params = params
    return bound
  }

  async first<T = Record<string, unknown>>(column?: string): Promise<T | null> {
    const row = this.owner.sqlite.prepare(this.sql).get(...this.params as any[]) as Record<string, unknown> | undefined
    await this.owner.afterRead(this.sql)
    if (!row) return null
    return (column ? row[column] : row) as T
  }

  async all<T = Record<string, unknown>>(): Promise<{ success: true; results: T[]; meta: Record<string, unknown> }> {
    const results = this.owner.sqlite.prepare(this.sql).all(...this.params as any[]) as T[]
    await this.owner.afterRead(this.sql)
    return { success: true, results, meta: { changes: 0, rows_read: results.length, rows_written: 0 } }
  }

  async run(): Promise<{ success: true; results: []; meta: { changes: number; last_row_id: number } }> {
    const result = this.executeRun()
    await this.owner.afterRun(this.sql)
    return result
  }

  executeRun(): { success: true; results: []; meta: { changes: number; last_row_id: number } } {
    const result = this.owner.sqlite.prepare(this.sql).run(...this.params as any[])
    return {
      success: true,
      results: [],
      meta: {
        changes: Number(result.changes),
        last_row_id: Number(result.lastInsertRowid)
      }
    }
  }
}

export class TestD1Database {
  readonly sqlite = new DatabaseSync(':memory:')
  private barriers: BarrierRule[] = []
  private runBarriers: BarrierRule[] = []
  private readGates: ManualGateRule[] = []

  constructor() {
    this.sqlite.exec('PRAGMA foreign_keys = ON')
  }

  prepare(sql: string): D1PreparedStatement {
    return new TestPreparedStatement(this, sql) as unknown as D1PreparedStatement
  }

  async batch(statements: D1PreparedStatement[]): Promise<D1Result[]> {
    this.sqlite.exec('BEGIN IMMEDIATE')
    try {
      const results = statements.map((statement) => (statement as unknown as TestPreparedStatement).executeRun())
      this.sqlite.exec('COMMIT')
      return results as unknown as D1Result[]
    } catch (error) {
      this.sqlite.exec('ROLLBACK')
      throw error
    }
  }

  barrier(pattern: RegExp, participants: number): void {
    this.barriers.push({ pattern, barrier: new ReadBarrier(participants) })
  }

  runBarrier(pattern: RegExp, participants: number): void {
    this.runBarriers.push({ pattern, barrier: new ReadBarrier(participants) })
  }

  readGate(pattern: RegExp, occurrence = 1): { entered: Promise<void>; release: () => void } {
    const gate = new ManualGate()
    this.readGates.push({ pattern, occurrence, seen: 0, gate })
    return { entered: gate.entered, release: () => gate.release() }
  }

  async afterRead(sql: string): Promise<void> {
    const manual = this.readGates.find((candidate) => {
      if (!candidate.pattern.test(sql)) return false
      candidate.seen += 1
      return candidate.seen === candidate.occurrence
    })
    if (manual) await manual.gate.hit()
    const rule = this.barriers.find((candidate) => candidate.pattern.test(sql))
    if (rule) await rule.barrier.hit()
  }

  async afterRun(sql: string): Promise<void> {
    const rule = this.runBarriers.find((candidate) => candidate.pattern.test(sql))
    if (rule) await rule.barrier.hit()
  }

  query<T = Record<string, unknown>>(sql: string, ...params: unknown[]): T[] {
    return this.sqlite.prepare(sql).all(...params as any[]) as T[]
  }

  one<T = Record<string, unknown>>(sql: string, ...params: unknown[]): T | null {
    return (this.sqlite.prepare(sql).get(...params as any[]) as T | undefined) ?? null
  }

  exec(sql: string): void {
    this.sqlite.exec(sql)
  }

  close(): void {
    this.sqlite.close()
  }
}

export async function migratedTestDatabase(): Promise<TestD1Database> {
  const db = new TestD1Database()
  for (const name of [
    '0001_initial_sqlite.sql',
    '0002_work_item_ticket_numbers.sql',
    '0003_repair_undo_consistency.sql',
    '0004_permanent_audit_history.sql',
    '0005_pickup_used_car_source.sql',
    '0006_store_directory_self_registration.sql',
    '0007_repair_completion_statuses.sql',
    '0008_store_pending_status.sql',
    '0009_directory_subregions.sql',
    '0010_admin_console_query_indexes.sql',
    '0011_directory_guangxi_cities.sql',
    '0012_flat_store_self_registration.sql',
    '0013_optional_handover_phone.sql',
    '0014_handover_assignee.sql',
    '0015_shiphub_sync.sql',
    '0016_shiphub_channel.sql',
    '0017_shiphub_encrypted_flag.sql',
    '0018_shiphub_per_store_identity.sql',
    '0019_shiphub_pick_category.sql',
    '0020_password_reset_challenges.sql',
    '0021_bi_sku_names.sql',
    '0022_audit_feed_store_date_index.sql',
    '0023_bi_bikes_snapshot.sql'
  ]) {
    const sql = await readFile(new URL(`../../../migrations/d1/${name}`, import.meta.url), 'utf8')
    db.exec(sql)
  }
  return db
}
