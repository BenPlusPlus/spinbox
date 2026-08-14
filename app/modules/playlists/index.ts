/** Owner-private Playlists and Missing track entries. */
import type { AppDatabase } from '../../data/index.ts'
import type { HouseholdMember } from '../auth/index.ts'
import { findTrackById, type Track } from '../library/index.ts'

export type PlaylistSummary = {
  id: string
  name: string
  trackCount: number
  createdAt: string
  updatedAt: string
}

export type PlaylistEntry = {
  position: number
  missing: boolean
  track: Track | null
  path: string
  title: string
  artist: string
  album: string
}

export type Playlist = {
  id: string
  name: string
  ownerId: string
  createdAt: string
  updatedAt: string
  entries: PlaylistEntry[]
}

export function listPlaylists(database: AppDatabase, member: HouseholdMember): PlaylistSummary[] {
  return (
    database.sqlite
      .prepare(
        `SELECT p.id, p.name, p.created_at, p.updated_at,
                (SELECT COUNT(*) FROM playlist_items i WHERE i.playlist_id = p.id) AS track_count
         FROM playlists p
         WHERE p.owner_id = ?
         ORDER BY p.updated_at DESC, p.created_at DESC`,
      )
      .all(member.id) as {
      id: string
      name: string
      created_at: string
      updated_at: string
      track_count: number
    }[]
  ).map((row) => ({
    id: row.id,
    name: row.name,
    trackCount: row.track_count,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }))
}

export function getPlaylist(
  database: AppDatabase,
  member: HouseholdMember,
  playlistId: string,
): Playlist | null {
  let row = loadOwnedPlaylist(database, member.id, playlistId)
  if (row == null) {
    return null
  }
  return toPlaylist(database, row)
}

export function createPlaylist(database: AppDatabase, member: HouseholdMember, name: string): Playlist {
  let trimmed = parsePlaylistName(name)
  let id = crypto.randomUUID()
  let now = new Date().toISOString()
  database.sqlite
    .prepare(
      `INSERT INTO playlists (id, owner_id, name, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?)`,
    )
    .run(id, member.id, trimmed, now, now)

  return {
    id,
    name: trimmed,
    ownerId: member.id,
    createdAt: now,
    updatedAt: now,
    entries: [],
  }
}

export function renamePlaylist(
  database: AppDatabase,
  member: HouseholdMember,
  playlistId: string,
  name: string,
): Playlist {
  let trimmed = parsePlaylistName(name)
  requireOwnedPlaylist(database, member.id, playlistId)
  let now = new Date().toISOString()
  database.sqlite
    .prepare(`UPDATE playlists SET name = ?, updated_at = ? WHERE id = ? AND owner_id = ?`)
    .run(trimmed, now, playlistId, member.id)
  let playlist = getPlaylist(database, member, playlistId)
  if (playlist == null) {
    throw new PlaylistError('not_found', 'That Playlist was not found')
  }
  return playlist
}

