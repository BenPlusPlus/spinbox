import { afterEach, describe, it } from 'node:test'
import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'

import * as assert from 'remix/assert'

import { openDatabase, type AppDatabase } from '../app/data/index.ts'
import {
  createFirstAdmin,
  mintInvite,
  redeemInvite,
  type HouseholdMember,
} from '../app/modules/auth/index.ts'
import { loadConfig, type AppConfig } from '../app/modules/config/index.ts'
import {
  findTrackById,
  findTrackByPath,
  getScanStatus,
  isLibraryMember,
  LibraryError,
  listTracks,
  resolveTrackMetadata,
  startScan,
  type ScanAdapter,
  type StartScanResult,
} from '../app/modules/library/index.ts'

const FIXTURE_LIBRARY = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  'fixtures',
  'library',
)

describe('library membership gates', () => {
  it('accepts an allowlisted audio file under Artist/Album', () => {
    assert.equal(isLibraryMember('Radiohead/OK Computer/01 - Airbag.mp3'), true)
    assert.equal(isLibraryMember('Radiohead/OK Computer/02 - Paranoid Android.FLAC'), true)
    assert.equal(isLibraryMember('Artist/Album/track.m4a'), true)
    assert.equal(isLibraryMember('Artist/Album/track.opus'), true)
  })

  it('rejects sidecars, lyrics, playlists, and other non-audio files', () => {
    assert.equal(isLibraryMember('Radiohead/OK Computer/cover.jpg'), false)
    assert.equal(isLibraryMember('Radiohead/OK Computer/folder.png'), false)
    assert.equal(isLibraryMember('Radiohead/OK Computer/01 - Airbag.lrc'), false)
    assert.equal(isLibraryMember('Radiohead/OK Computer/notes.txt'), false)
    assert.equal(isLibraryMember('Radiohead/OK Computer/album.m3u'), false)
    assert.equal(isLibraryMember('Radiohead/OK Computer/disc.cue'), false)
  })

  it('rejects hidden and junk basenames', () => {
    assert.equal(isLibraryMember('Radiohead/OK Computer/.hidden.mp3'), false)
    assert.equal(isLibraryMember('Radiohead/OK Computer/._Airbag.mp3'), false)
    assert.equal(isLibraryMember('Radiohead/OK Computer/Thumbs.db'), false)
    assert.equal(isLibraryMember('Radiohead/OK Computer/desktop.ini'), false)
  })

  it('rejects paths under skipped directory segments, including any dot-prefixed directory', () => {
    assert.equal(isLibraryMember('@eaDir/thumb.mp3'), false)
    assert.equal(isLibraryMember('Radiohead/@eadir/thumb.mp3'), false)
    assert.equal(isLibraryMember('#recycle/deleted.mp3'), false)
    assert.equal(isLibraryMember('Artist/#snapshot/old.mp3'), false)
    assert.equal(isLibraryMember('.SyncArchive/copy.mp3'), false)
    assert.equal(isLibraryMember('lost+found/orphan.mp3'), false)
    assert.equal(isLibraryMember('.hidden-folder/secret.mp3'), false)
    assert.equal(isLibraryMember('Artist/.git/track.mp3'), false)
  })

  it('rejects a symlink even when the extension is allowlisted', () => {
    assert.equal(isLibraryMember('Artist/Album/linked.mp3', { symlink: true }), false)
  })

  it('hides a file without deleting it by renaming off the allowlist', () => {
    assert.equal(isLibraryMember('Artist/Album/song.mp3.bak'), false)
    assert.equal(isLibraryMember('Artist/Album/song.hidden'), false)
  })
})

