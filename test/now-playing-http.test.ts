import { afterEach, describe, it } from 'node:test'
import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'

import * as assert from 'remix/assert'

import { openDatabase, type AppDatabase } from '../app/data/index.ts'
import { authenticateMember } from '../app/modules/auth/index.ts'
import { loadConfig } from '../app/modules/config/index.ts'
import { findTrackByPath } from '../app/modules/library/index.ts'
import { getListeningSession } from '../app/modules/playback/index.ts'
import { createApp } from '../app/router.ts'
import { routes } from '../app/routes.ts'

type App = ReturnType<typeof createApp>

const FIXTURE_LIBRARY = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  'fixtures',
  'library',
)

describe('Now playing vinyl and mini-dock HTTP', () => {
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

  async function freshApp() {
    tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'spinbox-now-playing-http-'))
    let dataDir = path.join(tempRoot, 'app-data')
    let config = loadConfig({
      NODE_ENV: 'production',
      LIBRARY_ROOT: FIXTURE_LIBRARY,
      SPINBOX_DATA_DIR: dataDir,
      SPINBOX_PUBLIC_URL: 'https://spinbox.example.ts.net',
      PORT: '44100',
      SESSION_SECRET: 'test-session-secret-at-least-16',
    })
    database = await openDatabase(config)
    return { config, database, app: createApp({ config, database }) }
  }

  it('serves full-route Now playing as Classic deck and Phone stack, not a nav tab', async () => {
    let { app, database: db } = await freshApp()
    let cookie = await signInAdmin(app)
    await scanNow(app, cookie)
    let airbag = findTrackByPath(db, 'Radiohead/OK Computer/01 - Airbag.mp3')
    let heyYou = findTrackByPath(db, 'Pink Floyd/The Wall/Disc 2/01 - Hey You.flac')
    assert.ok(airbag && heyYou)

    cookie =
      sessionCookie(
        await postForm(
          app,
          'http://evil.example' + routes.session.href(),
          { intent: 'play', trackId: [airbag.id, heyYou.id] },
          cookie,
        ),
      ) || cookie

    let page = await app.fetch(
      new Request('http://evil.example' + routes.nowPlaying.href(), {
        headers: { Cookie: cookie },
      }),
    )
    assert.equal(page.status, 200)
    let html = await page.text()
    let mediaHref = routes.mediaTrack.href({ trackId: airbag.id })

    assert.match(html, /aria-label="Classic deck"/i)
    assert.match(html, /aria-label="Phone stack"/i)
    assert.match(html, /plinth/i)
    assert.match(html, /tonearm/i)
    assert.match(html, /Up next/)
    assert.match(html, /Hey You/)
    assert.match(html, /Airbag/)
    assert.match(html, /aria-label="Shuffle"/i)
    assert.match(html, /aria-label="Repeat"/i)
    assert.match(html, /<audio/)
    assert.match(html, new RegExp(escapeRegExp(mediaHref)))
    assert.doesNotMatch(html, /album sides/i)
    assert.doesNotMatch(html, /save queue as playlist/i)
    assert.doesNotMatch(html, /aria-label="Mini-dock"/i)
    assert.doesNotMatch(html, /<a href="\/now-playing">Now playing/)
    assert.doesNotMatch(html, /aria-label="Tabs"[\s\S]*?<a[^>]*>Now playing</)
  })

  it('shows an idle Now playing page without a current Track', async () => {
    let { app } = await freshApp()
    let cookie = await signInAdmin(app)

    let page = await app.fetch(
      new Request('http://evil.example' + routes.nowPlaying.href(), {
        headers: { Cookie: cookie },
      }),
    )
    assert.equal(page.status, 200)
    let html = await page.text()
    assert.match(html, /Nothing playing/)
    assert.doesNotMatch(html, /<audio/)
    assert.doesNotMatch(html, /aria-label="Mini-dock"/i)
  })

  it('opens the Play queue sheet from the mini-dock with current, upcoming, reorder, and clear', async () => {
    let { app, database: db } = await freshApp()
    let cookie = await signInAdmin(app)
    await scanNow(app, cookie)
    let airbag = findTrackByPath(db, 'Radiohead/OK Computer/01 - Airbag.mp3')
    let heyYou = findTrackByPath(db, 'Pink Floyd/The Wall/Disc 2/01 - Hey You.flac')
    let guest = findTrackByPath(db, 'Various Artists/Now 1/01 - Guest Hit.m4a')
    assert.ok(airbag && heyYou && guest)

    cookie =
      sessionCookie(
        await postForm(
          app,
          'http://evil.example' + routes.session.href(),
          { intent: 'play', trackId: [airbag.id, heyYou.id, guest.id] },
          cookie,
        ),
      ) || cookie

    let home = await app.fetch(
      new Request('http://evil.example' + routes.home.href(), { headers: { Cookie: cookie } }),
    )
    let html = await home.text()
    assert.match(html, /aria-label="Mini-dock"/i)
    assert.match(html, /aria-label="Play queue"/i)
    assert.match(html, /Now playing · Airbag/)
    assert.match(html, /Hey You/)
    assert.match(html, /Guest Hit/)
    assert.match(html, /Clear upcoming/)
    assert.match(html, /Clear all/)
    assert.match(html, /Move up/)
    assert.match(html, /Move down/)
    assert.match(html, />Remove</)
    assert.match(html, new RegExp(escapeRegExp(routes.nowPlaying.href())))
    assert.doesNotMatch(html, /save queue as playlist/i)
  })

  it('skips next, reorders, removes, and clears through session actions', async () => {
    let { app, database: db } = await freshApp()
    let cookie = await signInAdmin(app)
    await scanNow(app, cookie)
    let airbag = findTrackByPath(db, 'Radiohead/OK Computer/01 - Airbag.mp3')
    let heyYou = findTrackByPath(db, 'Pink Floyd/The Wall/Disc 2/01 - Hey You.flac')
    let guest = findTrackByPath(db, 'Various Artists/Now 1/01 - Guest Hit.m4a')
    assert.ok(airbag && heyYou && guest)
    let member = await authenticateMember(db, {
      email: 'ada@example.com',
      password: 'correct-horse',
    })
    assert.ok(member)

    cookie =
      sessionCookie(
        await postForm(
          app,
          'http://evil.example' + routes.session.href(),
          { intent: 'play', trackId: [airbag.id, heyYou.id, guest.id] },
          cookie,
        ),
      ) || cookie

    cookie =
      sessionCookie(
        await postForm(
          app,
          'http://evil.example' + routes.session.href(),
          { intent: 'skip-next' },
          cookie,
        ),
      ) || cookie
    assert.equal(getListeningSession(db, member).currentTrack?.title, 'Hey You')

    cookie =
      sessionCookie(
        await postForm(
          app,
          'http://evil.example' + routes.session.href(),
          { intent: 'reorder-queue', from: '0', to: '0' },
          cookie,
        ),
      ) || cookie
    cookie =
      sessionCookie(
        await postForm(
          app,
          'http://evil.example' + routes.session.href(),
          { intent: 'remove-from-queue', position: '0' },
          cookie,
        ),
      ) || cookie
    assert.deepEqual(getListeningSession(db, member).queue, [])

    cookie =
      sessionCookie(
        await postForm(
          app,
          'http://evil.example' + routes.session.href(),
          { intent: 'play', trackId: [airbag.id, heyYou.id] },
          cookie,
        ),
      ) || cookie
    cookie =
      sessionCookie(
        await postForm(
          app,
          'http://evil.example' + routes.session.href(),
          { intent: 'clear-upcoming' },
          cookie,
        ),
      ) || cookie
    assert.equal(getListeningSession(db, member).currentTrack?.title, 'Airbag')
    assert.deepEqual(getListeningSession(db, member).queue, [])

    cookie =
      sessionCookie(
        await postForm(
          app,
          'http://evil.example' + routes.session.href(),
          { intent: 'clear-all' },
          cookie,
        ),
      ) || cookie
    assert.equal(getListeningSession(db, member).currentTrack, null)
  })

  it('returns a Listening session snapshot as JSON when requested', async () => {
    let { app, database: db } = await freshApp()
    let cookie = await signInAdmin(app)
    await scanNow(app, cookie)
    let airbag = findTrackByPath(db, 'Radiohead/OK Computer/01 - Airbag.mp3')
    assert.ok(airbag)

    let played = await postForm(
      app,
      'http://evil.example' + routes.session.href(),
      { intent: 'play', trackId: airbag.id },
      cookie,
      { Accept: 'application/json' },
    )
    assert.equal(played.status, 200)
    let body = (await played.json()) as {
      currentTrack: { title: string; id: string } | null
      playing: boolean
      mediaHref: string | null
    }
    assert.equal(body.currentTrack?.title, 'Airbag')
    assert.equal(body.playing, true)
    assert.equal(body.mediaHref, routes.mediaTrack.href({ trackId: airbag.id }))
  })

  it('keeps a stable media URL when the playhead moves so the player is not reloaded', async () => {
    let { app, database: db } = await freshApp()
    let cookie = await signInAdmin(app)
    await scanNow(app, cookie)
    let airbag = findTrackByPath(db, 'Radiohead/OK Computer/01 - Airbag.mp3')
    assert.ok(airbag)
    let mediaHref = routes.mediaTrack.href({ trackId: airbag.id })

    cookie =
      sessionCookie(
        await postForm(
          app,
          'http://evil.example' + routes.session.href(),
          { intent: 'play', trackId: airbag.id },
          cookie,
        ),
      ) || cookie

    let updated = await postForm(
      app,
      'http://evil.example' + routes.session.href(),
      { intent: 'update', playheadMs: '5000', playing: '1' },
      cookie,
      { Accept: 'application/json' },
    )
    assert.equal(updated.status, 200)
    let body = (await updated.json()) as {
      playheadMs: number
      playing: boolean
      mediaHref: string | null
    }
    assert.equal(body.playheadMs, 5000)
    assert.equal(body.playing, true)
    assert.equal(body.mediaHref, mediaHref)
    assert.doesNotMatch(body.mediaHref ?? '', /#/)
  })

  it('offers Play next and Add to queue from Track actions without Add to playlist', async () => {
    let { app } = await freshApp()
    let cookie = await signInAdmin(app)
    await scanNow(app, cookie)

    let tracks = await app.fetch(
      new Request('http://evil.example' + routes.libraryTracks.href(), {
        headers: { Cookie: cookie },
      }),
    )
    let html = await tracks.text()
    assert.match(html, /aria-label="Track actions"/i)
    assert.match(html, /Play next/)
    assert.match(html, /Add to queue/)
    assert.doesNotMatch(html, /Add to playlist/i)
  })
})

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

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
  fields: Record<string, string | string[]>,
  cookie?: string,
  extraHeaders: Record<string, string> = {},
): Promise<Response> {
  let headers: Record<string, string> = {
    'Content-Type': 'application/x-www-form-urlencoded',
    ...extraHeaders,
  }
  if (cookie) {
    headers.Cookie = cookie
  }
  let body = new URLSearchParams()
  for (let [name, value] of Object.entries(fields)) {
    if (Array.isArray(value)) {
      for (let item of value) {
        body.append(name, item)
      }
    } else {
      body.set(name, value)
    }
  }
  return app.fetch(
    new Request(url, {
      method: 'POST',
      headers,
      body,
    }),
  )
}

async function signInAdmin(app: App): Promise<string> {
  let response = await postForm(app, 'http://evil.example' + routes.setup.action.href(), {
    email: 'ada@example.com',
    password: 'correct-horse',
    displayName: 'Ada',
  })
  assert.equal(response.status, 302)
  let login = await postForm(app, 'http://evil.example' + routes.login.action.href(), {
    email: 'ada@example.com',
    password: 'correct-horse',
  })
  let cookie = sessionCookie(login)
  assert.ok(cookie)
  return cookie
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
