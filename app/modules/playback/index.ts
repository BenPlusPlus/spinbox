/** Listening session, Play queue, Listen resume, Recently played. */
import type { AppDatabase } from '../../data/index.ts'
import type { HouseholdMember } from '../auth/index.ts'
import { findTrackById, type Track } from '../library/index.ts'

export type RepeatMode = 'off' | 'all' | 'one'

export type ListeningSession = {
  currentTrack: Track | null
  playheadMs: number
  playing: boolean
  shuffle: boolean
  repeat: RepeatMode
  queue: Track[]
  updatedAt: string | null
}

export type ListenResumeEntry = {
  track: Track
  positionMs: number
}

export type ListenResume = {
  lastActiveTrack: Track | null
  lastActivePositionMs: number
  positions: ListenResumeEntry[]
}

type SessionRow = {
  current_track_id: string | null
  playhead_ms: number
  playing: number
  shuffle: number
  repeat_mode: RepeatMode
  updated_at: string
}

export function getListeningSession(
  database: AppDatabase,
  member: HouseholdMember,
): ListeningSession {
  let row = loadSessionRow(database, member.id)

  if (row == null) {
    return emptySession()
  }

  return {
    currentTrack: row.current_track_id ? findTrackById(database, row.current_track_id) : null,
    playheadMs: row.playhead_ms,
    playing: row.playing === 1,
    shuffle: row.shuffle === 1,
    repeat: row.repeat_mode,
    queue: loadQueue(database, member.id),
    updatedAt: row.updated_at,
  }
}

export function playIntoSession(
  database: AppDatabase,
  member: HouseholdMember,
  input: { trackIds: string[]; startAt?: number; playheadMs?: number; shuffle?: boolean },
): ListeningSession {
  let trackIds = input.shuffle ? shuffleTrackIds(input.trackIds) : input.trackIds
  let startAt = input.shuffle ? 0 : (input.startAt ?? 0)
  let currentId = trackIds[startAt]
  if (currentId == null) {
    throw new PlaybackError('unknown_track', 'That Track is not in the play-into-session list')
  }

  let current = requireTrack(database, currentId)
  let upcomingIds = trackIds.slice(startAt + 1).map((id) => requireTrack(database, id).id)
  let existing = loadSessionRow(database, member.id)
  let shuffle = input.shuffle === true ? true : existing?.shuffle === 1
  let repeat = existing?.repeat_mode ?? 'off'
  let playheadMs = input.playheadMs ?? 0
  let now = new Date().toISOString()

  database.sqlite.exec('BEGIN IMMEDIATE')
  try {
    upsertSession(database, member.id, {
      currentTrackId: current.id,
      playheadMs,
      playing: true,
      shuffle,
      repeat,
      updatedAt: now,
    })
    replaceQueue(database, member.id, upcomingIds)
    writeListenResume(database, member.id, current.id, playheadMs, now)
    recordRecentlyPlayed(database, member.id, current.id, now)
    database.sqlite.exec('COMMIT')
  } catch (error) {
    database.sqlite.exec('ROLLBACK')
    throw error
  }

  return getListeningSession(database, member)
}

export function continueListening(
  database: AppDatabase,
  member: HouseholdMember,
): ListeningSession {
  let resume = getListenResume(database, member)
  if (resume.lastActiveTrack == null) {
    return getListeningSession(database, member)
  }

  let session = getListeningSession(database, member)
  if (session.currentTrack?.id === resume.lastActiveTrack.id) {
    return updateListeningSession(database, member, {
      playheadMs: resume.lastActivePositionMs,
      playing: true,
    })
  }

  return playIntoSession(database, member, {
    trackIds: [resume.lastActiveTrack.id],
    playheadMs: resume.lastActivePositionMs,
  })
}

export function updateListeningSession(
  database: AppDatabase,
  member: HouseholdMember,
  patch: {
    playheadMs?: number
    playing?: boolean
    shuffle?: boolean
    repeat?: RepeatMode
  },
): ListeningSession {
  let existing = loadSessionRow(database, member.id)
  let now = new Date().toISOString()

  database.sqlite.exec('BEGIN IMMEDIATE')
  try {
    let playheadMs = patch.playheadMs ?? existing?.playhead_ms ?? 0
    let currentTrackId = existing?.current_track_id ?? null
    upsertSession(database, member.id, {
      currentTrackId,
      playheadMs,
      playing: patch.playing ?? existing?.playing === 1,
      shuffle: patch.shuffle ?? existing?.shuffle === 1,
      repeat: patch.repeat ?? existing?.repeat_mode ?? 'off',
      updatedAt: now,
    })
    if (patch.playheadMs != null && currentTrackId) {
      writeListenResume(database, member.id, currentTrackId, playheadMs, now)
    }
    database.sqlite.exec('COMMIT')
  } catch (error) {
    database.sqlite.exec('ROLLBACK')
    throw error
  }

  return getListeningSession(database, member)
}

