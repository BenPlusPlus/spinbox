import { afterEach, describe, it } from 'node:test'
import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'

import * as assert from 'remix/assert'

import { openDatabase, type AppDatabase } from '../app/data/index.ts'
import {
  createFirstAdmin,
  mintInvite,
  redeemInvite,
  type HouseholdMember,
} from '../app/modules/auth/index.ts'
import { loadConfig, type AppConfig } from '../app/modules/config/index.ts'
import { startScan, type ScanAdapter, type StartScanResult } from '../app/modules/library/index.ts'
import {
  addTrackToPlaylist,
  createPlaylist,
  deletePlaylist,
  getPlaylist,
  listPlaylists,
  playableTrackIds,
  removePlaylistEntry,
  renamePlaylist,
  reorderPlaylistEntry,
  searchOwnPlaylists,
} from '../app/modules/playlists/index.ts'

describe('Playlists', () => {
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

  async function freshPlaylists() {
    tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'spinbox-playlists-'))
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
    let member = await createFirstAdmin(database, {
      email: 'ada@example.com',
      password: 'correct-horse',
      displayName: 'Ada',
    })
    return { config, database, member }
  }

  it('lets a Household member create an empty Playlist and list only their own', async () => {
    let { database: db, member } = await freshPlaylists()
    let minted = await mintInvite(db, member, {})
    let other = await redeemInvite(db, {
      token: minted.token,
      email: 'ben@example.com',
      password: 'household-pass',
    })

    let created = createPlaylist(db, member, 'Late night')
    createPlaylist(db, other, 'Ben only')

    assert.equal(created.name, 'Late night')
    assert.deepEqual(created.entries, [])
    assert.deepEqual(
      listPlaylists(db, member).map((playlist) => playlist.name),
      ['Late night'],
    )
    assert.deepEqual(
      listPlaylists(db, other).map((playlist) => playlist.name),
      ['Ben only'],
    )
  })

  it('opens, renames, and deletes an owned Playlist', async () => {
    let { database: db, member } = await freshPlaylists()
    let created = createPlaylist(db, member, 'Late night')

    let opened = getPlaylist(db, member, created.id)
    assert.equal(opened?.name, 'Late night')
    assert.deepEqual(opened?.entries, [])

    let renamed = renamePlaylist(db, member, created.id, '  Dawn  ')
    assert.equal(renamed.name, 'Dawn')
    assert.equal(getPlaylist(db, member, created.id)?.name, 'Dawn')

    deletePlaylist(db, member, created.id)
    assert.equal(getPlaylist(db, member, created.id), null)
    assert.deepEqual(listPlaylists(db, member), [])
  })

  it('adds ordered Tracks and lets the owner reorder or remove them', async () => {
    let { database: db, member } = await freshPlaylists()
    insertTrack(db, { id: 'airbag', title: 'Airbag', album: 'OK Computer' })
    insertTrack(db, { id: 'flesh', title: 'In the Flesh', album: 'The Wall' })
    insertTrack(db, { id: 'hey-you', title: 'Hey You', album: 'The Wall' })
    let playlist = createPlaylist(db, member, 'Wall +')

    addTrackToPlaylist(db, member, playlist.id, 'flesh')
    addTrackToPlaylist(db, member, playlist.id, 'hey-you')
    addTrackToPlaylist(db, member, playlist.id, 'airbag')

    assert.deepEqual(entryIds(getPlaylist(db, member, playlist.id)), ['flesh', 'hey-you', 'airbag'])

    reorderPlaylistEntry(db, member, playlist.id, 2, 0)
    assert.deepEqual(entryIds(getPlaylist(db, member, playlist.id)), ['airbag', 'flesh', 'hey-you'])

    removePlaylistEntry(db, member, playlist.id, 1)
    let remaining = getPlaylist(db, member, playlist.id)
    assert.deepEqual(entryIds(remaining), ['airbag', 'hey-you'])
    assert.deepEqual(
      remaining?.entries.map((entry) => entry.position),
      [0, 1],
    )
    assert.equal(listPlaylists(db, member)[0]?.trackCount, 2)
    addTrackToPlaylist(db, member, playlist.id, 'airbag')
    assert.deepEqual(playableTrackIds(getPlaylist(db, member, playlist.id)!), [
      'airbag',
      'hey-you',
      'airbag',
    ])
  })

  it('does not let another Household member open or change a Playlist', async () => {
    let { database: db, member } = await freshPlaylists()
    insertTrack(db, { id: 'airbag', title: 'Airbag', album: 'OK Computer' })
    let minted = await mintInvite(db, member, {})
    let other = await redeemInvite(db, {
      token: minted.token,
      email: 'ben@example.com',
      password: 'household-pass',
    })
    let playlist = createPlaylist(db, member, 'Late night')
    addTrackToPlaylist(db, member, playlist.id, 'airbag')

    assert.equal(getPlaylist(db, other, playlist.id), null)
    assert.throws(
      () => renamePlaylist(db, other, playlist.id, 'Stolen'),
      (error: unknown) => error instanceof Error && error.name === 'PlaylistError',
    )
    assert.throws(
      () => addTrackToPlaylist(db, other, playlist.id, 'airbag'),
      (error: unknown) => error instanceof Error && error.name === 'PlaylistError',
    )
    assert.equal(getPlaylist(db, member, playlist.id)?.name, 'Late night')
    assert.deepEqual(entryIds(getPlaylist(db, member, playlist.id)), ['airbag'])
  })

  it('keeps a Missing track after a successful Scan run prunes the path and skips it on play', async () => {
    let { database: db, member, config } = await freshPlaylists()
    let files = new Map([
      ['Artist/Album/01 - Keep.mp3', { mtimeMs: 1, size: 10 }],
      ['Artist/Album/02 - Drop.mp3', { mtimeMs: 1, size: 10 }],
    ])
    await runScanToIdle(db, config, member, { adapter: memoryAdapter(files) })
    let keep = db.sqlite
      .prepare(`SELECT id FROM tracks WHERE path = ?`)
      .get('Artist/Album/01 - Keep.mp3') as { id: string }
    let drop = db.sqlite
      .prepare(`SELECT id FROM tracks WHERE path = ?`)
      .get('Artist/Album/02 - Drop.mp3') as { id: string }

    let playlist = createPlaylist(db, member, 'Mixed')
    addTrackToPlaylist(db, member, playlist.id, keep.id)
    addTrackToPlaylist(db, member, playlist.id, drop.id)
    addTrackToPlaylist(db, member, playlist.id, keep.id)

    files.delete('Artist/Album/02 - Drop.mp3')
    await runScanToIdle(db, config, member, { adapter: memoryAdapter(files) })

    let after = getPlaylist(db, member, playlist.id)
    assert.equal(after?.entries.length, 3)
    assert.equal(after?.entries[0]?.missing, false)
    assert.equal(after?.entries[0]?.track?.id, keep.id)
    assert.equal(after?.entries[1]?.missing, true)
    assert.equal(after?.entries[1]?.title, 'Drop')
    assert.equal(after?.entries[1]?.track, null)
    assert.equal(after?.entries[2]?.missing, false)
    assert.deepEqual(playableTrackIds(after!), [keep.id, keep.id])
    assert.deepEqual(playableTrackIds(after!, 1), [keep.id])
  })

  it('searches only the member’s own Playlist names', async () => {
    let { database: db, member } = await freshPlaylists()
    let minted = await mintInvite(db, member, {})
    let other = await redeemInvite(db, {
      token: minted.token,
      email: 'ben@example.com',
      password: 'household-pass',
    })
    createPlaylist(db, member, 'Late night mixes')
    createPlaylist(db, member, 'Morning')
    createPlaylist(db, other, 'Late night Ben')

    assert.deepEqual(
      searchOwnPlaylists(db, member, 'late').map((playlist) => playlist.name),
      ['Late night mixes'],
    )
    assert.deepEqual(searchOwnPlaylists(db, member, 'none'), [])
  })
})

function entryIds(playlist: { entries: { track: { id: string } | null }[] } | null) {
  return (playlist?.entries ?? []).map((entry) => entry.track?.id)
}

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

function memoryAdapter(files: Map<string, { mtimeMs: number; size: number }>): ScanAdapter {
  return {
    async *walk() {
      for (let [relativePath, file] of files) {
        yield { relativePath, ...file, symlink: false }
      }
    },
  }
}

function insertTrack(
  database: AppDatabase,
  input: { id: string; title: string; album?: string; artist?: string },
) {
  let now = new Date().toISOString()
  database.sqlite
    .prepare(
      `INSERT INTO tracks (
         id, path, title, artist, album, album_artist, disc_number, track_number,
         duration_ms, mime, mtime_ms, size, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      input.id,
      `Artist/${input.album ?? 'Album'}/${input.id}.mp3`,
      input.title,
      input.artist ?? 'Radiohead',
      input.album ?? 'Album',
      input.artist ?? 'Radiohead',
      null,
      null,
      null,
      'audio/mpeg',
      Date.now(),
      1,
      now,
    )
  return { id: input.id, title: input.title }
}
