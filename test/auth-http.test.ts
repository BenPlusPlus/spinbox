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

describe('first Admin setup and sign-in', () => {
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
    tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'spinbox-auth-http-'))
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
    return { config, database, app: createApp({ config, database }) }
  }

  it('shows auth-shell setup on an empty database, with no app chrome', async () => {
    let { config, app } = await freshApp()

    let home = await app.fetch(new Request('http://evil.example' + routes.home.href()))
    assert.equal(home.status, 302)
    assert.equal(home.headers.get('Location'), originUrl(config, routes.setup.index.href()))

    let response = await app.fetch(new Request('http://evil.example' + routes.setup.index.href()))
    assert.equal(response.status, 200)
    let html = await response.text()

    assert.match(html, /type="email"/i)
    assert.match(html, /type="password"/i)
    assert.match(html, /display name/i)
    assert.doesNotMatch(html, /<nav\b/i)
    assert.doesNotMatch(html, /Playlists/)
    assert.doesNotMatch(html, /Now playing/i)
    assert.doesNotMatch(html, /sidebar/i)
  })

  it('completing setup creates the first Admin, signs them in, and lands on Library home', async () => {
    let { config, app } = await freshApp()

    let setup = await postForm(app, 'http://evil.example' + routes.setup.action.href(), {
      email: 'ada@example.com',
      password: 'correct-horse',
      displayName: 'Ada',
    })

    assert.equal(setup.status, 302)
    assert.equal(setup.headers.get('Location'), originUrl(config, routes.home.href()))
    let cookie = sessionCookie(setup)
    assert.ok(cookie)

    let home = await app.fetch(
      new Request('http://evil.example' + routes.home.href(), {
        headers: { Cookie: cookie },
      }),
    )
    assert.equal(home.status, 200)
    let html = await home.text()
    assert.match(html, /Library/)
    assert.match(html, /Ada|ada@example.com/)
    assert.doesNotMatch(html, /Hello from Spinbox/)
  })

  it('makes setup unavailable once any Household member exists', async () => {
    let { config, app } = await freshApp()
    await completeSetup(app)

    let getSetup = await app.fetch(new Request('http://evil.example' + routes.setup.index.href()))
    assert.equal(getSetup.status, 302)
    assert.equal(getSetup.headers.get('Location'), originUrl(config, routes.login.index.href()))

    let postSetup = await postForm(app, 'http://evil.example' + routes.setup.action.href(), {
      email: 'other@example.com',
      password: 'correct-horse',
    })
    assert.equal(postSetup.status, 302)
    assert.equal(postSetup.headers.get('Location'), originUrl(config, routes.login.index.href()))
  })

  it('signs a Household member in and out, and blocks missing or dead sessions from app routes', async () => {
    let { config, app, database: db } = await freshApp()
    await completeSetup(app)

    let loginPage = await app.fetch(new Request('http://evil.example' + routes.login.index.href()))
    assert.equal(loginPage.status, 200)
    let loginHtml = await loginPage.text()
    assert.match(loginHtml, /type="email"/i)
    assert.match(loginHtml, /type="password"/i)
    assert.doesNotMatch(loginHtml, /<nav\b/i)
    assert.doesNotMatch(loginHtml, /magic link/i)
    assert.doesNotMatch(loginHtml, /reset password/i)

    let anonymousHome = await app.fetch(new Request('http://evil.example' + routes.home.href()))
    assert.equal(anonymousHome.status, 302)
    assert.equal(anonymousHome.headers.get('Location'), originUrl(config, routes.login.index.href()))

    let badLogin = await postForm(app, 'http://evil.example' + routes.login.action.href(), {
      email: 'ada@example.com',
      password: 'wrong-password',
    })
    assert.equal(badLogin.status, 302)
    assert.equal(badLogin.headers.get('Location'), originUrl(config, routes.login.index.href()))
    let failedCookie = sessionCookie(badLogin)
    let stillAnonymous = await app.fetch(
      new Request('http://evil.example' + routes.home.href(), {
        headers: failedCookie ? { Cookie: failedCookie } : undefined,
      }),
    )
    assert.equal(stillAnonymous.status, 302)
    assert.equal(
      stillAnonymous.headers.get('Location'),
      originUrl(config, routes.login.index.href()),
    )

    let login = await postForm(app, 'http://evil.example' + routes.login.action.href(), {
      email: 'ADA@example.com',
      password: 'correct-horse',
    })
    assert.equal(login.status, 302)
    assert.equal(login.headers.get('Location'), originUrl(config, routes.home.href()))
    let cookie = sessionCookie(login)
    assert.ok(cookie)

    let signedIn = await app.fetch(
      new Request('http://evil.example' + routes.home.href(), {
        headers: { Cookie: cookie },
      }),
    )
    assert.equal(signedIn.status, 200)
    assert.match(await signedIn.text(), /Library/)

    let logout = await app.fetch(
      new Request('http://evil.example' + routes.logout.href(), {
        method: 'POST',
        headers: { Cookie: cookie },
      }),
    )
    assert.equal(logout.status, 302)
    assert.equal(logout.headers.get('Location'), originUrl(config, routes.login.index.href()))

    let afterLogout = await app.fetch(
      new Request('http://evil.example' + routes.home.href(), {
        headers: sessionCookie(logout) ? { Cookie: sessionCookie(logout) } : undefined,
      }),
    )
    assert.equal(afterLogout.status, 302)
    assert.equal(afterLogout.headers.get('Location'), originUrl(config, routes.login.index.href()))

    let deadLogin = await postForm(app, 'http://evil.example' + routes.login.action.href(), {
      email: 'ada@example.com',
      password: 'correct-horse',
    })
    let deadCookie = sessionCookie(deadLogin)
    db.sqlite.exec('DELETE FROM credentials')
    db.sqlite.exec('DELETE FROM members')

    let deadSession = await app.fetch(
      new Request('http://evil.example' + routes.home.href(), {
        headers: { Cookie: deadCookie },
      }),
    )
    assert.equal(deadSession.status, 302)
    assert.equal(
      deadSession.headers.get('Location'),
      originUrl(config, routes.setup.index.href()),
    )
  })

  it('uses only SPINBOX_PUBLIC_URL for redirect origin and cookie Secure', async () => {
    let httpsApp = await freshApp({
      SPINBOX_PUBLIC_URL: 'https://spinbox.example.ts.net',
    })
    let httpsSetup = await postForm(
      httpsApp.app,
      'http://evil.example' + routes.setup.action.href(),
      {
        email: 'ada@example.com',
        password: 'correct-horse',
      },
    )
    assert.equal(
      new URL(httpsSetup.headers.get('Location')!).origin,
      'https://spinbox.example.ts.net',
    )
    assert.match(setCookieHeader(httpsSetup), /secure/i)

    httpsApp.database.close()
    database = undefined
    await fs.rm(tempRoot!, { recursive: true, force: true })
    tempRoot = undefined

    let httpApp = await freshApp({
      SPINBOX_PUBLIC_URL: 'http://127.0.0.1:44100',
    })
    let httpSetup = await postForm(httpApp.app, 'http://evil.example' + routes.setup.action.href(), {
      email: 'ada@example.com',
      password: 'correct-horse',
    })
    assert.equal(new URL(httpSetup.headers.get('Location')!).origin, 'http://127.0.0.1:44100')
    assert.doesNotMatch(setCookieHeader(httpSetup), /secure/i)
  })
})

