import { afterEach, describe, it } from 'node:test'
import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'
import { DatabaseSync } from 'node:sqlite'

import * as assert from 'remix/assert'
import { createMigrationRunner } from 'remix/data-table/migrations'
import { loadMigrations } from 'remix/data-table/migrations/node'
import { createSqliteDatabaseAdapter } from 'remix/data-table/sqlite'

import { BUSY_TIMEOUT_MS, DATABASE_FILENAME, openDatabase, type AppDatabase } from '../app/data/index.ts'
import { loadConfig } from '../app/modules/config/index.ts'

const FIRST_PLAYBACK_UP = `CREATE TABLE listening_sessions (
  member_id TEXT PRIMARY KEY REFERENCES members (id) ON DELETE CASCADE,
  current_track_id TEXT REFERENCES tracks (id) ON DELETE SET NULL,
  playhead_ms INTEGER NOT NULL DEFAULT 0,
  playing INTEGER NOT NULL DEFAULT 0 CHECK (playing IN (0, 1)),
  shuffle INTEGER NOT NULL DEFAULT 0 CHECK (shuffle IN (0, 1)),
  repeat_mode TEXT NOT NULL DEFAULT 'off' CHECK (repeat_mode IN ('off', 'all', 'one')),
  updated_at TEXT NOT NULL
);

CREATE TABLE play_queue_items (
  member_id TEXT NOT NULL REFERENCES members (id) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  track_id TEXT NOT NULL REFERENCES tracks (id) ON DELETE CASCADE,
  PRIMARY KEY (member_id, position)
);
`

const migrationsDir = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  'app',
  'data',
  'migrations',
)

describe('openDatabase', () => {
  let tempRoot: string | undefined
  let database: AppDatabase | undefined

  afterEach(async () => {
    database?.close()
    database = undefined
    if (tempRoot) {
      await fs.rm(tempRoot, { recursive: true, force: true })
      tempRoot = undefined
    }
  })

  async function freshConfig() {
    tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'spinbox-data-'))
    let libraryRoot = path.join(tempRoot, 'library')
    let dataDir = path.join(tempRoot, 'app-data')
    await fs.mkdir(libraryRoot, { recursive: true })
    return loadConfig({
      NODE_ENV: 'production',
      LIBRARY_ROOT: libraryRoot,
      SPINBOX_DATA_DIR: dataDir,
      SPINBOX_PUBLIC_URL: 'https://spinbox.example.ts.net',
      PORT: '44100',
      SESSION_SECRET: 'test-session-secret-at-least-16',
    })
  }

  it('creates one SQLite database under SPINBOX_DATA_DIR and applies migrations on a fresh data dir', async () => {
    let config = await freshConfig()
    database = await openDatabase(config)

    assert.equal(database.path, path.join(config.dataDir, 'spinbox.sqlite'))
    await fs.access(database.path)

    let libraryRelative = path.relative(config.libraryRoot, database.path)
    assert.ok(
      libraryRelative.startsWith('..') || path.isAbsolute(libraryRelative),
      'database must not live under the Library',
    )

    let applied = database.sqlite
      .prepare('SELECT id, name FROM data_table_migrations ORDER BY id')
      .all() as { id: string; name: string }[]
    assert.ok(applied.length >= 1)
    assert.ok(applied.some((row) => row.name === 'bootstrap'))
    assert.ok(applied.some((row) => row.name === 'household_members'))
    assert.ok(applied.some((row) => row.name === 'invites'))
    assert.ok(applied.some((row) => row.name === 'member_lifecycle'))
    assert.ok(applied.some((row) => row.name === 'library_index'))
    assert.ok(applied.some((row) => row.name === 'playback'))
    assert.ok(applied.some((row) => row.name === 'listen_resume'))
    assert.ok(applied.some((row) => row.name === 'playlists'))

    let second = await openDatabase(config)
    try {
      let appliedAgain = second.sqlite
        .prepare('SELECT id FROM data_table_migrations ORDER BY id')
        .all() as { id: string }[]
      assert.deepEqual(
        appliedAgain.map((row) => row.id),
        applied.map((row) => row.id),
      )
    } finally {
      second.close()
    }
  })

  it('sets WAL and a short busy_timeout', async () => {
    let config = await freshConfig()
    database = await openDatabase(config)

    let journal = database.sqlite.prepare('PRAGMA journal_mode').get() as {
      journal_mode: string
    }
    assert.equal(journal.journal_mode, 'wal')

    let busy = database.sqlite.prepare('PRAGMA busy_timeout').get() as {
      timeout: number
    }
    assert.equal(busy.timeout, 5000)
  })

  it('applies Listen resume tables to a database that already ran the first playback migration', async () => {
    let config = await freshConfig()
    await seedFirstPlaybackDatabase(config.dataDir)

    database = await openDatabase(config)

    let tables = (
      database.sqlite
        .prepare(
          `SELECT name FROM sqlite_master
           WHERE type = 'table'
             AND name IN ('listen_resume', 'listen_resume_target', 'recently_played')
           ORDER BY name`,
        )
        .all() as { name: string }[]
    ).map((row) => row.name)
    assert.deepEqual(tables, ['listen_resume', 'listen_resume_target', 'recently_played'])
  })
})

async function seedFirstPlaybackDatabase(dataDir: string) {
  await fs.mkdir(dataDir, { recursive: true })
  let sqlite = new DatabaseSync(path.join(dataDir, DATABASE_FILENAME), { timeout: BUSY_TIMEOUT_MS })
  sqlite.exec('PRAGMA journal_mode = WAL')
  sqlite.exec(`PRAGMA busy_timeout = ${BUSY_TIMEOUT_MS}`)
  let adapter = createSqliteDatabaseAdapter(sqlite)
  let migrations = (await loadMigrations(migrationsDir)).flatMap((migration) => {
    if (migration.name === 'listen_resume') {
      return []
    }
    if (migration.name === 'playback') {
      return [{ ...migration, up: FIRST_PLAYBACK_UP }]
    }
    return [migration]
  })
  let runner = createMigrationRunner(adapter, migrations)
  await runner.up()
  sqlite.close()
}
