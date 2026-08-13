import { describe, it } from 'node:test'
import * as path from 'node:path'
import * as os from 'node:os'

import * as assert from 'remix/assert'

import { ConfigError, loadConfig, publicOrigin } from '../app/modules/config/index.ts'

function absoluteSiblingPaths() {
  let root = path.join(os.tmpdir(), 'spinbox-config-test')
  return {
    libraryRoot: path.join(root, 'library'),
    dataDir: path.join(root, 'app-data'),
  }
}

function productionEnv(overrides: Record<string, string | undefined> = {}) {
  let { libraryRoot, dataDir } = absoluteSiblingPaths()
  return {
    NODE_ENV: 'production',
    LIBRARY_ROOT: libraryRoot,
    SPINBOX_DATA_DIR: dataDir,
    SPINBOX_PUBLIC_URL: 'https://spinbox.example.ts.net',
    PORT: '44100',
    SESSION_SECRET: 'test-session-secret-at-least-16',
    ...overrides,
  }
}

describe('loadConfig', () => {
  it('fails fast in production when LIBRARY_ROOT is missing', () => {
    assert.throws(
      () => loadConfig(productionEnv({ LIBRARY_ROOT: undefined })),
      (error: unknown) => {
        assert.ok(error instanceof ConfigError)
        assert.match(error.message, /LIBRARY_ROOT/)
        return true
      },
    )
  })

  it('fails fast in production when SPINBOX_DATA_DIR is missing', () => {
    assert.throws(
      () => loadConfig(productionEnv({ SPINBOX_DATA_DIR: undefined })),
      (error: unknown) => {
        assert.ok(error instanceof ConfigError)
        assert.match(error.message, /SPINBOX_DATA_DIR/)
        return true
      },
    )
  })

  it('fails fast in production when SPINBOX_PUBLIC_URL is missing', () => {
    assert.throws(
      () => loadConfig(productionEnv({ SPINBOX_PUBLIC_URL: undefined })),
      (error: unknown) => {
        assert.ok(error instanceof ConfigError)
        assert.match(error.message, /SPINBOX_PUBLIC_URL/)
        return true
      },
    )
  })

  it('fails fast in production when SESSION_SECRET is missing', () => {
    assert.throws(
      () => loadConfig(productionEnv({ SESSION_SECRET: undefined })),
      (error: unknown) => {
        assert.ok(error instanceof ConfigError)
        assert.match(error.message, /SESSION_SECRET/)
        return true
      },
    )
  })

  it('fails fast when SESSION_SECRET is too short', () => {
    assert.throws(
      () => loadConfig(productionEnv({ SESSION_SECRET: 'short' })),
      (error: unknown) => {
        assert.ok(error instanceof ConfigError)
        assert.match(error.message, /SESSION_SECRET/)
        return true
      },
    )
  })

  it('fails fast in production when the listen port is missing', () => {
    assert.throws(
      () => loadConfig(productionEnv({ PORT: undefined, SPINBOX_PORT: undefined })),
      (error: unknown) => {
        assert.ok(error instanceof ConfigError)
        assert.match(error.message, /PORT|SPINBOX_PORT|listen port/i)
        return true
      },
    )
  })

  it('fails fast when LIBRARY_ROOT is not an absolute path', () => {
    assert.throws(
      () => loadConfig(productionEnv({ LIBRARY_ROOT: 'library' })),
      (error: unknown) => {
        assert.ok(error instanceof ConfigError)
        assert.match(error.message, /LIBRARY_ROOT/)
        return true
      },
    )
  })

  it('fails fast when SPINBOX_DATA_DIR is not an absolute path', () => {
    assert.throws(
      () => loadConfig(productionEnv({ SPINBOX_DATA_DIR: 'data' })),
      (error: unknown) => {
        assert.ok(error instanceof ConfigError)
        assert.match(error.message, /SPINBOX_DATA_DIR/)
        return true
      },
    )
  })

  it('fails fast when SPINBOX_DATA_DIR is under the Library', () => {
    let { libraryRoot } = absoluteSiblingPaths()
    assert.throws(
      () =>
        loadConfig(
          productionEnv({
            LIBRARY_ROOT: libraryRoot,
            SPINBOX_DATA_DIR: path.join(libraryRoot, 'app-data'),
          }),
        ),
      (error: unknown) => {
        assert.ok(error instanceof ConfigError)
        assert.match(error.message, /SPINBOX_DATA_DIR/)
        assert.match(error.message, /Library/i)
        return true
      },
    )
  })

  it('fails fast when SPINBOX_PUBLIC_URL is not an absolute http(s) origin', () => {
    assert.throws(
      () => loadConfig(productionEnv({ SPINBOX_PUBLIC_URL: 'spinbox.local' })),
      (error: unknown) => {
        assert.ok(error instanceof ConfigError)
        assert.match(error.message, /SPINBOX_PUBLIC_URL/)
        return true
      },
    )
  })

  it('fails fast when the listen port is invalid', () => {
    assert.throws(
      () => loadConfig(productionEnv({ PORT: 'not-a-port' })),
      (error: unknown) => {
        assert.ok(error instanceof ConfigError)
        assert.match(error.message, /PORT|listen port/i)
        return true
      },
    )
  })

  it('loads a valid production environment', () => {
    let { libraryRoot, dataDir } = absoluteSiblingPaths()
    let config = loadConfig(productionEnv())

    assert.equal(config.libraryRoot, libraryRoot)
    assert.equal(config.dataDir, dataDir)
    assert.equal(config.publicUrl.origin, 'https://spinbox.example.ts.net')
    assert.equal(config.port, 44100)
    assert.equal(config.sessionSecret, 'test-session-secret-at-least-16')
    assert.ok(config.libraryExtensions.includes('mp3'))
    assert.ok(config.librarySkipDirs.some((name) => name.toLowerCase() === '@eadir'))
    assert.deepEqual(config.libraryScanGlobs, [])
  })

  it('overrides Library membership lists from env', () => {
    let config = loadConfig(
      productionEnv({
        LIBRARY_EXTENSIONS: 'mp3, flac',
        LIBRARY_SKIP_DIRS: 'Artwork,Scans',
        LIBRARY_SCAN_GLOBS: 'Radiohead/**',
      }),
    )
    assert.deepEqual(config.libraryExtensions, ['mp3', 'flac'])
    assert.deepEqual(config.librarySkipDirs, ['Artwork', 'Scans'])
    assert.deepEqual(config.libraryScanGlobs, ['Radiohead/**'])
  })

  it('uses only SPINBOX_PUBLIC_URL for the origin, not Host or X-Forwarded-*', () => {
    let config = loadConfig(
      productionEnv({
        SPINBOX_PUBLIC_URL: 'https://spinbox.example.ts.net',
      }),
    )
    let request = new Request('http://evil.example/', {
      headers: {
        Host: 'evil.example',
        'X-Forwarded-Host': 'spoof.example',
        'X-Forwarded-Proto': 'https',
      },
    })

    assert.equal(publicOrigin(config), 'https://spinbox.example.ts.net')
    assert.notEqual(new URL(request.url).origin, publicOrigin(config))
  })

  it('defaults LIBRARY_ROOT and SPINBOX_DATA_DIR to local folders in development', () => {
    let config = loadConfig({ NODE_ENV: 'development' })

    assert.equal(config.libraryRoot, path.resolve('data/library'))
    assert.equal(config.dataDir, path.resolve('data/app'))
    assert.ok(path.isAbsolute(config.libraryRoot))
    assert.ok(path.isAbsolute(config.dataDir))
    assert.equal(config.port, 44100)
    assert.equal(config.publicUrl.origin, 'http://127.0.0.1:44100')
    assert.ok(config.sessionSecret.length >= 16)
  })
})
