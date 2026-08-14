import { afterEach, describe, it } from 'node:test'
import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'

import * as assert from 'remix/assert'

import { openDatabase, type AppDatabase } from '../app/data/index.ts'
import { createFirstAdmin, mintInvite, redeemInvite } from '../app/modules/auth/index.ts'
import { loadConfig } from '../app/modules/config/index.ts'
import {
  addToQueue,
  clearAll,
  clearUpcoming,
  getListeningSession,
  continueListening,
  getListenResume,
  listRecentlyPlayed,
  playIntoSession,
  playNext,
  removeFromQueue,
  reorderQueue,
  skipNext,
  skipPrevious,
  updateListeningSession,
} from '../app/modules/playback/index.ts'

describe('Listening session', () => {
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

  async function freshPlayback() {
    tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'spinbox-playback-'))
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
    return { database, member }
  }

  it('gives each Household member one empty Listening session', async () => {
    let { database: db, member } = await freshPlayback()

    let session = getListeningSession(db, member)

    assert.equal(session.currentTrack, null)
    assert.equal(session.playheadMs, 0)
    assert.equal(session.playing, false)
    assert.equal(session.shuffle, false)
    assert.equal(session.repeat, 'off')
    assert.deepEqual(session.queue, [])
  })

  it('replaces the Play queue with a lone Track and plays it', async () => {
    let { database: db, member } = await freshPlayback()
    let airbag = insertTrack(db, { id: 'airbag', title: 'Airbag', album: 'OK Computer' })

    let session = playIntoSession(db, member, { trackIds: [airbag.id] })

    assert.equal(session.currentTrack?.id, 'airbag')
    assert.equal(session.currentTrack?.title, 'Airbag')
    assert.deepEqual(
      session.queue.map((track) => track.id),
      [],
    )
    assert.equal(session.playing, true)
    assert.equal(session.playheadMs, 0)
    assert.equal(getListeningSession(db, member).currentTrack?.id, 'airbag')
  })

  it('replaces the Play queue with a container and plays from the start', async () => {
    let { database: db, member } = await freshPlayback()
    let flesh = insertTrack(db, { id: 'flesh', title: 'In the Flesh', album: 'The Wall' })
    let heyYou = insertTrack(db, { id: 'hey-you', title: 'Hey You', album: 'The Wall' })
    insertTrack(db, { id: 'airbag', title: 'Airbag', album: 'OK Computer' })
    playIntoSession(db, member, { trackIds: ['airbag'] })

    let session = playIntoSession(db, member, { trackIds: [flesh.id, heyYou.id] })

    assert.equal(session.currentTrack?.id, 'flesh')
    assert.deepEqual(
      session.queue.map((track) => track.id),
      ['hey-you'],
    )
    assert.equal(session.playing, true)
    assert.equal(session.playheadMs, 0)
  })

  it('plays a container from the tapped Track in container order', async () => {
    let { database: db, member } = await freshPlayback()
    let flesh = insertTrack(db, { id: 'flesh', title: 'In the Flesh', album: 'The Wall' })
    let heyYou = insertTrack(db, { id: 'hey-you', title: 'Hey You', album: 'The Wall' })
    let comfort = insertTrack(db, { id: 'comfort', title: 'Comfortably Numb', album: 'The Wall' })

    let session = playIntoSession(db, member, {
      trackIds: [flesh.id, heyYou.id, comfort.id],
      startAt: 1,
    })

    assert.equal(session.currentTrack?.id, 'hey-you')
    assert.deepEqual(
      session.queue.map((track) => track.id),
      ['comfort'],
    )
  })

  it('inserts Play next at the front of the Play queue', async () => {
    let { database: db, member } = await freshPlayback()
    insertTrack(db, { id: 'flesh', title: 'In the Flesh', album: 'The Wall' })
    insertTrack(db, { id: 'hey-you', title: 'Hey You', album: 'The Wall' })
    insertTrack(db, { id: 'airbag', title: 'Airbag', album: 'OK Computer' })
    playIntoSession(db, member, { trackIds: ['flesh', 'hey-you'] })

    let session = playNext(db, member, 'airbag')

    assert.equal(session.currentTrack?.id, 'flesh')
    assert.deepEqual(
      session.queue.map((track) => track.id),
      ['airbag', 'hey-you'],
    )
    assert.equal(session.playing, true)
  })

  it('appends Add to queue at the end of the Play queue', async () => {
    let { database: db, member } = await freshPlayback()
    insertTrack(db, { id: 'flesh', title: 'In the Flesh', album: 'The Wall' })
    insertTrack(db, { id: 'hey-you', title: 'Hey You', album: 'The Wall' })
    insertTrack(db, { id: 'airbag', title: 'Airbag', album: 'OK Computer' })
    playIntoSession(db, member, { trackIds: ['flesh', 'hey-you'] })

    let session = addToQueue(db, member, 'airbag')

    assert.equal(session.currentTrack?.id, 'flesh')
    assert.deepEqual(
      session.queue.map((track) => track.id),
      ['hey-you', 'airbag'],
    )
  })

  it('skips next to the first Play queue Track and records Recently played', async () => {
    let { database: db, member } = await freshPlayback()
    insertTrack(db, { id: 'flesh', title: 'In the Flesh', album: 'The Wall' })
    insertTrack(db, { id: 'hey-you', title: 'Hey You', album: 'The Wall' })
    insertTrack(db, { id: 'airbag', title: 'Airbag', album: 'OK Computer' })
    playIntoSession(db, member, { trackIds: ['flesh', 'hey-you', 'airbag'] })
    updateListeningSession(db, member, { playheadMs: 4_000 })

    let session = skipNext(db, member)

    assert.equal(session.currentTrack?.id, 'hey-you')
    assert.equal(session.playheadMs, 0)
    assert.equal(session.playing, true)
    assert.deepEqual(
      session.queue.map((track) => track.id),
      ['airbag'],
    )
    assert.deepEqual(
      listRecentlyPlayed(db, member).map((track) => track.id),
      ['hey-you', 'flesh'],
    )
  })

  it('stays on the current Track and pauses when skip next has no upcoming and repeat is off', async () => {
    let { database: db, member } = await freshPlayback()
    insertTrack(db, { id: 'airbag', title: 'Airbag', album: 'OK Computer' })
    playIntoSession(db, member, { trackIds: ['airbag'] })
    updateListeningSession(db, member, { playheadMs: 8_000 })

    let session = skipNext(db, member)

    assert.equal(session.currentTrack?.id, 'airbag')
    assert.equal(session.playing, false)
    assert.equal(session.playheadMs, 8_000)
    assert.deepEqual(session.queue, [])
  })

  it('restarts the current Track when skip next has no upcoming and repeat is all', async () => {
    let { database: db, member } = await freshPlayback()
    insertTrack(db, { id: 'airbag', title: 'Airbag', album: 'OK Computer' })
    playIntoSession(db, member, { trackIds: ['airbag'] })
    updateListeningSession(db, member, { playheadMs: 8_000, repeat: 'all' })

    let session = skipNext(db, member)

    assert.equal(session.currentTrack?.id, 'airbag')
    assert.equal(session.playing, true)
    assert.equal(session.playheadMs, 0)
  })

  it('restarts the current Track on skip previous', async () => {
    let { database: db, member } = await freshPlayback()
    insertTrack(db, { id: 'flesh', title: 'In the Flesh', album: 'The Wall' })
    insertTrack(db, { id: 'hey-you', title: 'Hey You', album: 'The Wall' })
    playIntoSession(db, member, { trackIds: ['flesh', 'hey-you'] })
    updateListeningSession(db, member, { playheadMs: 12_000 })

    let session = skipPrevious(db, member)

    assert.equal(session.currentTrack?.id, 'flesh')
    assert.equal(session.playheadMs, 0)
    assert.equal(session.playing, true)
    assert.deepEqual(
      session.queue.map((track) => track.id),
      ['hey-you'],
    )
  })

  it('removes an upcoming Play queue Track by position', async () => {
    let { database: db, member } = await freshPlayback()
    insertTrack(db, { id: 'flesh', title: 'In the Flesh', album: 'The Wall' })
    insertTrack(db, { id: 'hey-you', title: 'Hey You', album: 'The Wall' })
    insertTrack(db, { id: 'airbag', title: 'Airbag', album: 'OK Computer' })
    playIntoSession(db, member, { trackIds: ['flesh', 'hey-you', 'airbag'] })

    let session = removeFromQueue(db, member, 0)

    assert.equal(session.currentTrack?.id, 'flesh')
    assert.deepEqual(
      session.queue.map((track) => track.id),
      ['airbag'],
    )
  })

  it('reorders upcoming Play queue Tracks', async () => {
    let { database: db, member } = await freshPlayback()
    insertTrack(db, { id: 'flesh', title: 'In the Flesh', album: 'The Wall' })
    insertTrack(db, { id: 'hey-you', title: 'Hey You', album: 'The Wall' })
    insertTrack(db, { id: 'airbag', title: 'Airbag', album: 'OK Computer' })
    insertTrack(db, { id: 'guest', title: 'Guest Hit', album: 'Now 1' })
    playIntoSession(db, member, { trackIds: ['flesh', 'hey-you', 'airbag', 'guest'] })

    let session = reorderQueue(db, member, 2, 0)

    assert.equal(session.currentTrack?.id, 'flesh')
    assert.deepEqual(
      session.queue.map((track) => track.id),
      ['guest', 'hey-you', 'airbag'],
    )
  })

  it('clears upcoming Play queue Tracks without leaving the current Track', async () => {
    let { database: db, member } = await freshPlayback()
    insertTrack(db, { id: 'flesh', title: 'In the Flesh', album: 'The Wall' })
    insertTrack(db, { id: 'hey-you', title: 'Hey You', album: 'The Wall' })
    playIntoSession(db, member, { trackIds: ['flesh', 'hey-you'] })

    let session = clearUpcoming(db, member)

    assert.equal(session.currentTrack?.id, 'flesh')
    assert.equal(session.playing, true)
    assert.deepEqual(session.queue, [])
  })

  it('clears the Listening session so there is no current Track', async () => {
    let { database: db, member } = await freshPlayback()
    insertTrack(db, { id: 'flesh', title: 'In the Flesh', album: 'The Wall' })
    insertTrack(db, { id: 'hey-you', title: 'Hey You', album: 'The Wall' })
    playIntoSession(db, member, { trackIds: ['flesh', 'hey-you'] })

    let session = clearAll(db, member)

    assert.equal(session.currentTrack, null)
    assert.equal(session.playing, false)
    assert.equal(session.playheadMs, 0)
    assert.deepEqual(session.queue, [])
  })

  it('persists playhead, play/pause, shuffle, and repeat on the Listening session', async () => {
    let { database: db, member } = await freshPlayback()
    insertTrack(db, { id: 'airbag', title: 'Airbag', album: 'OK Computer' })
    playIntoSession(db, member, { trackIds: ['airbag'] })

    let session = updateListeningSession(db, member, {
      playheadMs: 12_345,
      playing: false,
      shuffle: true,
      repeat: 'all',
    })

    assert.equal(session.playheadMs, 12_345)
    assert.equal(session.playing, false)
    assert.equal(session.shuffle, true)
    assert.equal(session.repeat, 'all')
    assert.equal(session.currentTrack?.id, 'airbag')

    let loaded = getListeningSession(db, member)
    assert.equal(loaded.playheadMs, 12_345)
    assert.equal(loaded.shuffle, true)
    assert.equal(loaded.repeat, 'all')
    assert.equal(loaded.playing, false)
  })

  it('lets the later device write win the shared Listening session', async () => {
    let { database: db, member } = await freshPlayback()
    insertTrack(db, { id: 'airbag', title: 'Airbag', album: 'OK Computer' })
    insertTrack(db, { id: 'hey-you', title: 'Hey You', album: 'The Wall' })

    playIntoSession(db, member, { trackIds: ['airbag'] })
    updateListeningSession(db, member, { playheadMs: 1_000 })
    let later = playIntoSession(db, member, { trackIds: ['hey-you'] })

    assert.equal(later.currentTrack?.id, 'hey-you')
    assert.equal(later.playheadMs, 0)
    assert.equal(later.playing, true)
    assert.deepEqual(
      getListeningSession(db, member).queue.map((track) => track.id),
      [],
    )
  })

  it('keeps one Listening session per Household member', async () => {
    let { database: db, member } = await freshPlayback()
    insertTrack(db, { id: 'airbag', title: 'Airbag', album: 'OK Computer' })
    insertTrack(db, { id: 'hey-you', title: 'Hey You', album: 'The Wall' })
    let minted = await mintInvite(db, member, {})
    let other = await redeemInvite(db, {
      token: minted.token,
      email: 'ben@example.com',
      password: 'household-pass',
    })

    playIntoSession(db, member, { trackIds: ['airbag'] })
    playIntoSession(db, other, { trackIds: ['hey-you'] })

    assert.equal(getListeningSession(db, member).currentTrack?.id, 'airbag')
    assert.equal(getListeningSession(db, other).currentTrack?.id, 'hey-you')
  })

  it('shuffles container order and turns shuffle on when play-into-session asks to shuffle', async () => {
    let { database: db, member } = await freshPlayback()
    insertTrack(db, { id: 'a', title: 'A', album: 'Box' })
    insertTrack(db, { id: 'b', title: 'B', album: 'Box' })
    insertTrack(db, { id: 'c', title: 'C', album: 'Box' })

    let session = playIntoSession(db, member, { trackIds: ['a', 'b', 'c'], shuffle: true })

    assert.equal(session.shuffle, true)
    assert.equal(session.playing, true)
    assert.ok(session.currentTrack)
    let played = [session.currentTrack.id, ...session.queue.map((track) => track.id)].sort()
    assert.deepEqual(played, ['a', 'b', 'c'])
  })

  it('keeps shuffle and repeat across play-into-session and stays in container order', async () => {
    let { database: db, member } = await freshPlayback()
    insertTrack(db, { id: 'a', title: 'A', album: 'Box' })
    insertTrack(db, { id: 'b', title: 'B', album: 'Box' })
    insertTrack(db, { id: 'c', title: 'C', album: 'Box' })
    insertTrack(db, { id: 'd', title: 'D', album: 'Box' })
    playIntoSession(db, member, { trackIds: ['a'] })
    updateListeningSession(db, member, { shuffle: true, repeat: 'one' })

    let session = playIntoSession(db, member, { trackIds: ['a', 'b', 'c', 'd'], startAt: 1 })

    assert.equal(session.currentTrack?.id, 'b')
    assert.equal(session.shuffle, true)
    assert.equal(session.repeat, 'one')
    assert.deepEqual(
      session.queue.map((track) => track.id),
      ['c', 'd'],
    )
  })
})