describe('track metadata resolution', () => {
  it('falls back to Plex-style path when tags are absent', () => {
    let resolved = resolveTrackMetadata('Radiohead/OK Computer/01 - Airbag.mp3')

    assert.equal(resolved.title, 'Airbag')
    assert.equal(resolved.artist, 'Radiohead')
    assert.equal(resolved.album, 'OK Computer')
    assert.equal(resolved.albumArtist, 'Radiohead')
    assert.equal(resolved.trackNumber, 1)
    assert.equal(resolved.discNumber, null)
  })

  it('uses Unknown artist, Unknown album, and the filename stem when path parts are missing', () => {
    let loose = resolveTrackMetadata('untitled.flac')

    assert.equal(loose.title, 'untitled')
    assert.equal(loose.artist, 'Unknown artist')
    assert.equal(loose.album, 'Unknown album')
    assert.equal(loose.albumArtist, 'Unknown artist')
    assert.equal(loose.trackNumber, null)
    assert.equal(loose.discNumber, null)

    let artistOnly = resolveTrackMetadata('Nico/these-days.mp3')
    assert.equal(artistOnly.title, 'these-days')
    assert.equal(artistOnly.artist, 'Nico')
    assert.equal(artistOnly.album, 'Unknown album')
    assert.equal(artistOnly.albumArtist, 'Nico')
  })

  it('reads disc and track numbers from Plex disc-prefixed filenames and Disc N folders', () => {
    let plexDisc = resolveTrackMetadata('Pink Floyd/The Wall/302 - Another Brick.mp3')
    assert.equal(plexDisc.title, 'Another Brick')
    assert.equal(plexDisc.discNumber, 3)
    assert.equal(plexDisc.trackNumber, 2)

    let discFolder = resolveTrackMetadata('Pink Floyd/The Wall/Disc 2/01 - Hey You.mp3')
    assert.equal(discFolder.title, 'Hey You')
    assert.equal(discFolder.album, 'The Wall')
    assert.equal(discFolder.artist, 'Pink Floyd')
    assert.equal(discFolder.discNumber, 2)
    assert.equal(discFolder.trackNumber, 1)
  })

  it('prefers non-empty tags over path, including album artist on compilations', () => {
    let resolved = resolveTrackMetadata('Wrong Artist/Wrong Album/99 - Wrong Title.mp3', {
      title: 'Airbag',
      artist: 'Radiohead',
      album: 'OK Computer',
      albumArtist: 'Radiohead',
      trackNumber: 1,
      discNumber: 1,
    })

    assert.equal(resolved.title, 'Airbag')
    assert.equal(resolved.artist, 'Radiohead')
    assert.equal(resolved.album, 'OK Computer')
    assert.equal(resolved.albumArtist, 'Radiohead')
    assert.equal(resolved.trackNumber, 1)
    assert.equal(resolved.discNumber, 1)

    let compilation = resolveTrackMetadata('Various Artists/Now 1/01 - Guest Hit.mp3', {
      artist: 'Blur',
      album: 'Now 1',
      albumArtist: 'Various Artists',
    })
    assert.equal(compilation.artist, 'Blur')
    assert.equal(compilation.albumArtist, 'Various Artists')
    assert.equal(compilation.title, 'Guest Hit')
  })

  it('ignores empty tags and falls back field-by-field', () => {
    let resolved = resolveTrackMetadata('Nico/Chelsea Girl/01 - These Days.mp3', {
      title: '  ',
      artist: '',
      album: 'Chelsea Girl',
    })

    assert.equal(resolved.title, 'These Days')
    assert.equal(resolved.artist, 'Nico')
    assert.equal(resolved.album, 'Chelsea Girl')
    assert.equal(resolved.albumArtist, 'Nico')
    assert.equal(resolved.trackNumber, 1)
  })
})

