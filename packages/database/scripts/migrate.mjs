import { createHash } from 'node:crypto'
import { readdir, readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import postgres from 'postgres'

const databaseUrl = process.env.DIRECT_DATABASE_URL?.trim()
if (!databaseUrl) throw new Error('MISSING_SECRET · DIRECT_DATABASE_URL')

const migrationsDirectory = resolve(process.cwd(), '../../supabase/migrations')
const files = (await readdir(migrationsDirectory)).filter((name) => name.endsWith('.sql')).sort()
if (!files.length) throw new Error('NO_MIGRATIONS_FOUND')

const sql = postgres(databaseUrl, { max: 1, prepare: false, connect_timeout: 20, idle_timeout: 5 })
const lockId = 1847132502

try {
  await sql`select pg_advisory_lock(${lockId})`
  await sql`
    create table if not exists public.bike_ops_schema_migrations (
      version varchar(200) primary key,
      sha256 char(64) not null,
      applied_at timestamptz not null default now()
    )
  `

  for (const file of files) {
    const contents = await readFile(resolve(migrationsDirectory, file), 'utf8')
    const digest = createHash('sha256').update(contents).digest('hex')
    const [existing] = await sql`select sha256 from public.bike_ops_schema_migrations where version = ${file}`
    if (existing) {
      if (existing.sha256 !== digest) throw new Error(`MIGRATION_CHECKSUM_MISMATCH · ${file}`)
      console.log(`MIGRATION SKIP · ${file}`)
      continue
    }
    const body = contents.replace(/^\s*begin;\s*/iu, '').replace(/\s*commit;\s*$/iu, '')
    await sql.begin(async (tx) => {
      await tx.unsafe(body)
      await tx`insert into public.bike_ops_schema_migrations (version, sha256) values (${file}, ${digest})`
    })
    console.log(`MIGRATION APPLIED · ${file}`)
  }
} finally {
  await sql`select pg_advisory_unlock(${lockId})`.catch(() => {})
  await sql.end({ timeout: 5 })
}
