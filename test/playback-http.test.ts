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

describe('Listening session HTTP', () => {
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
    tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'spinbox-playback-http-'))
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
      app: createApp({ config, database }),
    }
  }

  it('lets a signed-in member play a fixture Track via the media URL and session actions', async () => {
    let { app, database: db, config } = await freshApp({ LIBRARY_ROOT: FIXTURE_LIBRARY })
    let cookie = await signInAdmin(app)
    await scanNow(app, cookie)
    let track = findTrackByPath(db, 'Radiohead/OK Computer/01 - Airbag.mp3')
    assert.ok(track)

    let played = await postForm(
      app,
      'http://evil.example' + routes.session.href(),
      { intent: 'play', trackId: track.id },
      cookie,
    )
    assert.equal(played.status, 302)
    assert.equal(played.headers.get('Location'), originUrl(config, routes.home.href()))
    cookie = sessionCookie(played) || cookie

    let home = await app.fetch(
      new Request('http://evil.example' + routes.home.href(), { headers: { Cookie: cookie } }),
    )
    assert.equal(home.status, 200)
    let html = await home.text()
    let mediaHref = routes.mediaTrack.href({ trackId: track.id })
    assert.match(html, /<audio/)
    assert.match(html, new RegExp(escapeRegExp(mediaHref)))
    assert.match(html, /Now playing · Airbag/)
    assert.doesNotMatch(html, /other device/i)

    let media = await app.fetch(
      new Request('http://evil.example' + mediaHref, { headers: { Cookie: cookie } }),
    )
    assert.equal(media.status, 200)
    assert.equal(media.headers.get('Content-Type'), 'audio/mpeg')
  })

  it('replaces the Play queue from a container tap and from a lone Track', async () => {
    let { app, database: db } = await freshApp({ LIBRARY_ROOT: FIXTURE_LIBRARY })
    let cookie = await signInAdmin(app)
    await scanNow(app, cookie)
    let flesh = findTrackByPath(db, 'Pink Floyd/The Wall/Disc 1/01 - In the Flesh.flac')
    let heyYou = findTrackByPath(db, 'Pink Floyd/The Wall/Disc 2/01 - Hey You.flac')
    let airbag = findTrackByPath(db, 'Radiohead/OK Computer/01 - Airbag.mp3')
    assert.ok(flesh && heyYou && airbag)

    cookie =
      sessionCookie(
        await postForm(
          app,
          'http://evil.example' + routes.session.href(),
          {
            intent: 'play',
            trackId: [flesh.id, heyYou.id],
            startAt: '1',
          },
          cookie,
        ),
      ) || cookie

    let fromTap = await app.fetch(
      new Request('http://evil.example' + routes.home.href(), { headers: { Cookie: cookie } }),
    )
    let fromTapHtml = await fromTap.text()
    assert.match(fromTapHtml, /Now playing · Hey You/)
    assert.doesNotMatch(fromTapHtml, /Now playing · In the Flesh/)
    let member = await authenticateMember(db, {
      email: 'ada@example.com',
      password: 'correct-horse',
    })
    assert.ok(member)
    assert.equal(getListeningSession(db, member).currentTrack?.title, 'Hey You')
    assert.deepEqual(getListeningSession(db, member).queue, [])

    cookie =
      sessionCookie(
        await postForm(
          app,
          'http://evil.example' + routes.session.href(),
          { intent: 'play', trackId: airbag.id },
          cookie,
        ),
      ) || cookie
    let lone = await app.fetch(
      new Request('http://evil.example' + routes.home.href(), { headers: { Cookie: cookie } }),
    )
    let loneHtml = await lone.text()
    assert.match(loneHtml, /Now playing · Airbag/)
    assert.doesNotMatch(loneHtml, /Now playing · Hey You/)
  })

  it('exposes Play next and Add to queue mutations', async () => {
    let { app, database: db } = await freshApp({ LIBRARY_ROOT: FIXTURE_LIBRARY })
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
          { intent: 'play', trackId: airbag.id },
          cookie,
        ),
      ) || cookie
    cookie =
      sessionCookie(
        await postForm(
          app,
          'http://evil.example' + routes.session.href(),
          { intent: 'play-next', trackId: heyYou.id },
          cookie,
        ),
      ) || cookie
    cookie =
      sessionCookie(
        await postForm(
          app,
          'http://evil.example' + routes.session.href(),
          { intent: 'add-to-queue', trackId: guest.id },
          cookie,
        ),
      ) || cookie

    let home = await app.fetch(
      new Request('http://evil.example' + routes.home.href(), { headers: { Cookie: cookie } }),
    )
    let html = await home.text()
    assert.match(html, /Now playing · Airbag/)
    let member = await authenticateMember(db, {
      email: 'ada@example.com',
      password: 'correct-horse',
    })
    assert.ok(member)
    assert.deepEqual(
      getListeningSession(db, member).queue.map((track) => track.title),
      ['Hey You', 'Guest Hit'],
    )
  })

  it('shares one Listening session across devices with last-write-wins', async () => {
    let { app, database: db } = await freshApp({ LIBRARY_ROOT: FIXTURE_LIBRARY })
    let firstCookie = await signInAdmin(app)
    await scanNow(app, firstCookie)
    let secondCookie = await signInExisting(app, 'ada@example.com', 'correct-horse')
    let airbag = findTrackByPath(db, 'Radiohead/OK Computer/01 - Airbag.mp3')
    let heyYou = findTrackByPath(db, 'Pink Floyd/The Wall/Disc 2/01 - Hey You.flac')
    assert.ok(airbag && heyYou)

    await postForm(
      app,
      'http://evil.example' + routes.session.href(),
      { intent: 'play', trackId: airbag.id },
      firstCookie,
    )
    await postForm(
      app,
      'http://evil.example' + routes.session.href(),
      { intent: 'play', trackId: heyYou.id },
      secondCookie,
    )

    let firstHome = await app.fetch(
      new Request('http://evil.example' + routes.home.href(), { headers: { Cookie: firstCookie } }),
    )
    let firstHtml = await firstHome.text()
    assert.match(firstHtml, /Now playing · Hey You/)
    assert.match(firstHtml, new RegExp(escapeRegExp(routes.mediaTrack.href({ trackId: heyYou.id }))))
    assert.doesNotMatch(firstHtml, /other device/i)
  })

  it('shows Recently played and Continue from Listen resume', async () => {
    let { app, database: db } = await freshApp({ LIBRARY_ROOT: FIXTURE_LIBRARY })
    let cookie = await signInAdmin(app)
    await scanNow(app, cookie)
    let airbag = findTrackByPath(db, 'Radiohead/OK Computer/01 - Airbag.mp3')
    assert.ok(airbag)

    cookie =
      sessionCookie(
        await postForm(
          app,
          'http://evil.example' + routes.session.href(),
          { intent: 'play', trackId: airbag.id },
          cookie,
        ),
      ) || cookie
    cookie =
      sessionCookie(
        await postForm(
          app,
          'http://evil.example' + routes.session.href(),
          { intent: 'update', playheadMs: '90000', playing: '0' },
          cookie,
        ),
      ) || cookie

    let home = await app.fetch(
      new Request('http://evil.example' + routes.home.href(), { headers: { Cookie: cookie } }),
    )
    let html = await home.text()
    assert.match(html, /Recently played/)
    assert.match(html, /Continue/)
    assert.match(html, /Airbag/)

    cookie =
      sessionCookie(
        await postForm(
          app,
          'http://evil.example' + routes.session.href(),
          { intent: 'continue' },
          cookie,
        ),
      ) || cookie
    let continued = await app.fetch(
      new Request('http://evil.example' + routes.home.href(), { headers: { Cookie: cookie } }),
    )
    assert.match(await continued.text(), /Airbag/)
  })

  it('does not expose Playlist CRUD on the session actions', async () => {
    assert.ok(routes.playlists)
    assert.equal(routes.session.method, 'POST')
    assert.equal(routes.session.href(), '/session')
    assert.doesNotMatch(routes.session.href(), /playlist/i)
  })
})

function originUrl(config: { publicUrl: URL }, href: string): string {
  return new URL(href, config.publicUrl.origin).href
}

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
): Promise<Response> {
  let headers: Record<string, string> = {
    'Content-Type': 'application/x-www-form-urlencoded',
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
  return signInExisting(app, 'ada@example.com', 'correct-horse')
}

async function signInExisting(app: App, email: string, password: string): Promise<string> {
  let login = await postForm(app, 'http://evil.example' + routes.login.action.href(), {
    email,
    password,
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
