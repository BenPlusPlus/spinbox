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

describe('Library search HTTP', () => {
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
    tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'spinbox-search-http-'))
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

  it('groups one search over Track title, Artist, Album, and Album artist', async () => {
    let { app, libraryRoot } = await freshApp()
    await writeLibrary(libraryRoot)
    let cookie = await signInAdmin(app)
    cookie = await scanNow(app, cookie)

    let byTitle = await app.fetch(
      new Request('http://evil.example' + routes.search.href() + '?q=airbag', {
        headers: { Cookie: cookie },
      }),
    )
    assert.equal(byTitle.status, 200)
    let titleHtml = await byTitle.text()
    assert.match(titleHtml, /<h2[^>]*>Tracks<\/h2>/)
    assert.match(titleHtml, /Airbag/)
    assert.doesNotMatch(titleHtml, /<h2[^>]*>Albums<\/h2>/)
    assert.doesNotMatch(titleHtml, /<h2[^>]*>Artists<\/h2>/)
    assert.doesNotMatch(titleHtml, /No matching Tracks, Albums, Artists, or Playlists/)

    let byArtist = await app.fetch(
      new Request('http://evil.example' + routes.search.href() + '?q=Radiohead', {
        headers: { Cookie: cookie },
      }),
    )
    let artistHtml = await byArtist.text()
    let tracksAt = artistHtml.indexOf('>Tracks<')
    let albumsAt = artistHtml.indexOf('>Albums<')
    let artistsAt = artistHtml.indexOf('>Artists<')
    assert.ok(tracksAt >= 0 && albumsAt > tracksAt && artistsAt > albumsAt)
    assert.match(artistHtml, /Airbag/)
    assert.match(
      artistHtml,
      new RegExp(
        `href="${escapeRegExp(routes.libraryAlbum.href({ albumKey: albumGroupingKey('Radiohead', 'OK Computer') }))}"`,
      ),
    )
    assert.match(
      artistHtml,
      new RegExp(
        `href="${escapeRegExp(routes.libraryArtist.href({ artistKey: artistGroupingKey('Radiohead') }))}"`,
      ),
    )
    assert.doesNotMatch(artistHtml, /Pink Floyd/)
    assert.doesNotMatch(artistHtml, /The Wall/)

    let byAlbumArtist = await app.fetch(
      new Request('http://evil.example' + routes.search.href() + '?q=various', {
        headers: { Cookie: cookie },
      }),
    )
    let albumArtistHtml = await byAlbumArtist.text()
    assert.match(albumArtistHtml, /Guest Hit/)
    assert.match(albumArtistHtml, /Now 1/)
    assert.match(albumArtistHtml, /Various Artists/)

    let empty = await app.fetch(
      new Request('http://evil.example' + routes.search.href() + '?q=nope', {
        headers: { Cookie: cookie },
      }),
    )
    assert.match(
      await empty.text(),
      /No matching Tracks, Albums, Artists, or Playlists for “nope”/,
    )
  })

  it('plays a Track or container from Search with the same session defaults as browse', async () => {
    let { app, libraryRoot, database: db } = await freshApp()
    await writeLibrary(libraryRoot)
    let cookie = await signInAdmin(app)
    cookie = await scanNow(app, cookie)
    let member = await authenticateMember(db, {
      email: 'ada@example.com',
      password: 'correct-horse',
    })
    assert.ok(member)

    let albumSearch = await app.fetch(
      new Request('http://evil.example' + routes.search.href() + '?q=wall', {
        headers: { Cookie: cookie },
      }),
    )
    let albumHtml = await albumSearch.text()
    let albumPlay = [...(albumHtml.match(/<form[\s\S]*?<\/form>/g) ?? [])].find(
      (form) => form.includes('>Play<') && form.includes('name="trackId"') && formTrackIds(form).length === 2,
    )
    assert.ok(albumPlay)
    let albumTrackIds = formTrackIds(albumPlay)
    assert.equal(albumTrackIds.length, 2)

    cookie =
      sessionCookie(
        await postForm(
          app,
          'http://evil.example' + routes.session.href(),
          { intent: 'play', trackId: albumTrackIds },
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

    let trackSearch = await app.fetch(
      new Request('http://evil.example' + routes.search.href() + '?q=airbag', {
        headers: { Cookie: cookie },
      }),
    )
    let trackHtml = await trackSearch.text()
    let airbagId = trackHtml.match(/Airbag[\s\S]*?name="trackId" value="([^"]+)"/)?.[1]
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

  it('exposes Search from desktop top chrome and the mobile Search tab', async () => {
    let { app } = await freshApp()
    let cookie = await signInAdmin(app)

    let home = await app.fetch(
      new Request('http://evil.example' + routes.home.href(), { headers: { Cookie: cookie } }),
    )
    let homeHtml = await home.text()
    assert.match(
      homeHtml,
      new RegExp(
        `<form method="GET" action="${escapeRegExp(routes.search.href())}"[^>]*role="search"`,
      ),
    )
    assert.match(homeHtml, /aria-label="Tabs"[\s\S]*?<a href="\/search"[^>]*>Search</)

    let search = await app.fetch(
      new Request('http://evil.example' + routes.search.href(), { headers: { Cookie: cookie } }),
    )
    let searchHtml = await search.text()
    assert.match(searchHtml, /<h1[^>]*>Search<\/h1>/)
    assert.match(searchHtml, /aria-current="page"[^>]*>Search</)
    assert.match(searchHtml, /type="search"/i)
  })
})

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