describe('Scan run', () => {
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

  async function freshLibrary(overrides: Record<string, string | undefined> = {}) {
    tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'spinbox-library-'))
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
    let admin = await createFirstAdmin(database, {
      email: 'ada@example.com',
      password: 'correct-horse',
      displayName: 'Ada',
    })
    return { config, database, admin, libraryRoot }
  }

  it('indexes allowlisted Tracks from a Library tree and skips junk', async () => {
    let { config, database: db, admin, libraryRoot } = await freshLibrary()
    await writeTree(libraryRoot, {
      'Radiohead/OK Computer/01 - Airbag.mp3': '',
      'Radiohead/OK Computer/cover.jpg': '',
      'Radiohead/OK Computer/01 - Airbag.lrc': '',
      'Pink Floyd/The Wall/Disc 2/01 - Hey You.flac': '',
      '@eaDir/thumb.mp3': '',
      '#recycle/deleted.mp3': '',
      '.hidden-folder/secret.mp3': '',
      'Artist/Album/.hidden.mp3': '',
      'Artist/Album/Thumbs.db': '',
      'Artist/Album/song.mp3.bak': '',
    })

    await runScanToIdle(db, config, admin)

    let tracks = listTracks(db)
    assert.deepEqual(
      tracks.map((track) => track.path).sort(),
      ['Pink Floyd/The Wall/Disc 2/01 - Hey You.flac', 'Radiohead/OK Computer/01 - Airbag.mp3'],
    )

    let airbag = findTrackByPath(db, 'Radiohead/OK Computer/01 - Airbag.mp3')
    assert.ok(airbag)
    assert.equal(airbag.title, 'Airbag')
    assert.equal(airbag.artist, 'Radiohead')
    assert.equal(airbag.album, 'OK Computer')
    assert.equal(airbag.albumArtist, 'Radiohead')
    assert.equal(airbag.trackNumber, 1)
    assert.equal(airbag.mime, 'audio/mpeg')
    assert.match(airbag.id, /^[A-Za-z0-9_-]+$/)
    assert.equal(findTrackById(db, airbag.id)?.path, airbag.path)

    let heyYou = findTrackByPath(db, 'Pink Floyd/The Wall/Disc 2/01 - Hey You.flac')
    assert.ok(heyYou)
    assert.equal(heyYou.album, 'The Wall')
    assert.equal(heyYou.discNumber, 2)
    assert.equal(heyYou.mime, 'audio/flac')
  })

  it('keeps a stable opaque Track id when the same path is re-scanned', async () => {
    let { config, database: db, admin, libraryRoot } = await freshLibrary()
    await writeTree(libraryRoot, { 'Artist/Album/01 - Song.mp3': '' })

    await runScanToIdle(db, config, admin)
    let original = findTrackByPath(db, 'Artist/Album/01 - Song.mp3')
    assert.ok(original)

    await runScanToIdle(db, config, admin)
    let again = findTrackByPath(db, 'Artist/Album/01 - Song.mp3')
    assert.ok(again)
    assert.equal(again.id, original.id)
  })

  it('prefers embedded tags over path during a Scan run', async () => {
    let { config, database: db, admin, libraryRoot } = await freshLibrary()
    let filePath = path.join(libraryRoot, 'Wrong Artist', 'Wrong Album', '99 - Wrong Title.mp3')
    await fs.mkdir(path.dirname(filePath), { recursive: true })
    await fs.writeFile(
      filePath,
      taggedMp3({
        title: 'Airbag',
        artist: 'Radiohead',
        album: 'OK Computer',
        albumArtist: 'Radiohead',
      }),
    )

    await runScanToIdle(db, config, admin)

    let track = findTrackByPath(db, 'Wrong Artist/Wrong Album/99 - Wrong Title.mp3')
    assert.ok(track)
    assert.equal(track.title, 'Airbag')
    assert.equal(track.artist, 'Radiohead')
    assert.equal(track.album, 'OK Computer')
    assert.equal(track.albumArtist, 'Radiohead')
  })

  it('skips re-parse when mtime and size are unchanged, and re-parses when they change', async () => {
    let { config, database: db, admin, libraryRoot } = await freshLibrary()
    let filePath = path.join(libraryRoot, 'Artist', 'Album', '01 - Song.mp3')
    await fs.mkdir(path.dirname(filePath), { recursive: true })
    await fs.writeFile(
      filePath,
      taggedMp3({ title: 'Original', artist: 'First', album: 'Debut' }),
    )
    let stat = await fs.stat(filePath)

    await runScanToIdle(db, config, admin)
    assert.equal(findTrackByPath(db, 'Artist/Album/01 - Song.mp3')?.title, 'Original')

    await fs.writeFile(
      filePath,
      taggedMp3({ title: 'Retitled', artist: 'First', album: 'Debut' }),
    )
    await fs.utimes(filePath, stat.atime, stat.mtime)
    let restored = await fs.stat(filePath)
    if (restored.size !== stat.size) {
      throw new Error('fixture tags must keep the same file size for the incremental skip case')
    }

    await runScanToIdle(db, config, admin)
    assert.equal(findTrackByPath(db, 'Artist/Album/01 - Song.mp3')?.title, 'Original')

    await fs.writeFile(
      filePath,
      taggedMp3({ title: 'Changed!', artist: 'First', album: 'Debut' }),
    )
    await runScanToIdle(db, config, admin)
    assert.equal(findTrackByPath(db, 'Artist/Album/01 - Song.mp3')?.title, 'Changed!')
  })

  it('prunes missing paths only after a successful full walk', async () => {
    let { config, database: db, admin } = await freshLibrary()
    let files = new Map([
      ['Artist/Album/01 - Keep.mp3', { mtimeMs: 1, size: 10 }],
      ['Artist/Album/02 - Drop.mp3', { mtimeMs: 1, size: 10 }],
    ])

    await runScanToIdle(db, config, admin, { adapter: memoryAdapter(files) })
    assert.equal(listTracks(db).length, 2)

    files.delete('Artist/Album/02 - Drop.mp3')
    let failed = await startScan(db, config, admin, {
      adapter: {
        async *walk() {
          yield {
            relativePath: 'Artist/Album/01 - Keep.mp3',
            mtimeMs: 1,
            size: 10,
            symlink: false,
          }
          throw new Error('walk interrupted')
        },
      },
    })
    await waitForScan(failed)
    assert.deepEqual(
      listTracks(db)
        .map((track) => track.path)
        .sort(),
      ['Artist/Album/01 - Keep.mp3', 'Artist/Album/02 - Drop.mp3'],
    )
    let failedStatus = getScanStatus(db)
    assert.equal(failedStatus.state, 'idle')
    assert.equal(failedStatus.lastResult?.outcome, 'failed')

    await runScanToIdle(db, config, admin, { adapter: memoryAdapter(files) })
    assert.deepEqual(
      listTracks(db).map((track) => track.path),
      ['Artist/Album/01 - Keep.mp3'],
    )
    let okStatus = getScanStatus(db)
    assert.equal(okStatus.lastResult?.outcome, 'succeeded')
    assert.equal(okStatus.lastResult?.tracksPruned, 1)
  })

  it('rejects a non-Admin and no-ops a second start while a Scan run is active', async () => {
    let { config, database: db, admin } = await freshLibrary()
    let minted = await mintInvite(db, admin, {})
    let member = await redeemInvite(db, {
      token: minted.token,
      email: 'ben@example.com',
      password: 'household-pass',
    })

    await assert.rejects(
      () => startScan(db, config, member),
      (error: unknown) => {
        assert.ok(error instanceof LibraryError)
        assert.equal(error.code, 'not_admin')
        return true
      },
    )

    let release!: () => void
    let gate = new Promise<void>((resolve) => {
      release = resolve
    })
    let first = await startScan(db, config, admin, {
      adapter: {
        async *walk() {
          await gate
        },
      },
    })
    assert.equal(first.ok, true)
    assert.equal(getScanStatus(db).state, 'running')

    let second = await startScan(db, config, admin)
    assert.equal(second.ok, false)
    if (!second.ok) {
      assert.equal(second.reason, 'already_running')
    }

    release()
    await waitForScan(first)
    assert.equal(getScanStatus(db).state, 'idle')
  })

  it('returns from startScan before the walk finishes', async () => {
    let { config, database: db, admin } = await freshLibrary()
    let release!: () => void
    let gate = new Promise<void>((resolve) => {
      release = resolve
    })

    let started = await startScan(db, config, admin, {
      adapter: {
        async *walk() {
          await gate
        },
      },
    })
    assert.equal(started.ok, true)
    assert.equal(getScanStatus(db).state, 'running')

    release()
    await waitForScan(started)
  })

  it('limits a Scan run to configured path globs without pruning Tracks outside the scope', async () => {
    let { config, database: db, admin, libraryRoot } = await freshLibrary()
    await writeTree(libraryRoot, {
      'Radiohead/OK Computer/01 - Airbag.mp3': '',
      'Nico/Chelsea Girl/01 - These Days.mp3': '',
    })
    await runScanToIdle(db, config, admin)
    assert.equal(listTracks(db).length, 2)

    await fs.rm(path.join(libraryRoot, 'Radiohead'), { recursive: true, force: true })
    let scoped = loadConfig({
      NODE_ENV: 'production',
      LIBRARY_ROOT: libraryRoot,
      SPINBOX_DATA_DIR: config.dataDir,
      SPINBOX_PUBLIC_URL: 'https://spinbox.example.ts.net',
      PORT: '44100',
      SESSION_SECRET: 'test-session-secret-at-least-16',
      LIBRARY_SCAN_GLOBS: 'Radiohead/**',
    })
    await runScanToIdle(db, scoped, admin)
    assert.deepEqual(
      listTracks(db)
        .map((track) => track.path)
        .sort(),
      ['Nico/Chelsea Girl/01 - These Days.mp3'],
    )
  })

  it('scans the committed fixture Library and ignores non-member files', async () => {
    let { config, database: db, admin } = await freshLibrary({
      LIBRARY_ROOT: FIXTURE_LIBRARY,
    })

    await runScanToIdle(db, config, admin)

    let paths = listTracks(db)
      .map((track) => track.path)
      .sort()
    assert.deepEqual(paths, [
      'Pink Floyd/The Wall/Disc 1/01 - In the Flesh.flac',
      'Pink Floyd/The Wall/Disc 2/01 - Hey You.flac',
      'Radiohead/OK Computer/01 - Airbag.mp3',
      'Various Artists/Now 1/01 - Guest Hit.m4a',
    ])
  })
})

