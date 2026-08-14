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

describe('Playlists HTTP', () => {
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
    tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'spinbox-playlists-http-'))
    let libraryRoot = overrides.LIBRARY_ROOT ?? FIXTURE_LIBRARY
    let dataDir = path.join(tempRoot, 'app-data')
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

  it('lets a member create, list, open, rename, and delete only their own Playlists', async () => {
    let { app, config } = await freshApp()
    let adminCookie = await signInAdmin(app)
    let memberCookie = await joinMember(app, adminCookie)

    adminCookie =
      sessionCookie(
        await postForm(
          app,
          'http://evil.example' + routes.playlists.action.href(),
          { name: 'Ada nights' },
          adminCookie,
        ),
      ) || adminCookie
    memberCookie =
      sessionCookie(
        await postForm(
          app,
          'http://evil.example' + routes.playlists.action.href(),
          { name: 'Ben only' },
          memberCookie,
        ),
      ) || memberCookie

    let adminList = await (
      await app.fetch(
        new Request('http://evil.example' + routes.playlists.index.href(), {
          headers: { Cookie: adminCookie },
        }),
      )
    ).text()
    assert.match(adminList, /<h1[^>]*>Playlists<\/h1>/)
    assert.match(adminList, /Ada nights/)
    assert.doesNotMatch(adminList, /Ben only/)
    assert.doesNotMatch(adminList, /save queue as playlist/i)
    assert.doesNotMatch(adminList, /household-shared/i)

    let playlistHref = hrefIn(adminList, /\/playlists\/[0-9a-f-]+/i)
    assert.ok(playlistHref)

    let detail = await app.fetch(
      new Request('http://evil.example' + playlistHref, { headers: { Cookie: adminCookie } }),
    )
    assert.equal(detail.status, 200)
    let detailHtml = await detail.text()
    assert.match(detailHtml, /<h1[^>]*>Ada nights<\/h1>/)
    assert.match(detailHtml, /This Playlist is empty/)

    adminCookie =
      sessionCookie(
        await postForm(
          app,
          'http://evil.example' + playlistHref,
          { intent: 'rename', name: 'Dawn' },
          adminCookie,
        ),
      ) || adminCookie
    let renamed = await (
      await app.fetch(
        new Request('http://evil.example' + playlistHref, { headers: { Cookie: adminCookie } }),
      )
    ).text()
    assert.match(renamed, /<h1[^>]*>Dawn<\/h1>/)

    let otherView = await app.fetch(
      new Request('http://evil.example' + playlistHref, { headers: { Cookie: memberCookie } }),
    )
    assert.equal(otherView.status, 200)
    assert.match(await otherView.text(), /That Playlist was not found/)

    adminCookie =
      sessionCookie(
        await postForm(
          app,
          'http://evil.example' + playlistHref,
          { intent: 'delete' },
          adminCookie,
        ),
      ) || adminCookie
    let afterDelete = await app.fetch(
      new Request('http://evil.example' + routes.playlists.index.href(), {
        headers: { Cookie: adminCookie },
      }),
    )
    assert.equal(afterDelete.status, 200)
    assert.doesNotMatch(await afterDelete.text(), /Dawn/)
    let missing = await app.fetch(
      new Request('http://evil.example' + playlistHref, { headers: { Cookie: adminCookie } }),
    )
    assert.equal(missing.status, 200)
    assert.match(await missing.text(), /That Playlist was not found/)

    let redirected = await postForm(
      app,
      'http://evil.example' + routes.playlists.action.href(),
      { name: 'Ada nights' },
      adminCookie,
    )
    assert.equal(redirected.status, 302)
    assert.match(redirected.headers.get('Location') ?? '', new RegExp(escapeRegExp(config.publicUrl.origin)))
  })

  it('adds a Track from ⋯, reorders and removes entries, and plays the Playlist into the session', async () => {
    let { app, database: db } = await freshApp()
    let cookie = await signInAdmin(app)
    cookie = await scanNow(app, cookie)
    let airbag = findTrackByPath(db, 'Radiohead/OK Computer/01 - Airbag.mp3')
    let flesh = findTrackByPath(db, 'Pink Floyd/The Wall/Disc 1/01 - In the Flesh.flac')
    let heyYou = findTrackByPath(db, 'Pink Floyd/The Wall/Disc 2/01 - Hey You.flac')
    assert.ok(airbag && flesh && heyYou)
    let member = await authenticateMember(db, {
      email: 'ada@example.com',
      password: 'correct-horse',
    })
    assert.ok(member)

    cookie =
      sessionCookie(
        await postForm(
          app,
          'http://evil.example' + routes.playlists.action.href(),
          { name: 'Wall +' },
          cookie,
        ),
      ) || cookie
    let listHtml = await (
      await app.fetch(
        new Request('http://evil.example' + routes.playlists.index.href(), {
          headers: { Cookie: cookie },
        }),
      )
    ).text()
    let playlistHref = hrefIn(listHtml, /\/playlists\/[0-9a-f-]+/i)
    assert.ok(playlistHref)

    let tracks = await (
      await app.fetch(
        new Request('http://evil.example' + routes.libraryTracks.href(), {
          headers: { Cookie: cookie },
        }),
      )
    ).text()
    assert.match(tracks, /Add to playlist/)
    assert.match(tracks, /Wall \+/)

    cookie =
      sessionCookie(
        await postForm(
          app,
          'http://evil.example' + playlistHref,
          { intent: 'add', trackId: flesh.id },
          cookie,
        ),
      ) || cookie
    cookie =
      sessionCookie(
        await postForm(
          app,
          'http://evil.example' + playlistHref,
          { intent: 'add', trackId: heyYou.id },
          cookie,
        ),
      ) || cookie
    cookie =
      sessionCookie(
        await postForm(
          app,
          'http://evil.example' + playlistHref,
          { intent: 'add', trackId: airbag.id },
          cookie,
        ),
      ) || cookie

    let detail = await (
      await app.fetch(
        new Request('http://evil.example' + playlistHref, { headers: { Cookie: cookie } }),
      )
    ).text()
    assert.match(detail, /In the Flesh/)
    assert.match(detail, /Hey You/)
    assert.match(detail, /Airbag/)
    assert.match(detail, />Play all</)
    assert.ok(detail.indexOf('In the Flesh') < detail.indexOf('Hey You'))
    assert.ok(detail.indexOf('Hey You') < detail.indexOf('Airbag'))

    cookie =
      sessionCookie(
        await postForm(
          app,
          'http://evil.example' + playlistHref,
          { intent: 'reorder', from: '2', to: '0' },
          cookie,
        ),
      ) || cookie
    cookie =
      sessionCookie(
        await postForm(
          app,
          'http://evil.example' + playlistHref,
          { intent: 'remove', position: '1' },
          cookie,
        ),
      ) || cookie

    let reordered = await (
      await app.fetch(
        new Request('http://evil.example' + playlistHref, { headers: { Cookie: cookie } }),
      )
    ).text()
    assert.match(reordered, /Airbag/)
    assert.match(reordered, /Hey You/)
    assert.doesNotMatch(reordered, /In the Flesh/)
    assert.ok(reordered.indexOf('Airbag') < reordered.indexOf('Hey You'))

    cookie =
      sessionCookie(
        await postForm(
          app,
          'http://evil.example' + playlistHref,
          { intent: 'add', trackId: airbag.id },
          cookie,
        ),
      ) || cookie
    let withRepeat = await (
      await app.fetch(
        new Request('http://evil.example' + playlistHref, { headers: { Cookie: cookie } }),
      )
    ).text()
    let playAll = findForm(withRepeat, 'Play all')
    assert.ok(playAll)
    let trackIds = formTrackIds(playAll)
    assert.deepEqual(trackIds, [airbag.id, heyYou.id, airbag.id])
    cookie =
      sessionCookie(
        await postForm(
          app,
          'http://evil.example' + routes.session.href(),
          { intent: 'play', trackId: trackIds },
          cookie,
        ),
      ) || cookie
    let session = getListeningSession(db, member)
    assert.equal(session.currentTrack?.id, airbag.id)
    assert.deepEqual(
      session.queue.map((track) => track.id),
      [heyYou.id, airbag.id],
    )
    assert.equal(session.playing, true)

    let playFrom = findForm(withRepeat, 'Play')
    assert.ok(playFrom)
    let fromIds = formTrackIds(playFrom)
    let startAt = formValue(playFrom, 'startAt') ?? '0'
    cookie =
      sessionCookie(
        await postForm(
          app,
          'http://evil.example' + routes.session.href(),
          { intent: 'play', trackId: fromIds, startAt },
          cookie,
        ),
      ) || cookie
    let fromTrack = getListeningSession(db, member)
    assert.equal(fromTrack.currentTrack?.id, airbag.id)
  })

  it('keeps a Missing track on the Playlist, shows it, and skips it when playing', async () => {
    let { app, database: db } = await freshApp()
    let cookie = await signInAdmin(app)
    cookie = await scanNow(app, cookie)
    let airbag = findTrackByPath(db, 'Radiohead/OK Computer/01 - Airbag.mp3')
    let guest = findTrackByPath(db, 'Various Artists/Now 1/01 - Guest Hit.m4a')
    assert.ok(airbag && guest)
    let member = await authenticateMember(db, {
      email: 'ada@example.com',
      password: 'correct-horse',
    })
    assert.ok(member)

    cookie =
      sessionCookie(
        await postForm(
          app,
          'http://evil.example' + routes.playlists.action.href(),
          { name: 'Mixed' },
          cookie,
        ),
      ) || cookie
    let listHtml = await (
      await app.fetch(
        new Request('http://evil.example' + routes.playlists.index.href(), {
          headers: { Cookie: cookie },
        }),
      )
    ).text()
    let playlistHref = hrefIn(listHtml, /\/playlists\/[0-9a-f-]+/i)
    assert.ok(playlistHref)
    cookie =
      sessionCookie(
        await postForm(
          app,
          'http://evil.example' + playlistHref,
          { intent: 'add', trackId: airbag.id },
          cookie,
        ),
      ) || cookie
    cookie =
      sessionCookie(
        await postForm(
          app,
          'http://evil.example' + playlistHref,
          { intent: 'add', trackId: guest.id },
          cookie,
        ),
      ) || cookie

    db.sqlite.prepare('DELETE FROM tracks WHERE id = ?').run(guest.id)

    let detail = await (
      await app.fetch(
        new Request('http://evil.example' + playlistHref, { headers: { Cookie: cookie } }),
      )
    ).text()
    assert.match(detail, /Airbag/)
    assert.match(detail, /Guest Hit/)
    assert.match(detail, /Missing track/)
    let playAll = findForm(detail, 'Play all')
    assert.ok(playAll)
    assert.deepEqual(formTrackIds(playAll), [airbag.id])

    cookie =
      sessionCookie(
        await postForm(
          app,
          'http://evil.example' + routes.session.href(),
          { intent: 'play', trackId: formTrackIds(playAll) },
          cookie,
        ),
      ) || cookie
    let session = getListeningSession(db, member)
    assert.equal(session.currentTrack?.id, airbag.id)
    assert.deepEqual(session.queue, [])
  })

  it('includes matching own Playlist names in Search Your playlists', async () => {
    let { app } = await freshApp()
    let adminCookie = await signInAdmin(app)
    let memberCookie = await joinMember(app, adminCookie)
    adminCookie =
      sessionCookie(
        await postForm(
          app,
          'http://evil.example' + routes.playlists.action.href(),
          { name: 'Late night mixes' },
          adminCookie,
        ),
      ) || adminCookie
    memberCookie =
      sessionCookie(
        await postForm(
          app,
          'http://evil.example' + routes.playlists.action.href(),
          { name: 'Late night Ben' },
          memberCookie,
        ),
      ) || memberCookie

    let search = await app.fetch(
      new Request('http://evil.example' + routes.search.href() + '?q=late', {
        headers: { Cookie: adminCookie },
      }),
    )
    assert.equal(search.status, 200)
    let html = await search.text()
    assert.match(html, /Your playlists/)
    assert.match(html, /Late night mixes/)
    assert.doesNotMatch(html, /Late night Ben/)
  })
})

function hrefIn(html: string, pattern: RegExp): string | undefined {
  return html.match(pattern)?.[0]
}

function findForm(html: string, buttonLabel: string): string | undefined {
  return (html.match(/<form[\s\S]*?<\/form>/g) ?? []).find((form) =>
    form.includes(`>${buttonLabel}</button>`),
  )
}

function formTrackIds(form: string): string[] {
  return [...form.matchAll(/name="trackId" value="([^"]+)"/g)].map((match) => match[1]!)
}

function formValue(form: string, name: string): string | undefined {
  return form.match(new RegExp(`name="${name}" value="([^"]+)"`))?.[1]
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

async function joinMember(app: App, adminCookie: string): Promise<string> {
  let minted = await postForm(app, 'http://evil.example' + routes.invites.action.href(), {}, adminCookie)
  let listed = await app.fetch(
    new Request('http://evil.example' + routes.invites.index.href(), {
      headers: { Cookie: sessionCookie(minted) || adminCookie },
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
