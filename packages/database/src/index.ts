import postgres, { type Sql } from 'postgres'

export type Database = Sql<Record<string, postgres.PostgresType>>

export function createDatabase(url: string, options: { max?: number; prepare?: boolean } = {}): Database {
  return postgres(url, {
    max: options.max ?? 10,
    idle_timeout: 20,
    connect_timeout: 15,
    prepare: options.prepare ?? false,
    transform: postgres.camel
  })
}

export async function closeDatabase(sql: Database): Promise<void> {
  await sql.end({ timeout: 5 })
}