async function runScanToIdle(
  database: AppDatabase,
  config: AppConfig,
  admin: HouseholdMember,
  options: { adapter?: ScanAdapter } = {},
) {
  let started = await startScan(database, config, admin, options)
  await waitForScan(started)
}

async function waitForScan(result: StartScanResult) {
  assert.equal(result.ok, true)
  if (!result.ok) {
    throw new Error('expected Scan run to start')
  }
  await result.done
}

function memoryAdapter(
  files: Map<string, { mtimeMs: number; size: number }>,
): ScanAdapter {
  return {
    async *walk() {
      for (let [relativePath, file] of files) {
        yield { relativePath, ...file, symlink: false }
      }
    },
  }
}

async function writeTree(root: string, files: Record<string, string | Uint8Array>) {
  for (let [relativePath, contents] of Object.entries(files)) {
    let absolute = path.join(root, ...relativePath.split('/'))
    await fs.mkdir(path.dirname(absolute), { recursive: true })
    await fs.writeFile(absolute, contents)
  }
}

function taggedMp3(tags: {
  title: string
  artist: string
  album: string
  albumArtist?: string
}): Buffer {
  let frames = [
    id3TextFrame('TIT2', tags.title),
    id3TextFrame('TPE1', tags.artist),
    id3TextFrame('TALB', tags.album),
  ]
  if (tags.albumArtist) {
    frames.push(id3TextFrame('TPE2', tags.albumArtist))
  }
  let body = Buffer.concat(frames)
  let header = Buffer.alloc(10)
  header.write('ID3', 0, 'ascii')
  header[3] = 3
  header[4] = 0
  header[5] = 0
  let size = body.length
  header[6] = (size >>> 21) & 0x7f
  header[7] = (size >>> 14) & 0x7f
  header[8] = (size >>> 7) & 0x7f
  header[9] = size & 0x7f
  return Buffer.concat([header, body])
}

function id3TextFrame(id: string, value: string): Buffer {
  let payload = Buffer.concat([Buffer.from([3]), Buffer.from(value, 'utf8')])
  let frame = Buffer.alloc(10 + payload.length)
  frame.write(id, 0, 'ascii')
  frame.writeUInt32BE(payload.length, 4)
  payload.copy(frame, 10)
  return frame
}