describe('invite-only household join', () => {
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
    tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'spinbox-invite-http-'))
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
    return { config, database, app: createApp({ config, database }) }
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

  it('lets an Admin mint a 7-day Invite and shows the accept URL once', async () => {
    let { config, app } = await freshApp()
    let cookie = await signInAdmin(app)

    let page = await app.fetch(
      new Request('http://evil.example' + routes.invites.index.href(), {
        headers: { Cookie: cookie },
      }),
    )
    assert.equal(page.status, 200)
    let html = await page.text()
    assert.match(html, /Invite/i)
    assert.match(html, /email/i)

    let minted = await postForm(
      app,
      'http://evil.example' + routes.invites.action.href(),
      { email: '' },
      cookie,
    )
    assert.equal(minted.status, 302)
    assert.equal(minted.headers.get('Location'), originUrl(config, routes.invites.index.href()))
    let afterMintCookie = sessionCookie(minted) || cookie

    let listed = await app.fetch(
      new Request('http://evil.example' + routes.invites.index.href(), {
        headers: { Cookie: afterMintCookie },
      }),
    )
    assert.equal(listed.status, 200)
    let listedHtml = await listed.text()
    let acceptUrl = listedHtml.match(/https:\/\/spinbox\.example\.ts\.net\/join\/([A-Za-z0-9_-]+)/)
    assert.ok(acceptUrl)
    assert.match(listedHtml, /7 days|expires/i)
  })

  it('lets an Admin revoke an unused Invite so the join link cannot be redeemed', async () => {
    let { config, app } = await freshApp()
    let cookie = await signInAdmin(app)

    let minted = await postForm(
      app,
      'http://evil.example' + routes.invites.action.href(),
      {},
      cookie,
    )
    let afterMintCookie = sessionCookie(minted) || cookie
    let listed = await app.fetch(
      new Request('http://evil.example' + routes.invites.index.href(), {
        headers: { Cookie: afterMintCookie },
      }),
    )
    let listedHtml = await listed.text()
    let token = listedHtml.match(/\/join\/([A-Za-z0-9_-]+)/)?.[1]
    let inviteId = listedHtml.match(/\/invites\/([^/"'\s]+)\/revoke/)?.[1]
    assert.ok(token)
    assert.ok(inviteId)

    let revoked = await postForm(
      app,
      'http://evil.example' + routes.inviteRevoke.href({ id: inviteId }),
      {},
      afterMintCookie,
    )
    assert.equal(revoked.status, 302)
    assert.equal(revoked.headers.get('Location'), originUrl(config, routes.invites.index.href()))

    let join = await app.fetch(
      new Request('http://evil.example' + routes.join.index.href({ token })),
    )
    assert.equal(join.status, 200)
    let joinHtml = await join.text()
    assert.match(joinHtml, /cannot|revoked|not valid/i)
    assert.doesNotMatch(joinHtml, /type="password"/i)

    let redeem = await postForm(
      app,
      'http://evil.example' + routes.join.action.href({ token }),
      {
        email: 'ben@example.com',
        password: 'household-pass',
      },
    )
    assert.equal(redeem.status, 200)
    assert.match(await redeem.text(), /cannot|revoked|not valid/i)
  })

  it('redeems an Invite into a signed-in Member on Library home', async () => {
    let { config, app } = await freshApp()
    let cookie = await signInAdmin(app)
    let minted = await postForm(
      app,
      'http://evil.example' + routes.invites.action.href(),
      { email: 'Ben@Example.com' },
      cookie,
    )
    let listed = await app.fetch(
      new Request('http://evil.example' + routes.invites.index.href(), {
        headers: { Cookie: sessionCookie(minted) || cookie },
      }),
    )
    let token = (await listed.text()).match(/\/join\/([A-Za-z0-9_-]+)/)?.[1]
    assert.ok(token)

    let joinPage = await app.fetch(
      new Request('http://evil.example' + routes.join.index.href({ token })),
    )
    assert.equal(joinPage.status, 200)
    let joinHtml = await joinPage.text()
    assert.match(joinHtml, /type="password"/i)
    assert.match(joinHtml, /display name/i)
    assert.match(joinHtml, /ben@example.com/i)
    assert.doesNotMatch(joinHtml, /<nav\b/i)
    assert.doesNotMatch(joinHtml, /Playlists/)
    assert.doesNotMatch(joinHtml, /Now playing/i)
    assert.doesNotMatch(joinHtml, /sidebar/i)

    let wrongEmail = await postForm(
      app,
      'http://evil.example' + routes.join.action.href({ token }),
      {
        email: 'other@example.com',
        password: 'household-pass',
      },
    )
    assert.equal(wrongEmail.status, 200)
    assert.match(await wrongEmail.text(), /email/i)

    let accepted = await postForm(
      app,
      'http://evil.example' + routes.join.action.href({ token }),
      {
        email: 'BEN@example.com',
        password: 'household-pass',
        displayName: 'Ben',
      },
    )
    assert.equal(accepted.status, 302)
    assert.equal(accepted.headers.get('Location'), originUrl(config, routes.home.href()))
    let memberCookie = sessionCookie(accepted)
    assert.ok(memberCookie)

    let home = await app.fetch(
      new Request('http://evil.example' + routes.home.href(), {
        headers: { Cookie: memberCookie },
      }),
    )
    assert.equal(home.status, 200)
    let homeHtml = await home.text()
    assert.match(homeHtml, /Library/)
    assert.match(homeHtml, /Ben|ben@example.com/)

    let reuse = await postForm(
      app,
      'http://evil.example' + routes.join.action.href({ token }),
      {
        email: 'third@example.com',
        password: 'household-pass',
      },
    )
    assert.equal(reuse.status, 200)
    assert.match(await reuse.text(), /cannot|already|not valid/i)

    let memberInvites = await app.fetch(
      new Request('http://evil.example' + routes.invites.index.href(), {
        headers: { Cookie: memberCookie },
      }),
    )
    assert.equal(memberInvites.status, 302)
    assert.equal(memberInvites.headers.get('Location'), originUrl(config, routes.home.href()))
  })

  it('keeps join invite-only after setup: no open signup', async () => {
    let { app } = await freshApp()
    await completeSetup(app)

    let signup = await app.fetch(new Request('http://evil.example/signup'))
    assert.equal(signup.status, 404)

    let login = await app.fetch(new Request('http://evil.example' + routes.login.index.href()))
    let loginHtml = await login.text()
    assert.doesNotMatch(loginHtml, /create an account/i)
    assert.doesNotMatch(loginHtml, /sign up/i)
    assert.doesNotMatch(loginHtml, /href="\/setup"/i)
  })
})

function originUrl(config: AppConfig, path: string): string {
  return new URL(path, config.publicUrl.origin).href
}

function setCookieHeader(response: Response): string {
  return response.headers.getSetCookie().join('\n')
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
