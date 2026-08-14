import { afterEach, describe, it } from 'node:test'
import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'

import * as assert from 'remix/assert'

import { openDatabase, type AppDatabase } from '../app/data/index.ts'
import { authenticateMember } from '../app/modules/auth/index.ts'
import { loadConfig } from '../app/modules/config/index.ts'
import { albumGroupingKey, artistGroupingKey } from '../app/modules/library/index.ts'
import { getListeningSession } from '../app/modules/playback/index.ts'
import { createApp } from '../app/router.ts'
import { routes } from '../app/routes.ts'

type App = ReturnType<typeof createApp>

describe('Library browse HTTP', () => {
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
    tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'spinbox-browse-http-'))
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
    return { config, database, libraryRoot, app: createApp({ config, database }) }
  }

  it('shows Continue, then Recently played, then Artists | Albums | Tracks with Albums selected', async () => {
    let { app, libraryRoot } = await freshApp()
    await writeLibrary(libraryRoot)
    let cookie = await signInAdmin(app)
    cookie = await scanNow(app, cookie)

    let home = await app.fetch(
      new Request('http://evil.example' + routes.home.href(), { headers: { Cookie: cookie } }),
    )
    assert.equal(home.status, 200)
    let html = await home.text()

    let continueAt = html.indexOf('>Continue<')
    let recentAt = html.indexOf('>Recently played<')
    let facetsAt = html.indexOf('aria-label="Library facets"')
    let albumsAt = html.indexOf('>OK Computer<')
    assert.ok(continueAt >= 0 && recentAt > continueAt && facetsAt > recentAt)
    assert.ok(albumsAt > facetsAt)
    assert.match(html, new RegExp(`href="${escapeRegExp(routes.libraryArtists.href())}"`))
    assert.match(html, new RegExp(`href="${escapeRegExp(routes.libraryAlbums.href())}"`))
    assert.match(html, new RegExp(`href="${escapeRegExp(routes.libraryTracks.href())}"`))
    assert.match(html, /aria-current="page"[^>]*>Albums</)
    assert.doesNotMatch(html, />Play queue</)
    assert.match(html, /OK Computer/)
    assert.doesNotMatch(html, />Airbag</)
    assert.doesNotMatch(html, />In the Flesh</)
  })

  it('opens Artists and Tracks facets from Library home', async () => {
    let { app, libraryRoot } = await freshApp()
    await writeLibrary(libraryRoot)
    let cookie = await signInAdmin(app)
    cookie = await scanNow(app, cookie)

    let artists = await app.fetch(
      new Request('http://evil.example' + routes.libraryArtists.href(), {
        headers: { Cookie: cookie },
      }),
    )
    assert.equal(artists.status, 200)
    let artistsHtml = await artists.text()
    assert.match(artistsHtml, /aria-current="page"[^>]*>Artists</)
    assert.match(artistsHtml, />Pink Floyd</)
    assert.match(artistsHtml, />Radiohead</)
    assert.doesNotMatch(artistsHtml, />OK Computer</)

    let tracks = await app.fetch(
      new Request('http://evil.example' + routes.libraryTracks.href(), {
        headers: { Cookie: cookie },
      }),
    )
    assert.equal(tracks.status, 200)
    let tracksHtml = await tracks.text()
    assert.match(tracksHtml, /aria-current="page"[^>]*>Tracks</)
    assert.match(tracksHtml, /Airbag/)
    assert.match(tracksHtml, /In the Flesh/)
    assert.match(tracksHtml, /Hey You/)
  })

  it('opens Album detail with title, Album artist, disc-then-track order, and play-all / shuffle', async () => {
    let { app, libraryRoot } = await freshApp()
    await writeLibrary(libraryRoot)
    let cookie = await signInAdmin(app)
    cookie = await scanNow(app, cookie)
    let albumHref = routes.libraryAlbum.href({
      albumKey: albumGroupingKey('Pink Floyd', 'The Wall'),
    })

    let page = await app.fetch(
      new Request('http://evil.example' + albumHref, { headers: { Cookie: cookie } }),
    )
    assert.equal(page.status, 200)
    let html = await page.text()
    assert.match(html, /<h1[^>]*>The Wall<\/h1>/)
    assert.match(html, /Pink Floyd/)
    assert.match(html, />Play all</)
    assert.match(html, />Shuffle</)
    let fleshAt = html.indexOf('In the Flesh')
    let heyAt = html.indexOf('Hey You')
    assert.ok(fleshAt >= 0 && heyAt > fleshAt)
    assert.match(html, new RegExp(escapeRegExp(albumHref)))
  })

  it('opens Artist detail with Albums for that string and matching Tracks', async () => {
    let { app, libraryRoot } = await freshApp()
    await writeLibrary(libraryRoot)
    let cookie = await signInAdmin(app)
    cookie = await scanNow(app, cookie)

    let radiohead = await app.fetch(
      new Request(
        'http://evil.example' +
          routes.libraryArtist.href({ artistKey: artistGroupingKey('Radiohead') }),
        { headers: { Cookie: cookie } },
      ),
    )
    assert.equal(radiohead.status, 200)
    let radioheadHtml = await radiohead.text()
    assert.match(radioheadHtml, /<h1[^>]*>Radiohead<\/h1>/)
    assert.match(radioheadHtml, /OK Computer/)
    assert.match(radioheadHtml, /Airbag/)

    let various = await app.fetch(
      new Request(
        'http://evil.example' +
          routes.libraryArtist.href({ artistKey: artistGroupingKey('Various Artists') }),
        { headers: { Cookie: cookie } },
      ),
    )
    let variousHtml = await various.text()
    assert.match(variousHtml, /<h1[^>]*>Various Artists<\/h1>/)
    assert.match(variousHtml, /Now 1/)
  })

  it('replaces the Play queue from an Album tap and from a lone Track', async () => {
    let { app, libraryRoot, database: db } = await freshApp()
    await writeLibrary(libraryRoot)
    let cookie = await signInAdmin(app)
    cookie = await scanNow(app, cookie)
    let member = await authenticateMember(db, {
      email: 'ada@example.com',
      password: 'correct-horse',
    })
    assert.ok(member)

    let albumHref = routes.libraryAlbum.href({
      albumKey: albumGroupingKey('Pink Floyd', 'The Wall'),
    })
    let albumPage = await app.fetch(
      new Request('http://evil.example' + albumHref, { headers: { Cookie: cookie } }),
    )
    let albumHtml = await albumPage.text()
    let playAll = findForm(albumHtml, 'Play all')
    assert.ok(playAll)
    let trackIds = formTrackIds(playAll)
    assert.equal(trackIds.length, 2)

    cookie =
      sessionCookie(
        await postForm(
          app,
          'http://evil.example' + routes.session.href(),
          { intent: 'play', trackId: trackIds },
          cookie,
        ),
      ) || cookie
    let afterAlbum = getListeningSession(db, member)
    assert.equal(afterAlbum.currentTrack?.title, 'In the Flesh')
    assert.deepEqual(
      afterAlbum.queue.map((track) => track.title),
      ['Hey You'],
    )
    assert.equal(afterAlbum.playing, true)

    let tracksPage = await app.fetch(
      new Request('http://evil.example' + routes.libraryTracks.href(), {
        headers: { Cookie: cookie },
      }),
    )
    let tracksHtml = await tracksPage.text()
    let airbagId = tracksHtml.match(
      /Airbag[\s\S]*?name="trackId" value="([^"]+)"/,
    )?.[1]
    assert.ok(airbagId)

    cookie =
      sessionCookie(
        await postForm(
          app,
          'http://evil.example' + routes.session.href(),
          { intent: 'play', trackId: airbagId },
          cookie,
        ),
      ) || cookie
    let afterTrack = getListeningSession(db, member)
    assert.equal(afterTrack.currentTrack?.title, 'Airbag')
    assert.deepEqual(afterTrack.queue, [])
  })

  it('plays an Artist track list from the tapped Track in container order', async () => {
    let { app, libraryRoot, database: db } = await freshApp()
    await writeLibrary(libraryRoot)
    let cookie = await signInAdmin(app)
    cookie = await scanNow(app, cookie)
    let member = await authenticateMember(db, {
      email: 'ada@example.com',
      password: 'correct-horse',
    })
    assert.ok(member)

    let artistPage = await app.fetch(
      new Request(
        'http://evil.example' +
          routes.libraryArtist.href({ artistKey: artistGroupingKey('Pink Floyd') }),
        { headers: { Cookie: cookie } },
      ),
    )
    let html = await artistPage.text()
    let heyForm = [...(html.match(/<form[\s\S]*?<\/form>/g) ?? [])].find(
      (form) => form.includes('Hey You') === false && form.includes('name="startAt" value="1"'),
    )
    assert.ok(heyForm)
    let trackIds = formTrackIds(heyForm)
    assert.ok(trackIds.length >= 2)

    await postForm(
      app,
      'http://evil.example' + routes.session.href(),
      { intent: 'play', trackId: trackIds, startAt: '1' },
      cookie,
    )
    let session = getListeningSession(db, member)
    assert.equal(session.currentTrack?.title, 'Hey You')
    assert.deepEqual(
      session.queue.map((track) => track.title),
      [],
    )
  })

  it('turns on shuffle when playing an Album with Shuffle', async () => {
    let { app, libraryRoot, database: db } = await freshApp()
    await writeLibrary(libraryRoot)
    let cookie = await signInAdmin(app)
    cookie = await scanNow(app, cookie)
    let member = await authenticateMember(db, {
      email: 'ada@example.com',
      password: 'correct-horse',
    })
    assert.ok(member)

    let albumPage = await app.fetch(
      new Request(
        'http://evil.example' +
          routes.libraryAlbum.href({
            albumKey: albumGroupingKey('Pink Floyd', 'The Wall'),
          }),
        { headers: { Cookie: cookie } },
      ),
    )
    let html = await albumPage.text()
    let shuffleForm = findForm(html, 'Shuffle')
    assert.ok(shuffleForm)
    assert.match(shuffleForm, /name="shuffle" value="1"/)
    let trackIds = formTrackIds(shuffleForm)
    assert.equal(trackIds.length, 2)

    await postForm(
      app,
      'http://evil.example' + routes.session.href(),
      { intent: 'play', trackId: trackIds, shuffle: '1' },
      cookie,
    )
    let session = getListeningSession(db, member)
    assert.equal(session.shuffle, true)
    assert.ok(
      session.currentTrack?.title === 'In the Flesh' || session.currentTrack?.title === 'Hey You',
    )
  })

  it('keeps empty and degraded Library banners on browse pages', async () => {
    let { app, libraryRoot } = await freshApp()
    let adminCookie = await signInAdmin(app)

    let emptyHome = await app.fetch(
      new Request('http://evil.example' + routes.home.href(), {
        headers: { Cookie: adminCookie },
      }),
    )
    let emptyHtml = await emptyHome.text()
    assert.match(emptyHtml, /Scan now/)
    assert.match(emptyHtml, /aria-label="Library facets"/)
    assert.match(emptyHtml, /<h2[^>]*>Continue<\/h2>/)

    await writeLibrary(libraryRoot)
    adminCookie = await scanNow(app, adminCookie)
    await fs.rm(libraryRoot, { recursive: true, force: true })

    let albums = await app.fetch(
      new Request('http://evil.example' + routes.libraryAlbums.href(), {
        headers: { Cookie: adminCookie },
      }),
    )
    let albumsHtml = await albums.text()
    assert.match(albumsHtml, /Library storage is unavailable/)
    assert.match(albumsHtml, /OK Computer/)

    let album = await app.fetch(
      new Request(
        'http://evil.example' +
          routes.libraryAlbum.href({
            albumKey: albumGroupingKey('Radiohead', 'OK Computer'),
          }),
        { headers: { Cookie: adminCookie } },
      ),
    )
    let albumHtml = await album.text()
    assert.match(albumHtml, /Library storage is unavailable/)
    assert.match(albumHtml, /<h1[^>]*>OK Computer<\/h1>/)
  })
})

function findForm(html: string, buttonLabel: string): string | undefined {
  return (html.match(/<form[\s\S]*?<\/form>/g) ?? []).find((form) =>
    form.includes(`>${buttonLabel}</button>`),
  )
}

function formTrackIds(form: string): string[] {
  return [...form.matchAll(/name="trackId" value="([^"]+)"/g)].map((match) => match[1]!)
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

async function writeLibrary(libraryRoot: string) {
  await writeTree(libraryRoot, {
    'Radiohead/OK Computer/01 - Airbag.mp3': '',
    'Pink Floyd/The Wall/Disc 1/01 - In the Flesh.flac': '',
    'Pink Floyd/The Wall/Disc 2/01 - Hey You.flac': '',
    'Various Artists/Now 1/01 - Guest Hit.m4a': '',
  })
}

async function writeTree(root: string, files: Record<string, string>) {
  for (let [relativePath, contents] of Object.entries(files)) {
    let absolute = path.join(root, ...relativePath.split('/'))
    await fs.mkdir(path.dirname(absolute), { recursive: true })
    await fs.writeFile(absolute, contents)
  }
}
