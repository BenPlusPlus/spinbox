import { afterEach, describe, it } from 'node:test'
import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'

import * as assert from 'remix/assert'

import { openDatabase, type AppDatabase } from '../app/data/index.ts'
import { loadConfig } from '../app/modules/config/index.ts'
import { findTrackByPath } from '../app/modules/library/index.ts'
import { createApp } from '../app/router.ts'
import { routes } from '../app/routes.ts'

type App = ReturnType<typeof createApp>

const FIXTURE_LIBRARY = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  'fixtures',
  'library',
)

describe('authenticated range streaming', () => {
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

  async function freshApp(overrides: Record<string, string | undefined> = {}) {
    tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'spinbox-media-http-'))
    let libraryRoot = overrides.LIBRARY_ROOT ?? path.join(tempRoot, 'library')
    let dataDir = path.join(tempRoot, 'app-data')
    if (!overrides.LIBRARY_ROOT) {
      await fs.mkdir(libraryRoot, { recursive: true })
    }
    let config = loadConfig({
      NODE_ENV: 'production',
      LIBRARY_ROOT: libraryRoot,
      SPINBOX_DATA_DIR: dataDir,
      SPINBOX_PUBLIC_URL: 'https://spinbox.example.ts.net',
      PORT: '44100',
      SESSION_SECRET: 'test-session-secret-at-least-16',
      ...overrides,
    })
    database = await openDatabase(config)
    return {
      config,
      database,
      libraryRoot,
      app: createApp({ config, database }),
    }
  }

  it('returns 401 when a Track stream is requested without a session', async () => {
    let { app } = await freshApp()

    let response = await app.fetch(
      new Request('http://evil.example' + routes.mediaTrack.href({ trackId: 'missing' })),
    )

    assert.equal(response.status, 401)
  })

  it('serves the Library original with Content-Type from the index', async () => {
    let { app, database: db, libraryRoot } = await freshApp()
    let cookie = await signInAdmin(app)
    let contents = Buffer.from('ID3\x03\x00\x00fake-mp3-body')
    await writeLibraryFile(libraryRoot, 'Radiohead/OK Computer/01 - Airbag.mp3', contents)
    await scanNow(app, cookie)

    let track = findTrackByPath(db, 'Radiohead/OK Computer/01 - Airbag.mp3')
    assert.ok(track)

    let response = await app.fetch(
      new Request('http://evil.example' + routes.mediaTrack.href({ trackId: track.id }), {
        headers: { Cookie: cookie },
      }),
    )

    assert.equal(response.status, 200)
    assert.equal(response.headers.get('Content-Type'), 'audio/mpeg')
    assert.equal(Buffer.compare(Buffer.from(await response.arrayBuffer()), contents), 0)
  })

  it('returns 206 for a byte range and re-checks the session cookie', async () => {
    let { app, database: db, libraryRoot } = await freshApp()
    let cookie = await signInAdmin(app)
    let contents = Buffer.from('0123456789abcdefghij')
    await writeLibraryFile(libraryRoot, 'Radiohead/OK Computer/01 - Airbag.mp3', contents)
    await scanNow(app, cookie)
    let track = findTrackByPath(db, 'Radiohead/OK Computer/01 - Airbag.mp3')
    assert.ok(track)
    let href = routes.mediaTrack.href({ trackId: track.id })

    let unauthenticated = await app.fetch(
      new Request('http://evil.example' + href, {
        headers: { Range: 'bytes=0-3' },
      }),
    )
    assert.equal(unauthenticated.status, 401)

    let ranged = await app.fetch(
      new Request('http://evil.example' + href, {
        headers: { Cookie: cookie, Range: 'bytes=0-3' },
      }),
    )
    assert.equal(ranged.status, 206)
    assert.equal(ranged.headers.get('Content-Type'), 'audio/mpeg')
    assert.equal(ranged.headers.get('Content-Range'), 'bytes 0-3/20')
    assert.equal(Buffer.compare(Buffer.from(await ranged.arrayBuffer()), contents.subarray(0, 4)), 0)
  })

  it('sends private cache headers, a weak size-mtime ETag, and honors If-None-Match and If-Range', async () => {
    let { app, database: db, libraryRoot } = await freshApp()
    let cookie = await signInAdmin(app)
    let contents = Buffer.from('0123456789abcdefghij')
    await writeLibraryFile(libraryRoot, 'Radiohead/OK Computer/01 - Airbag.mp3', contents)
    await scanNow(app, cookie)
    let track = findTrackByPath(db, 'Radiohead/OK Computer/01 - Airbag.mp3')
    assert.ok(track)
    let href = routes.mediaTrack.href({ trackId: track.id })

    let first = await app.fetch(
      new Request('http://evil.example' + href, { headers: { Cookie: cookie } }),
    )
    assert.equal(first.status, 200)
    let cacheControl = first.headers.get('Cache-Control') ?? ''
    assert.match(cacheControl, /private/i)
    assert.match(cacheControl, /no-cache/i)
    assert.doesNotMatch(cacheControl, /public/i)
    let etag = first.headers.get('ETag')
    assert.ok(etag)
    assert.match(etag, /^W\/"\d+-\d+"$/)
    let lastModified = first.headers.get('Last-Modified')
    assert.ok(lastModified)

    let notModified = await app.fetch(
      new Request('http://evil.example' + href, {
        headers: { Cookie: cookie, 'If-None-Match': etag },
      }),
    )
    assert.equal(notModified.status, 304)

    let ranged = await app.fetch(
      new Request('http://evil.example' + href, {
        headers: { Cookie: cookie, Range: 'bytes=0-3', 'If-Range': lastModified },
      }),
    )
    assert.equal(ranged.status, 206)
    assert.equal(Buffer.compare(Buffer.from(await ranged.arrayBuffer()), contents.subarray(0, 4)), 0)

    let staleRange = await app.fetch(
      new Request('http://evil.example' + href, {
        headers: {
          Cookie: cookie,
          Range: 'bytes=0-3',
          'If-Range': 'Wed, 21 Oct 2015 07:28:00 GMT',
        },
      }),
    )
    assert.equal(staleRange.status, 200)
    assert.equal(Buffer.compare(Buffer.from(await staleRange.arrayBuffer()), contents), 0)
  })

  it('maps unknown Track, missing file, and path jail to 404', async () => {
    let { app, database: db, libraryRoot, config } = await freshApp()
    let cookie = await signInAdmin(app)
    await writeLibraryFile(libraryRoot, 'Radiohead/OK Computer/01 - Airbag.mp3', Buffer.from('airbag'))
    await scanNow(app, cookie)

    let unknown = await app.fetch(
      new Request('http://evil.example' + routes.mediaTrack.href({ trackId: 'not-a-track' }), {
        headers: { Cookie: cookie },
      }),
    )
    assert.equal(unknown.status, 404)

    let indexed = findTrackByPath(db, 'Radiohead/OK Computer/01 - Airbag.mp3')
    assert.ok(indexed)
    await fs.rm(path.join(libraryRoot, 'Radiohead', 'OK Computer', '01 - Airbag.mp3'))
    let missing = await app.fetch(
      new Request('http://evil.example' + routes.mediaTrack.href({ trackId: indexed.id }), {
        headers: { Cookie: cookie },
      }),
    )
    assert.equal(missing.status, 404)

    let secret = Buffer.from('SECRET')
    await fs.writeFile(path.join(config.libraryRoot, '..', 'secret.mp3'), secret)
    insertTrack(db, {
      id: 'jailed-track',
      path: '../secret.mp3',
      mime: 'audio/mpeg',
    })
    let jailed = await app.fetch(
      new Request('http://evil.example' + routes.mediaTrack.href({ trackId: 'jailed-track' }), {
        headers: { Cookie: cookie },
      }),
    )
    assert.equal(jailed.status, 404)
    assert.doesNotMatch(await jailed.text(), /SECRET/)
  })

  it('returns 503 when the Library mount is unhealthy and keeps the shell up', async () => {
    let { app, database: db, libraryRoot } = await freshApp()
    let cookie = await signInAdmin(app)
    await writeLibraryFile(libraryRoot, 'Radiohead/OK Computer/01 - Airbag.mp3', Buffer.from('airbag'))
    await scanNow(app, cookie)
    let track = findTrackByPath(db, 'Radiohead/OK Computer/01 - Airbag.mp3')
    assert.ok(track)

    await fs.rm(libraryRoot, { recursive: true, force: true })

    let media = await app.fetch(
      new Request('http://evil.example' + routes.mediaTrack.href({ trackId: track.id }), {
        headers: { Cookie: cookie },
      }),
    )
    assert.equal(media.status, 503)

    let home = await app.fetch(
      new Request('http://evil.example' + routes.home.href(), {
        headers: { Cookie: cookie },
      }),
    )
    assert.equal(home.status, 200)
    let homeHtml = await home.text()
    assert.match(homeHtml, /Library/)
    assert.match(homeHtml, /Library storage is unavailable/)
    assert.match(homeHtml, /OK Computer/)
  })

  it('returns 401 for a dead session on every GET including ranges', async () => {
    let { app, database: db, libraryRoot } = await freshApp()
    let cookie = await signInAdmin(app)
    await writeLibraryFile(libraryRoot, 'Radiohead/OK Computer/01 - Airbag.mp3', Buffer.from('airbag'))
    await scanNow(app, cookie)
    let track = findTrackByPath(db, 'Radiohead/OK Computer/01 - Airbag.mp3')
    assert.ok(track)

    db.sqlite.exec('DELETE FROM credentials')
    db.sqlite.exec('DELETE FROM members')

    let dead = await app.fetch(
      new Request('http://evil.example' + routes.mediaTrack.href({ trackId: track.id }), {
        headers: { Cookie: cookie, Range: 'bytes=0-3' },
      }),
    )
    assert.equal(dead.status, 401)
  })

  it('exposes media URLs as same-origin relative paths only', () => {
    let href = routes.mediaTrack.href({ trackId: 'track-id-1' })
    assert.equal(href, '/media/tracks/track-id-1')
    assert.doesNotMatch(href, /^https?:\/\//)
  })

  it('streams a committed fixture Track for any signed-in Household member', async () => {
    let { app, database: db } = await freshApp({ LIBRARY_ROOT: FIXTURE_LIBRARY })
    let adminCookie = await signInAdmin(app)
    await scanNow(app, adminCookie)
    let memberCookie = await joinMember(app, adminCookie)

    let track = findTrackByPath(db, 'Radiohead/OK Computer/01 - Airbag.mp3')
    assert.ok(track)
    assert.equal(track.mime, 'audio/mpeg')

    let response = await app.fetch(
      new Request('http://evil.example' + routes.mediaTrack.href({ trackId: track.id }), {
        headers: { Cookie: memberCookie },
      }),
    )
    assert.equal(response.status, 200)
    assert.equal(response.headers.get('Content-Type'), 'audio/mpeg')
  })

  it('starts and keeps the shell up when LIBRARY_ROOT is missing', async () => {
    let missingRoot = path.join(os.tmpdir(), `spinbox-missing-library-${Date.now()}`)
    let { app } = await freshApp({ LIBRARY_ROOT: missingRoot })
    let cookie = await signInAdmin(app)

    let home = await app.fetch(
      new Request('http://evil.example' + routes.home.href(), {
        headers: { Cookie: cookie },
      }),
    )
    assert.equal(home.status, 200)
    assert.match(await home.text(), /Library/)
  })
})

