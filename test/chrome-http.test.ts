import { afterEach, describe, it } from 'node:test'
import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'

import * as assert from 'remix/assert'

import { openDatabase, type AppDatabase } from '../app/data/index.ts'
import { loadConfig, type AppConfig } from '../app/modules/config/index.ts'
import { createApp } from '../app/router.ts'
import { routes } from '../app/routes.ts'

type App = ReturnType<typeof createApp>

describe('app chrome after sign-in', () => {
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
    tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'spinbox-chrome-http-'))
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
      ...overrides,
    })
    database = await openDatabase(config)
    return { config, database, libraryRoot, app: createApp({ config, database }) }
  }

  it('lands a signed-in member on Library home with desktop sidebar and mobile tabs', async () => {
    let { config, app } = await freshApp()
    let cookie = await signInAdmin(app)

    let home = await app.fetch(
      new Request('http://evil.example' + routes.home.href(), {
        headers: { Cookie: cookie },
      }),
    )
    assert.equal(home.status, 200)
    let html = await home.text()

    assert.match(html, /<h1[^>]*>Library<\/h1>/)
    assert.doesNotMatch(html, /<h1[^>]*>Settings<\/h1>/)
    assert.match(html, /aria-label="Sidebar"/i)
    assert.match(html, /aria-label="Tabs"/i)
    assert.match(html, new RegExp(`href="${escapeRegExp(routes.home.href())}"`))
    assert.match(html, new RegExp(`href="${escapeRegExp(routes.playlists.href())}"`))
    assert.match(html, new RegExp(`href="${escapeRegExp(routes.settings.index.href())}"`))
    assert.match(html, new RegExp(`href="${escapeRegExp(routes.search.href())}"`))
    assert.doesNotMatch(html, /<a href="\/now-playing">Now playing/)
    assert.doesNotMatch(html, /aria-label="Tabs"[\s\S]*?<a[^>]*>Now playing</)
    assert.equal(home.headers.get('Location'), null)
    assert.notEqual(home.url, originUrl(config, routes.settings.index.href()))
  })

  it('shows an empty Library home with a Scan now CTA for Admins and ask-an-Admin copy for Members', async () => {
    let { app } = await freshApp()
    let adminCookie = await signInAdmin(app)
    let memberCookie = await joinMember(app, adminCookie)

    let adminHome = await app.fetch(
      new Request('http://evil.example' + routes.home.href(), {
        headers: { Cookie: adminCookie },
      }),
    )
    let adminHtml = await adminHome.text()
    assert.match(adminHtml, /<h1[^>]*>Library<\/h1>/)
    assert.match(adminHtml, /Scan now/)
    assert.match(adminHtml, new RegExp(escapeRegExp(routes.scanNow.href())))
    assert.doesNotMatch(adminHtml, /ask an Admin/)

    let memberHome = await app.fetch(
      new Request('http://evil.example' + routes.home.href(), {
        headers: { Cookie: memberCookie },
      }),
    )
    let memberHtml = await memberHome.text()
    assert.match(memberHtml, /ask an Admin/)
    assert.doesNotMatch(memberHtml, /Scan now/)
  })

  it('keeps the last Library index up and banners when Library storage is unavailable', async () => {
    let { app, libraryRoot } = await freshApp()
    await fs.mkdir(path.join(libraryRoot, 'Radiohead', 'OK Computer'), { recursive: true })
    await fs.writeFile(path.join(libraryRoot, 'Radiohead', 'OK Computer', '01 - Airbag.mp3'), '')
    let cookie = await signInAdmin(app)
    cookie = await scanNow(app, cookie)

    await fs.rm(libraryRoot, { recursive: true, force: true })

    let home = await app.fetch(
      new Request('http://evil.example' + routes.home.href(), {
        headers: { Cookie: cookie },
      }),
    )
    assert.equal(home.status, 200)
    let html = await home.text()
    assert.match(html, /Library storage is unavailable/)
    assert.match(html, /OK Computer/)
  })

  it('hides the mini-dock when idle and shows a stub when a current Track exists', async () => {
    let { app, libraryRoot } = await freshApp()
    await fs.mkdir(path.join(libraryRoot, 'Radiohead', 'OK Computer'), { recursive: true })
    await fs.writeFile(path.join(libraryRoot, 'Radiohead', 'OK Computer', '01 - Airbag.mp3'), '')
    let cookie = await signInAdmin(app)
    cookie = await scanNow(app, cookie)

    let idle = await app.fetch(
      new Request('http://evil.example' + routes.home.href(), {
        headers: { Cookie: cookie },
      }),
    )
    let idleHtml = await idle.text()
    assert.doesNotMatch(idleHtml, /aria-label="Mini-dock"/i)
    assert.match(idleHtml, /aria-label="Tabs"/i)

    let listed = await app.fetch(
      new Request('http://evil.example' + routes.home.href(), {
        headers: { Cookie: cookie },
      }),
    )
    let trackId = (await listed.text()).match(/name="trackId" value="([^"]+)"/)?.[1]
    assert.ok(trackId)

    cookie =
      sessionCookie(
        await postForm(
          app,
          'http://evil.example' + routes.session.href(),
          { intent: 'play', trackId },
          cookie,
        ),
      ) || cookie

    let playing = await app.fetch(
      new Request('http://evil.example' + routes.home.href(), {
        headers: { Cookie: cookie },
      }),
    )
    let playingHtml = await playing.text()
    assert.match(playingHtml, /aria-label="Mini-dock"/i)
    assert.match(playingHtml, /Now playing · Airbag/)
    assert.match(playingHtml, /<audio/)
  })

  it('wraps Settings, Playlists, and Search in app chrome without making Now playing a tab', async () => {
    let { app } = await freshApp()
    let cookie = await signInAdmin(app)

    let settings = await app.fetch(
      new Request('http://evil.example' + routes.settings.index.href(), {
        headers: { Cookie: cookie },
      }),
    )
    assert.equal(settings.status, 200)
    let settingsHtml = await settings.text()
    assert.match(settingsHtml, /<h1[^>]*>Settings<\/h1>/)
    assert.match(settingsHtml, /aria-label="Sidebar"/i)
    assert.match(settingsHtml, /aria-label="Tabs"/i)
    assert.match(settingsHtml, /display name/i)
    assert.match(settingsHtml, /Scan now/)
    assert.match(settingsHtml, /Household members/)
    assert.match(settingsHtml, /Invites/)
    assert.doesNotMatch(settingsHtml, /<a href="\/now-playing">Now playing/)
    assert.doesNotMatch(settingsHtml, /aria-label="Tabs"[\s\S]*?<a[^>]*>Now playing</)

    let playlists = await app.fetch(
      new Request('http://evil.example' + routes.playlists.href(), {
        headers: { Cookie: cookie },
      }),
    )
    assert.equal(playlists.status, 200)
    let playlistsHtml = await playlists.text()
    assert.match(playlistsHtml, /<h1[^>]*>Playlists<\/h1>/)
    assert.match(playlistsHtml, /aria-label="Sidebar"/i)
    assert.match(playlistsHtml, /aria-label="Tabs"/i)

    let search = await app.fetch(
      new Request('http://evil.example' + routes.search.href(), {
        headers: { Cookie: cookie },
      }),
    )
    assert.equal(search.status, 200)
    let searchHtml = await search.text()
    assert.match(searchHtml, /<h1[^>]*>Search<\/h1>/)
    assert.match(searchHtml, /aria-label="Tabs"/i)
    assert.match(searchHtml, /type="search"/i)
  })
})

function originUrl(config: AppConfig, href: string): string {
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
