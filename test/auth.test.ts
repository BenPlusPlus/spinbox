import { afterEach, describe, it } from 'node:test'
import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'

import * as assert from 'remix/assert'

import { openDatabase, type AppDatabase } from '../app/data/index.ts'
import {
  AuthError,
  authenticateMember,
  createFirstAdmin,
  findMemberById,
  householdHasMembers,
} from '../app/modules/auth/index.ts'
import { loadConfig } from '../app/modules/config/index.ts'

describe('auth module', () => {
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

  async function freshDatabase() {
    tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'spinbox-auth-'))
    let libraryRoot = path.join(tempRoot, 'library')
    let dataDir = path.join(tempRoot, 'app-data')
    await fs.mkdir(libraryRoot, { recursive: true })
    let config = loadConfig({
      NODE_ENV: 'production',
      LIBRARY_ROOT: libraryRoot,
      SPINBOX_DATA_DIR: dataDir,
      SPINBOX_PUBLIC_URL: 'https://spinbox.example.ts.net',
      PORT: '44100',
      SESSION_SECRET: 'test-session-secret-at-least-16',
    })
    database = await openDatabase(config)
    return database
  }

  it('reports an empty household has no members', async () => {
    let db = await freshDatabase()
    assert.equal(await householdHasMembers(db), false)
  })

  it('creates the first Admin and makes them retrievable', async () => {
    let db = await freshDatabase()

    let created = await createFirstAdmin(db, {
      email: 'Ada@Example.com',
      password: 'correct-horse',
      displayName: 'Ada',
    })

    assert.equal(created.email, 'ada@example.com')
    assert.equal(created.displayName, 'Ada')
    assert.equal(created.role, 'admin')
    assert.equal(created.disabledAt, null)
    assert.equal(await householdHasMembers(db), true)

    let found = await findMemberById(db, created.id)
    assert.ok(found)
    assert.equal(found.email, 'ada@example.com')
    assert.equal(found.role, 'admin')
    assert.equal(found.displayName, 'Ada')
  })

  it('rejects a second first-Admin setup once any Household member exists', async () => {
    let db = await freshDatabase()
    await createFirstAdmin(db, {
      email: 'ada@example.com',
      password: 'correct-horse',
    })

    await assert.rejects(
      () =>
        createFirstAdmin(db, {
          email: 'other@example.com',
          password: 'correct-horse',
        }),
      (error: unknown) => {
        assert.ok(error instanceof AuthError)
        assert.equal(error.code, 'setup_unavailable')
        return true
      },
    )
  })

  it('authenticates a Household member with email and password', async () => {
    let db = await freshDatabase()
    await createFirstAdmin(db, {
      email: 'ada@example.com',
      password: 'correct-horse',
      displayName: 'Ada',
    })

    let matched = await authenticateMember(db, {
      email: 'ADA@example.com',
      password: 'correct-horse',
    })
    assert.ok(matched)
    assert.equal(matched.email, 'ada@example.com')
    assert.equal(matched.role, 'admin')

    assert.equal(
      await authenticateMember(db, {
        email: 'ada@example.com',
        password: 'wrong-password',
      }),
      null,
    )
    assert.equal(
      await authenticateMember(db, {
        email: 'missing@example.com',
        password: 'correct-horse',
      }),
      null,
    )
  })

  it('rejects an invalid email and a short password', async () => {
    let db = await freshDatabase()

    await assert.rejects(
      () =>
        createFirstAdmin(db, {
          email: 'not-an-email',
          password: 'correct-horse',
        }),
      (error: unknown) => {
        assert.ok(error instanceof AuthError)
        assert.equal(error.code, 'invalid_email')
        return true
      },
    )

    await assert.rejects(
      () =>
        createFirstAdmin(db, {
          email: 'ada@example.com',
          password: 'short',
        }),
      (error: unknown) => {
        assert.ok(error instanceof AuthError)
        assert.equal(error.code, 'invalid_password')
        return true
      },
    )
  })
})
