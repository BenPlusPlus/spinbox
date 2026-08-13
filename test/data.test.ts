import { afterEach, describe, it } from 'node:test'
import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'

import * as assert from 'remix/assert'

import { openDatabase, type AppDatabase } from '../app/data/index.ts'
import { loadConfig } from '../app/modules/config/index.ts'

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
})
