/** SQLite connection and versioned migrations under SPINBOX_DATA_DIR — never under the Library. */
import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'
import { DatabaseSync } from 'node:sqlite'

import { createDatabase, type Database } from 'remix/data-table'
import { createMigrationRunner } from 'remix/data-table/migrations'
import { loadMigrations } from 'remix/data-table/migrations/node'
import { createSqliteDatabaseAdapter } from 'remix/data-table/sqlite'

import type { AppConfig } from '../modules/config/index.ts'

export const DATABASE_FILENAME = 'spinbox.sqlite'
export const BUSY_TIMEOUT_MS = 5000

const migrationsDir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'migrations')

export type AppDatabase = {
  path: string
  sqlite: DatabaseSync
  db: Database
  close(): void
}

export function databaseFilePath(dataDir: string): string {
  return path.join(dataDir, DATABASE_FILENAME)
}

export async function openDatabase(config: Pick<AppConfig, 'dataDir'>): Promise<AppDatabase> {
  await fs.mkdir(config.dataDir, { recursive: true })

  let filePath = databaseFilePath(config.dataDir)
  let sqlite = new DatabaseSync(filePath, { timeout: BUSY_TIMEOUT_MS })
  sqlite.exec('PRAGMA journal_mode = WAL')
  sqlite.exec(`PRAGMA busy_timeout = ${BUSY_TIMEOUT_MS}`)

  let adapter = createSqliteDatabaseAdapter(sqlite)
  let db = createDatabase(adapter)
  let migrations = await loadMigrations(migrationsDir)
  let runner = createMigrationRunner(adapter, migrations)
  await runner.up()

  return {
    path: filePath,
    sqlite,
    db,
    close() {
      sqlite.close()
    },
  }
}