describe('Listen resume and Recently played', () => {
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

  async function freshPlayback() {
    tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'spinbox-playback-resume-'))
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
    return { database, member }
  }

  it('stores per-Track last position and a last-active continue target', async () => {
    let { database: db, member } = await freshPlayback()
    insertTrack(db, { id: 'airbag', title: 'Airbag', album: 'OK Computer' })
    insertTrack(db, { id: 'hey-you', title: 'Hey You', album: 'The Wall' })

    playIntoSession(db, member, { trackIds: ['airbag'] })
    updateListeningSession(db, member, { playheadMs: 90_000 })
    playIntoSession(db, member, { trackIds: ['hey-you'] })
    updateListeningSession(db, member, { playheadMs: 12_000 })

    let resume = getListenResume(db, member)
    assert.equal(resume.lastActiveTrack?.id, 'hey-you')
    assert.equal(resume.lastActivePositionMs, 12_000)
    assert.equal(resume.positions.find((entry) => entry.track.id === 'airbag')?.positionMs, 90_000)
    assert.equal(resume.positions.find((entry) => entry.track.id === 'hey-you')?.positionMs, 12_000)
  })

  it('keeps Listen resume after a Track falls off the Recently played ring', async () => {
    let { database: db, member } = await freshPlayback()
    for (let index = 1; index <= 51; index++) {
      insertTrack(db, { id: `t${index}`, title: `Track ${index}`, album: 'Box' })
    }

    playIntoSession(db, member, { trackIds: ['t1'] })
    updateListeningSession(db, member, { playheadMs: 4_000 })
    for (let index = 2; index <= 51; index++) {
      playIntoSession(db, member, { trackIds: [`t${index}`] })
    }

    let recent = listRecentlyPlayed(db, member)
    assert.equal(recent.length, 50)
    assert.deepEqual(
      recent.map((track) => track.id),
      Array.from({ length: 50 }, (_, index) => `t${51 - index}`),
    )
    assert.equal(
      recent.some((track) => track.id === 't1'),
      false,
    )

    let resume = getListenResume(db, member)
    assert.equal(resume.lastActiveTrack?.id, 't51')
    assert.equal(resume.positions.find((entry) => entry.track.id === 't1')?.positionMs, 4_000)
  })

  it('moves a repeated Track to the front of Recently played without duplicating it', async () => {
    let { database: db, member } = await freshPlayback()
    insertTrack(db, { id: 'airbag', title: 'Airbag', album: 'OK Computer' })
    insertTrack(db, { id: 'hey-you', title: 'Hey You', album: 'The Wall' })

    playIntoSession(db, member, { trackIds: ['airbag'] })
    playIntoSession(db, member, { trackIds: ['hey-you'] })
    playIntoSession(db, member, { trackIds: ['airbag'] })

    assert.deepEqual(
      listRecentlyPlayed(db, member).map((track) => track.id),
      ['airbag', 'hey-you'],
    )
  })

  it('continues the last-active Track from its stored Listen resume position', async () => {
    let { database: db, member } = await freshPlayback()
    insertTrack(db, { id: 'airbag', title: 'Airbag', album: 'OK Computer' })
    insertTrack(db, { id: 'hey-you', title: 'Hey You', album: 'The Wall' })
    playIntoSession(db, member, { trackIds: ['airbag'] })
    updateListeningSession(db, member, { playheadMs: 90_000 })

    let sameTrack = continueListening(db, member)
    assert.equal(sameTrack.currentTrack?.id, 'airbag')
    assert.equal(sameTrack.playheadMs, 90_000)
    assert.equal(sameTrack.playing, true)
    assert.equal(getListenResume(db, member).lastActivePositionMs, 90_000)

    playIntoSession(db, member, { trackIds: ['hey-you'] })
    updateListeningSession(db, member, { playheadMs: 12_000 })
    let session = continueListening(db, member)
    assert.equal(session.currentTrack?.id, 'hey-you')
    assert.equal(session.playheadMs, 12_000)
    assert.equal(getListenResume(db, member).positions.find((entry) => entry.track.id === 'airbag')?.positionMs, 90_000)
  })
})

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