function sessionCookie(response: Response): string {
  return response.headers
    .getSetCookie()
    .map((part) => part.split(';')[0] ?? '')
    .filter((part) => part.startsWith('spinbox_session='))
    .join('; ')
}

async function postForm(
  app: App,
  url: string,
  fields: Record<string, string>,
  cookie?: string,
): Promise<Response> {
  let headers: Record<string, string> = {
    'Content-Type': 'application/x-www-form-urlencoded',
  }
  if (cookie) {
    headers.Cookie = cookie
  }
  return app.fetch(
    new Request(url, {
      method: 'POST',
      headers,
      body: new URLSearchParams(fields),
    }),
  )
}

async function completeSetup(app: App): Promise<void> {
  let response = await postForm(app, 'http://evil.example' + routes.setup.action.href(), {
    email: 'ada@example.com',
    password: 'correct-horse',
    displayName: 'Ada',
  })
  assert.equal(response.status, 302)
}

async function signInAdmin(app: App): Promise<string> {
  await completeSetup(app)
  let login = await postForm(app, 'http://evil.example' + routes.login.action.href(), {
    email: 'ada@example.com',
    password: 'correct-horse',
  })
  let cookie = sessionCookie(login)
  assert.ok(cookie)
  return cookie
}

async function joinMember(app: App, cookie: string): Promise<string> {
  let minted = await postForm(app, 'http://evil.example' + routes.invites.action.href(), {}, cookie)
  let listed = await app.fetch(
    new Request('http://evil.example' + routes.invites.index.href(), {
      headers: { Cookie: sessionCookie(minted) || cookie },
    }),
  )
  let token = (await listed.text()).match(/\/join\/([A-Za-z0-9_-]+)/)?.[1]
  assert.ok(token)
  let accepted = await postForm(app, 'http://evil.example' + routes.join.action.href({ token }), {
    email: 'ben@example.com',
    password: 'household-pass',
    displayName: 'Ben',
  })
  let memberCookie = sessionCookie(accepted)
  assert.ok(memberCookie)
  return memberCookie
}

