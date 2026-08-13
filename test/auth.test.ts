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
  findInviteByToken,
  listInvites,
  mintInvite,
  redeemInvite,
  revokeInvite,
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

  it('lets an Admin mint a single-use Invite that expires after 7 days', async () => {
    let db = await freshDatabase()
    let admin = await createFirstAdmin(db, {
      email: 'ada@example.com',
      password: 'correct-horse',
      displayName: 'Ada',
    })

    let now = new Date('2026-06-01T12:00:00.000Z')
    let minted = await mintInvite(db, admin, { now })

    assert.ok(minted.token.length >= 32)
    assert.equal(minted.email, null)
    assert.equal(minted.status, 'unused')
    assert.equal(minted.expiresAt, '2026-06-08T12:00:00.000Z')
    assert.equal(minted.createdBy, admin.id)
    assert.equal(minted.revokedAt, null)
    assert.equal(minted.acceptedAt, null)
  })

  it('redeems an Invite as a Member who sets their own password', async () => {
    let db = await freshDatabase()
    let admin = await createFirstAdmin(db, {
      email: 'ada@example.com',
      password: 'correct-horse',
    })
    let minted = await mintInvite(db, admin)

    let member = await redeemInvite(db, {
      token: minted.token,
      email: 'Ben@Example.com',
      password: 'household-pass',
      displayName: 'Ben',
    })

    assert.equal(member.email, 'ben@example.com')
    assert.equal(member.displayName, 'Ben')
    assert.equal(member.role, 'member')
    assert.equal(member.disabledAt, null)

    let signedIn = await authenticateMember(db, {
      email: 'ben@example.com',
      password: 'household-pass',
    })
    assert.ok(signedIn)
    assert.equal(signedIn.id, member.id)
    assert.equal(signedIn.role, 'member')
  })

  it('rejects redeeming an Invite that has already been used', async () => {
    let db = await freshDatabase()
    let admin = await createFirstAdmin(db, {
      email: 'ada@example.com',
      password: 'correct-horse',
    })
    let minted = await mintInvite(db, admin)
    await redeemInvite(db, {
      token: minted.token,
      email: 'ben@example.com',
      password: 'household-pass',
    })

    await assert.rejects(
      () =>
        redeemInvite(db, {
          token: minted.token,
          email: 'other@example.com',
          password: 'household-pass',
        }),
      (error: unknown) => {
        assert.ok(error instanceof AuthError)
        assert.equal(error.code, 'invite_unavailable')
        return true
      },
    )
    assert.equal(
      await authenticateMember(db, {
        email: 'other@example.com',
        password: 'household-pass',
      }),
      null,
    )
  })

  it('hard-binds an Invite to an email when one is given, and leaves it open otherwise', async () => {
    let db = await freshDatabase()
    let admin = await createFirstAdmin(db, {
      email: 'ada@example.com',
      password: 'correct-horse',
    })

    let bound = await mintInvite(db, admin, { email: 'Ben@Example.com' })
    assert.equal(bound.email, 'ben@example.com')

    await assert.rejects(
      () =>
        redeemInvite(db, {
          token: bound.token,
          email: 'other@example.com',
          password: 'household-pass',
        }),
      (error: unknown) => {
        assert.ok(error instanceof AuthError)
        assert.equal(error.code, 'invalid_email')
        return true
      },
    )

    let member = await redeemInvite(db, {
      token: bound.token,
      email: 'BEN@example.com',
      password: 'household-pass',
    })
    assert.equal(member.email, 'ben@example.com')

    let open = await mintInvite(db, admin)
    assert.equal(open.email, null)
    let joined = await redeemInvite(db, {
      token: open.token,
      email: 'casey@example.com',
      password: 'household-pass',
    })
    assert.equal(joined.email, 'casey@example.com')
    assert.equal(joined.role, 'member')
  })

  it('lets an Admin revoke an unused Invite so it cannot be redeemed', async () => {
    let db = await freshDatabase()
    let admin = await createFirstAdmin(db, {
      email: 'ada@example.com',
      password: 'correct-horse',
    })
    let minted = await mintInvite(db, admin)

    let revoked = await revokeInvite(db, admin, minted.id)
    assert.equal(revoked.status, 'revoked')
    assert.ok(revoked.revokedAt)

    await assert.rejects(
      () =>
        redeemInvite(db, {
          token: minted.token,
          email: 'ben@example.com',
          password: 'household-pass',
        }),
      (error: unknown) => {
        assert.ok(error instanceof AuthError)
        assert.equal(error.code, 'invite_unavailable')
        return true
      },
    )
  })

  it('rejects redeeming an expired Invite', async () => {
    let db = await freshDatabase()
    let admin = await createFirstAdmin(db, {
      email: 'ada@example.com',
      password: 'correct-horse',
    })
    let now = new Date('2026-06-01T12:00:00.000Z')
    let minted = await mintInvite(db, admin, { now })

    await assert.rejects(
      () =>
        redeemInvite(db, {
          token: minted.token,
          email: 'ben@example.com',
          password: 'household-pass',
          now: new Date('2026-06-08T12:00:00.000Z'),
        }),
      (error: unknown) => {
        assert.ok(error instanceof AuthError)
        assert.equal(error.code, 'invite_unavailable')
        return true
      },
    )
  })

  it('rejects minting or revoking an Invite when the actor is not an Admin', async () => {
    let db = await freshDatabase()
    let admin = await createFirstAdmin(db, {
      email: 'ada@example.com',
      password: 'correct-horse',
    })
    let minted = await mintInvite(db, admin)
    let member = await redeemInvite(db, {
      token: minted.token,
      email: 'ben@example.com',
      password: 'household-pass',
    })

    await assert.rejects(
      () => mintInvite(db, member),
      (error: unknown) => {
        assert.ok(error instanceof AuthError)
        assert.equal(error.code, 'not_admin')
        return true
      },
    )

    let unused = await mintInvite(db, admin)
    await assert.rejects(
      () => revokeInvite(db, member, unused.id),
      (error: unknown) => {
        assert.ok(error instanceof AuthError)
        assert.equal(error.code, 'not_admin')
        return true
      },
    )
  })

  it('lists Invites for an Admin and looks up a redeemable Invite by token', async () => {
    let db = await freshDatabase()
    let admin = await createFirstAdmin(db, {
      email: 'ada@example.com',
      password: 'correct-horse',
    })
    let now = new Date('2026-06-01T12:00:00.000Z')
    let minted = await mintInvite(db, admin, { email: 'ben@example.com', now })

    let listed = await listInvites(db, admin, { now })
    assert.equal(listed.length, 1)
    assert.equal(listed[0]?.id, minted.id)
    assert.equal(listed[0]?.email, 'ben@example.com')
    assert.equal(listed[0]?.status, 'unused')
    assert.equal('token' in listed[0]!, false)

    let found = await findInviteByToken(db, minted.token, { now })
    assert.ok(found)
    assert.equal(found.id, minted.id)
    assert.equal(found.status, 'unused')
    assert.equal(await findInviteByToken(db, 'not-a-real-token', { now }), null)
  })

  it('rejects redeeming an Invite with an email that already belongs to a Household member', async () => {
    let db = await freshDatabase()
    let admin = await createFirstAdmin(db, {
      email: 'ada@example.com',
      password: 'correct-horse',
    })
    let minted = await mintInvite(db, admin)

    await assert.rejects(
      () =>
        redeemInvite(db, {
          token: minted.token,
          email: 'ADA@example.com',
          password: 'household-pass',
        }),
      (error: unknown) => {
        assert.ok(error instanceof AuthError)
        assert.equal(error.code, 'email_taken')
        return true
      },
    )
  })
})
