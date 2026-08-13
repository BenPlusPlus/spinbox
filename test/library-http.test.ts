import { afterEach, describe, it } from 'node:test'
import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'

import * as assert from 'remix/assert'

import { openDatabase, type AppDatabase } from '../app/data/index.ts'
import { loadConfig, type AppConfig } from '../app/modules/config/index.ts'
import type { ScanAdapter } from '../app/modules/library/index.ts'
import { createApp } from '../app/router.ts'
import { routes } from '../app/routes.ts'

type App = ReturnType<typeof createApp>

describe('Admin Scan now', () => {
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

  async function freshApp(
    overrides: Record<string, string | undefined> = {},
    scanAdapter?: ScanAdapter,
  ) {
    tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'spinbox-library-http-'))
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
    return {
      config,
      database,
      libraryRoot,
      app: createApp({ config, database, scanAdapter }),
    }
  }

  async function signInAdmin(app: App) {
    await completeSetup(app)
    let login = await postForm(app, 'http://evil.example' + routes.login.action.href(), {
      email: 'ada@example.com',
      password: 'correct-horse',
    })
    let cookie = sessionCookie(login)
    assert.ok(cookie)
    return cookie
  }

  async function joinMember(app: App, cookie: string) {
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

  it('shows coarse Scan run status and Scan now to an Admin, not to a Member', async () => {
    let { app } = await freshApp()
    let adminCookie = await signInAdmin(app)
    let memberCookie = await joinMember(app, adminCookie)

    let adminPage = await app.fetch(
      new Request('http://evil.example' + routes.settings.index.href(), {
        headers: { Cookie: adminCookie },
      }),
    )
    assert.equal(adminPage.status, 200)
    let adminHtml = await adminPage.text()
    assert.match(adminHtml, /Scan now/)
    assert.match(adminHtml, /Scan run: idle/)
    assert.doesNotMatch(adminHtml, /LIBRARY_ROOT/)

    let memberPage = await app.fetch(
      new Request('http://evil.example' + routes.settings.index.href(), {
        headers: { Cookie: memberCookie },
      }),
    )
    assert.equal(memberPage.status, 200)
    let memberHtml = await memberPage.text()
    assert.doesNotMatch(memberHtml, /Scan now/)
    assert.doesNotMatch(memberHtml, /Scan run/)
  })

  it('starts a Scan run without keeping the HTTP request open for the walk', async () => {
    let { config, app } = await freshApp()
    let cookie = await signInAdmin(app)

    let release!: () => void
    let gate = new Promise<void>((resolve) => {
      release = resolve
    })
    let hanging: ScanAdapter = {
      async *walk() {
        await gate
      },
    }

    let hangingApp = createApp({
      config,
      database: database!,
      scanAdapter: hanging,
    })

    let started = await postForm(
      hangingApp,
      'http://evil.example' + routes.scanNow.href(),
      {},
      cookie,
    )
    assert.equal(started.status, 302)
    assert.equal(started.headers.get('Location'), originUrl(config, routes.settings.index.href()))
    cookie = sessionCookie(started) || cookie

    let running = await hangingApp.fetch(
      new Request('http://evil.example' + routes.settings.index.href(), {
        headers: { Cookie: cookie },
      }),
    )
    assert.match(await running.text(), /Scan run: running/)

    let second = await postForm(
      hangingApp,
      'http://evil.example' + routes.scanNow.href(),
      {},
      cookie,
    )
    assert.equal(second.status, 302)
    cookie = sessionCookie(second) || cookie
    let stillRunning = await hangingApp.fetch(
      new Request('http://evil.example' + routes.settings.index.href(), {
        headers: { Cookie: cookie },
      }),
    )
    assert.match(await stillRunning.text(), /already in progress|Scan run: running/)

    release()

    let finishedHtml = ''
    for (let attempt = 0; attempt < 40; attempt++) {
      let finished = await hangingApp.fetch(
        new Request('http://evil.example' + routes.settings.index.href(), {
          headers: { Cookie: cookie },
        }),
      )
      finishedHtml = await finished.text()
      if (finishedHtml.includes('Last Scan run: succeeded')) {
        break
      }
      await new Promise((resolve) => setTimeout(resolve, 25))
    }
    assert.match(finishedHtml, /Last Scan run: succeeded/)
  })

  it('blocks a non-Admin from starting a Scan run', async () => {
    let { config, app } = await freshApp()
    let adminCookie = await signInAdmin(app)
    let memberCookie = await joinMember(app, adminCookie)

    let response = await postForm(
      app,
      'http://evil.example' + routes.scanNow.href(),
      {},
      memberCookie,
    )
    assert.equal(response.status, 302)
    assert.equal(response.headers.get('Location'), originUrl(config, routes.home.href()))
  })

  it('indexes a Library tree from Scan now and reports the last result', async () => {
    let { config, app, libraryRoot } = await freshApp()
    await fs.mkdir(path.join(libraryRoot, 'Radiohead', 'OK Computer'), { recursive: true })
    await fs.writeFile(path.join(libraryRoot, 'Radiohead', 'OK Computer', '01 - Airbag.mp3'), '')
    await fs.writeFile(path.join(libraryRoot, 'Radiohead', 'OK Computer', 'cover.jpg'), '')

    let cookie = await signInAdmin(app)
    let started = await postForm(app, 'http://evil.example' + routes.scanNow.href(), {}, cookie)
    assert.equal(started.status, 302)
    cookie = sessionCookie(started) || cookie

    let html = ''
    for (let attempt = 0; attempt < 40; attempt++) {
      let page = await app.fetch(
        new Request('http://evil.example' + routes.settings.index.href(), {
          headers: { Cookie: cookie },
        }),
      )
      html = await page.text()
      if (html.includes('Last Scan run: succeeded')) {
        break
      }
      await new Promise((resolve) => setTimeout(resolve, 25))
    }
    assert.match(html, /Last Scan run: succeeded/)
    assert.match(html, /1 Tracks/)
  })
})

function originUrl(config: AppConfig, path: string): string {
  return new URL(path, config.publicUrl.origin).href
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