export function addTrackToPlaylist(
  database: AppDatabase,
  member: HouseholdMember,
  playlistId: string,
  trackId: string,
): Playlist {
  requireOwnedPlaylist(database, member.id, playlistId)
  let track = findTrackById(database, trackId)
  if (track == null) {
    throw new PlaylistError('unknown_track', 'That Track was not found in the Library')
  }

  let now = new Date().toISOString()
  database.sqlite.exec('BEGIN IMMEDIATE')
  try {
    let max = database.sqlite
      .prepare(`SELECT MAX(position) AS position FROM playlist_items WHERE playlist_id = ?`)
      .get(playlistId) as { position: number | null }
    let position = (max.position ?? -1) + 1
    database.sqlite
      .prepare(
        `INSERT INTO playlist_items (playlist_id, position, track_id, path, title, artist, album)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(playlistId, position, track.id, track.path, track.title, track.artist, track.album)
    touchPlaylist(database, playlistId, now)
    database.sqlite.exec('COMMIT')
  } catch (error) {
    database.sqlite.exec('ROLLBACK')
    throw error
  }

  let playlist = getPlaylist(database, member, playlistId)
  if (playlist == null) {
    throw new PlaylistError('not_found', 'That Playlist was not found')
  }
  return playlist
}

export function removePlaylistEntry(
  database: AppDatabase,
  member: HouseholdMember,
  playlistId: string,
  position: number,
): Playlist {
  requireOwnedPlaylist(database, member.id, playlistId)
  mutateEntries(database, playlistId, (entries) => entries.filter((entry) => entry.position !== position))
  let playlist = getPlaylist(database, member, playlistId)
  if (playlist == null) {
    throw new PlaylistError('not_found', 'That Playlist was not found')
  }
  return playlist
}

export function reorderPlaylistEntry(
  database: AppDatabase,
  member: HouseholdMember,
  playlistId: string,
  from: number,
  to: number,
): Playlist {
  requireOwnedPlaylist(database, member.id, playlistId)
  mutateEntries(database, playlistId, (entries) => {
    if (from < 0 || from >= entries.length || to < 0 || to >= entries.length || from === to) {
      return entries
    }
    let next = [...entries]
    let [moved] = next.splice(from, 1)
    if (moved == null) {
      return entries
    }
    next.splice(to, 0, moved)
    return next
  })
  let playlist = getPlaylist(database, member, playlistId)
  if (playlist == null) {
    throw new PlaylistError('not_found', 'That Playlist was not found')
  }
  return playlist
}

export function playableTrackIds(playlist: Playlist, startAt = 0): string[] {
  return playlist.entries
    .slice(Math.max(0, startAt))
    .flatMap((entry) => (entry.missing || entry.track == null ? [] : [entry.track.id]))
}

export function searchOwnPlaylists(
  database: AppDatabase,
  member: HouseholdMember,
  query: string,
): PlaylistSummary[] {
  let needle = query.trim().toLowerCase()
  if (!needle) {
    return []
  }
  return listPlaylists(database, member).filter((playlist) =>
    playlist.name.toLowerCase().includes(needle),
  )
}

export function deletePlaylist(
  database: AppDatabase,
  member: HouseholdMember,
  playlistId: string,
): void {
  requireOwnedPlaylist(database, member.id, playlistId)
  database.sqlite.exec('BEGIN IMMEDIATE')
  try {
    database.sqlite.prepare('DELETE FROM playlist_items WHERE playlist_id = ?').run(playlistId)
    database.sqlite
      .prepare('DELETE FROM playlists WHERE id = ? AND owner_id = ?')
      .run(playlistId, member.id)
    database.sqlite.exec('COMMIT')
  } catch (error) {
    database.sqlite.exec('ROLLBACK')
    throw error
  }
}

function parsePlaylistName(name: string): string {
  let trimmed = name.trim()
  if (!trimmed) {
    throw new PlaylistError('invalid_name', 'A Playlist needs a name')
  }
  if (trimmed.length > 80) {
    throw new PlaylistError('invalid_name', 'A Playlist name is too long')
  }
  return trimmed
}

type PlaylistRow = {
  id: string
  owner_id: string
  name: string
  created_at: string
  updated_at: string
}

function loadOwnedPlaylist(
  database: AppDatabase,
  ownerId: string,
  playlistId: string,
): PlaylistRow | undefined {
  return database.sqlite
    .prepare(
      `SELECT id, owner_id, name, created_at, updated_at
       FROM playlists
       WHERE id = ? AND owner_id = ?`,
    )
    .get(playlistId, ownerId) as PlaylistRow | undefined
}

function requireOwnedPlaylist(database: AppDatabase, ownerId: string, playlistId: string): PlaylistRow {
  let row = loadOwnedPlaylist(database, ownerId, playlistId)
  if (row == null) {
    throw new PlaylistError('not_found', 'That Playlist was not found')
  }
  return row
}

type ItemRow = {
  position: number
  track_id: string | null
  path: string
  title: string
  artist: string
  album: string
}

function toPlaylist(database: AppDatabase, row: PlaylistRow): Playlist {
  let items = database.sqlite
    .prepare(
      `SELECT position, track_id, path, title, artist, album
       FROM playlist_items
       WHERE playlist_id = ?
       ORDER BY position ASC`,
    )
    .all(row.id) as ItemRow[]

  return {
    id: row.id,
    name: row.name,
    ownerId: row.owner_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    entries: items.map((item) => {
      let track = item.track_id ? findTrackById(database, item.track_id) : null
      return {
        position: item.position,
        missing: track == null,
        track,
        path: track?.path ?? item.path,
        title: track?.title ?? item.title,
        artist: track?.artist ?? item.artist,
        album: track?.album ?? item.album,
      }
    }),
  }
}

function mutateEntries(
  database: AppDatabase,
  playlistId: string,
  nextEntries: (entries: ItemRow[]) => ItemRow[],
) {
  let now = new Date().toISOString()
  database.sqlite.exec('BEGIN IMMEDIATE')
  try {
    let current = database.sqlite
      .prepare(
        `SELECT position, track_id, path, title, artist, album
         FROM playlist_items
         WHERE playlist_id = ?
         ORDER BY position ASC`,
      )
      .all(playlistId) as ItemRow[]
    let next = nextEntries(current)
    database.sqlite.prepare('DELETE FROM playlist_items WHERE playlist_id = ?').run(playlistId)
    let insert = database.sqlite.prepare(
      `INSERT INTO playlist_items (playlist_id, position, track_id, path, title, artist, album)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    for (let [index, entry] of next.entries()) {
      insert.run(
        playlistId,
        index,
        entry.track_id,
        entry.path,
        entry.title,
        entry.artist,
        entry.album,
      )
    }
    touchPlaylist(database, playlistId, now)
    database.sqlite.exec('COMMIT')
  } catch (error) {
    database.sqlite.exec('ROLLBACK')
    throw error
  }
}

function touchPlaylist(database: AppDatabase, playlistId: string, now: string) {
  database.sqlite.prepare(`UPDATE playlists SET updated_at = ? WHERE id = ?`).run(now, playlistId)
}

export type PlaylistErrorCode = 'invalid_name' | 'not_found' | 'unknown_track'

export class PlaylistError extends Error {
  readonly code: PlaylistErrorCode

  constructor(code: PlaylistErrorCode, message: string) {
    super(message)
    this.name = 'PlaylistError'
    this.code = code
  }
}