export function playNext(
  database: AppDatabase,
  member: HouseholdMember,
  trackId: string,
): ListeningSession {
  requireTrack(database, trackId)
  return mutateQueue(database, member, (queue) => [trackId, ...queue])
}

export function addToQueue(
  database: AppDatabase,
  member: HouseholdMember,
  trackId: string,
): ListeningSession {
  requireTrack(database, trackId)
  return mutateQueue(database, member, (queue) => [...queue, trackId])
}

export function getListenResume(database: AppDatabase, member: HouseholdMember): ListenResume {
  let target = database.sqlite
    .prepare(
      `SELECT track_id
       FROM listen_resume_target
       WHERE member_id = ?`,
    )
    .get(member.id) as { track_id: string | null } | undefined

  let rows = database.sqlite
    .prepare(
      `SELECT track_id, position_ms
       FROM listen_resume
       WHERE member_id = ?
       ORDER BY updated_at DESC`,
    )
    .all(member.id) as { track_id: string; position_ms: number }[]

  let positions: ListenResumeEntry[] = []
  for (let row of rows) {
    let track = findTrackById(database, row.track_id)
    if (track) {
      positions.push({ track, positionMs: row.position_ms })
    }
  }

  let lastActiveTrack = target?.track_id ? findTrackById(database, target.track_id) : null
  let lastActivePositionMs =
    lastActiveTrack == null
      ? 0
      : (positions.find((entry) => entry.track.id === lastActiveTrack.id)?.positionMs ?? 0)

  return { lastActiveTrack, lastActivePositionMs, positions }
}

export function listRecentlyPlayed(database: AppDatabase, member: HouseholdMember): Track[] {
  let rows = database.sqlite
    .prepare(
      `SELECT track_id
       FROM recently_played
       WHERE member_id = ?
       ORDER BY seq DESC`,
    )
    .all(member.id) as { track_id: string }[]

  let tracks: Track[] = []
  for (let row of rows) {
    let track = findTrackById(database, row.track_id)
    if (track) {
      tracks.push(track)
    }
  }
  return tracks
}

export type PlaybackErrorCode = 'unknown_track'

export class PlaybackError extends Error {
  readonly code: PlaybackErrorCode

  constructor(code: PlaybackErrorCode, message: string) {
    super(message)
    this.name = 'PlaybackError'
    this.code = code
  }
}

function emptySession(): ListeningSession {
  return {
    currentTrack: null,
    playheadMs: 0,
    playing: false,
    shuffle: false,
    repeat: 'off',
    queue: [],
    updatedAt: null,
  }
}

function requireTrack(database: AppDatabase, trackId: string): Track {
  let track = findTrackById(database, trackId)
  if (track == null) {
    throw new PlaybackError('unknown_track', 'That Track was not found in the Library')
  }
  return track
}

function loadQueue(database: AppDatabase, memberId: string): Track[] {
  let rows = database.sqlite
    .prepare(
      `SELECT track_id
       FROM play_queue_items
       WHERE member_id = ?
       ORDER BY position ASC`,
    )
    .all(memberId) as { track_id: string }[]

  let tracks: Track[] = []
  for (let row of rows) {
    let track = findTrackById(database, row.track_id)
    if (track) {
      tracks.push(track)
    }
  }
  return tracks
}

function upsertSession(
  database: AppDatabase,
  memberId: string,
  input: {
    currentTrackId: string | null
    playheadMs: number
    playing: boolean
    shuffle: boolean
    repeat: RepeatMode
    updatedAt: string
  },
) {
  database.sqlite
    .prepare(
      `INSERT INTO listening_sessions (
         member_id, current_track_id, playhead_ms, playing, shuffle, repeat_mode, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(member_id) DO UPDATE SET
         current_track_id = excluded.current_track_id,
         playhead_ms = excluded.playhead_ms,
         playing = excluded.playing,
         shuffle = excluded.shuffle,
         repeat_mode = excluded.repeat_mode,
         updated_at = excluded.updated_at`,
    )
    .run(
      memberId,
      input.currentTrackId,
      input.playheadMs,
      input.playing ? 1 : 0,
      input.shuffle ? 1 : 0,
      input.repeat,
      input.updatedAt,
    )
}