async function scanNow(app: App, cookie: string): Promise<string> {
  let started = await postForm(app, 'http://evil.example' + routes.scanNow.href(), {}, cookie)
  assert.equal(started.status, 302)
  cookie = sessionCookie(started) || cookie

  for (let attempt = 0; attempt < 40; attempt++) {
    let page = await app.fetch(
      new Request('http://evil.example' + routes.settings.index.href(), {
        headers: { Cookie: cookie },
      }),
    )
    if ((await page.text()).includes('Last Scan run: succeeded')) {
      return cookie
    }
    await new Promise((resolve) => setTimeout(resolve, 25))
  }
  throw new Error('Scan run did not succeed')
}

async function writeLibraryFile(
  libraryRoot: string,
  relativePath: string,
  contents: Buffer,
): Promise<void> {
  let absolute = path.join(libraryRoot, ...relativePath.split('/'))
  await fs.mkdir(path.dirname(absolute), { recursive: true })
  await fs.writeFile(absolute, contents)
}

function insertTrack(
  database: AppDatabase,
  input: { id: string; path: string; mime: string },
) {
  database.sqlite
    .prepare(
      `INSERT INTO tracks (
         id, path, title, artist, album, album_artist, disc_number, track_number,
         duration_ms, mime, mtime_ms, size, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      input.id,
      input.path,
      'Secret',
      'Unknown artist',
      'Unknown album',
      'Unknown artist',
      null,
      null,
      null,
      input.mime,
      Date.now(),
      6,
      new Date().toISOString(),
    )
}

