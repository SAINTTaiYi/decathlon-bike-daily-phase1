import postgres, { type Sql } from 'postgres'

export type Database = Sql<Record<string, postgres.PostgresType>>

export function createDatabase(url: string, options: {
  max?: number
  prepare?: boolean
  idleTimeoutSeconds?: number
  connectTimeoutSeconds?: number
} = {}): Database {
  return postgres(url, {
    max: options.max ?? 10,
    idle_timeout: options.idleTimeoutSeconds ?? 20,
    connect_timeout: options.connectTimeoutSeconds ?? 15,
    prepare: options.prepare ?? false,
    transform: postgres.camel
  })
}

export async function closeDatabase(sql: Database): Promise<void> {
  await sql.end({ timeout: 5 })
}