function mutateQueue(
  database: AppDatabase,
  member: HouseholdMember,
  nextQueue: (queue: string[]) => string[],
): ListeningSession {
  let now = new Date().toISOString()
  database.sqlite.exec('BEGIN IMMEDIATE')
  try {
    let session = loadSessionRow(database, member.id)
    if (session == null) {
      upsertSession(database, member.id, {
        currentTrackId: null,
        playheadMs: 0,
        playing: false,
        shuffle: false,
        repeat: 'off',
        updatedAt: now,
      })
    } else {
      database.sqlite
        .prepare(`UPDATE listening_sessions SET updated_at = ? WHERE member_id = ?`)
        .run(now, member.id)
    }
    replaceQueue(database, member.id, nextQueue(queueIds(database, member.id)))
    database.sqlite.exec('COMMIT')
  } catch (error) {
    database.sqlite.exec('ROLLBACK')
    throw error
  }
  return getListeningSession(database, member)
}

function loadSessionRow(database: AppDatabase, memberId: string): SessionRow | undefined {
  return database.sqlite
    .prepare(
      `SELECT current_track_id, playhead_ms, playing, shuffle, repeat_mode, updated_at
       FROM listening_sessions
       WHERE member_id = ?`,
    )
    .get(memberId) as SessionRow | undefined
}

function queueIds(database: AppDatabase, memberId: string): string[] {
  return (
    database.sqlite
      .prepare(
        `SELECT track_id
         FROM play_queue_items
         WHERE member_id = ?
         ORDER BY position ASC`,
      )
      .all(memberId) as { track_id: string }[]
  ).map((row) => row.track_id)
}

function writeListenResume(
  database: AppDatabase,
  memberId: string,
  trackId: string,
  positionMs: number,
  now: string,
) {
  database.sqlite
    .prepare(
      `INSERT INTO listen_resume (member_id, track_id, position_ms, updated_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(member_id, track_id) DO UPDATE SET
         position_ms = excluded.position_ms,
         updated_at = excluded.updated_at`,
    )
    .run(memberId, trackId, positionMs, now)
  database.sqlite
    .prepare(
      `INSERT INTO listen_resume_target (member_id, track_id, updated_at)
       VALUES (?, ?, ?)
       ON CONFLICT(member_id) DO UPDATE SET
         track_id = excluded.track_id,
         updated_at = excluded.updated_at`,
    )
    .run(memberId, trackId, now)
}

function recordRecentlyPlayed(
  database: AppDatabase,
  memberId: string,
  trackId: string,
  now: string,
) {
  let max = database.sqlite
    .prepare(`SELECT MAX(seq) AS seq FROM recently_played WHERE member_id = ?`)
    .get(memberId) as { seq: number | null }
  let seq = (max.seq ?? 0) + 1

  database.sqlite
    .prepare(
      `INSERT INTO recently_played (member_id, track_id, played_at, seq)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(member_id, track_id) DO UPDATE SET
         played_at = excluded.played_at,
         seq = excluded.seq`,
    )
    .run(memberId, trackId, now, seq)

  database.sqlite
    .prepare(
      `DELETE FROM recently_played
       WHERE member_id = ?
         AND rowid IN (
           SELECT rowid FROM recently_played
           WHERE member_id = ?
           ORDER BY seq DESC
           LIMIT -1 OFFSET 50
         )`,
    )
    .run(memberId, memberId)
}

function shuffleTrackIds(trackIds: string[]): string[] {
  let next = [...trackIds]
  for (let index = next.length - 1; index > 0; index--) {
    let swap = Math.floor(Math.random() * (index + 1))
    let current = next[index]!
    next[index] = next[swap]!
    next[swap] = current
  }
  return next
}

function replaceQueue(database: AppDatabase, memberId: string, trackIds: string[]) {
  database.sqlite.prepare('DELETE FROM play_queue_items WHERE member_id = ?').run(memberId)
  let insert = database.sqlite.prepare(
    `INSERT INTO play_queue_items (member_id, position, track_id) VALUES (?, ?, ?)`,
  )
  for (let [index, trackId] of trackIds.entries()) {
    insert.run(memberId, index, trackId)
  }
}
