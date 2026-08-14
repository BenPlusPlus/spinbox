/** Track index, membership/ignore rules, tag/path resolution, Scan run lifecycle. */
import * as fs from 'node:fs/promises'
import * as path from 'node:path'

import { parseFile } from 'music-metadata'

import type { AppDatabase } from '../../data/index.ts'
import { findMemberById, type HouseholdMember } from '../auth/index.ts'
import {
  DEFAULT_LIBRARY_EXTENSIONS,
  DEFAULT_LIBRARY_SKIP_DIRS,
  type AppConfig,
} from '../config/index.ts'

export const DEFAULT_AUDIO_EXTENSIONS = DEFAULT_LIBRARY_EXTENSIONS
export const DEFAULT_SKIP_DIRECTORY_NAMES = DEFAULT_LIBRARY_SKIP_DIRS

const JUNK_BASENAMES = new Set(['thumbs.db', 'desktop.ini'])

export type MembershipRules = {
  extensions?: readonly string[]
  skipDirectoryNames?: readonly string[]
}

export type MembershipCheck = MembershipRules & {
  symlink?: boolean
}

/** Normalize a library-relative path to NFC, `/` separators, no leading slash. */
export function normalizeLibraryPath(relativePath: string): string {
  return relativePath
    .normalize('NFC')
    .replaceAll('\\', '/')
    .replace(/^\.\/+/, '')
    .replace(/^\/+/, '')
}

export function isLibraryMember(relativePath: string, check: MembershipCheck = {}): boolean {
  if (check.symlink) {
    return false
  }

  let normalized = normalizeLibraryPath(relativePath)
  if (!normalized || normalized === '.' || normalized.includes('\0')) {
    return false
  }

  let segments = normalized.split('/').filter((segment) => segment.length > 0 && segment !== '.')
  if (segments.length === 0 || segments.some((segment) => segment === '..')) {
    return false
  }

  let skipNames = new Set(
    (check.skipDirectoryNames ?? DEFAULT_SKIP_DIRECTORY_NAMES).map((name) => name.toLowerCase()),
  )
  let directories = segments.slice(0, -1)
  for (let directory of directories) {
    if (directory.startsWith('.') || skipNames.has(directory.toLowerCase())) {
      return false
    }
  }

  let basename = segments[segments.length - 1]!
  if (basename.startsWith('.') || JUNK_BASENAMES.has(basename.toLowerCase())) {
    return false
  }

  let extension = extensionOf(basename)
  if (!extension) {
    return false
  }

  let allowlist = new Set(
    (check.extensions ?? DEFAULT_AUDIO_EXTENSIONS).map((value) => value.toLowerCase()),
  )
  return allowlist.has(extension)
}

export const UNKNOWN_ARTIST = 'Unknown artist'
export const UNKNOWN_ALBUM = 'Unknown album'

export type EmbeddedTags = {
  title?: string | null
  artist?: string | null
  album?: string | null
  albumArtist?: string | null
  trackNumber?: number | null
  discNumber?: number | null
  durationMs?: number | null
}

export type TrackMetadata = {
  title: string
  artist: string
  album: string
  albumArtist: string
  trackNumber: number | null
  discNumber: number | null
  durationMs: number | null
}

const DISC_FOLDER = /^(?:disc|cd)\s*(\d+)$/i
const TRACK_PREFIX =
  /^(?:track\s*)?(\d+)\s*(?:[-._]+|\s+)\s*(.+)$/i

export function resolveTrackMetadata(
  relativePath: string,
  tags: EmbeddedTags | null = null,
): TrackMetadata {
  let fromPath = metadataFromPath(relativePath)
  let title = nonempty(tags?.title) ?? fromPath.title
  let album = nonempty(tags?.album) ?? fromPath.album
  let albumArtist = nonempty(tags?.albumArtist) ?? fromPath.albumArtist
  let artist = nonempty(tags?.artist) ?? nonempty(tags?.albumArtist) ?? fromPath.artist
  let trackNumber = tags?.trackNumber ?? fromPath.trackNumber
  let discNumber = tags?.discNumber ?? fromPath.discNumber

  return {
    title,
    artist,
    album,
    albumArtist,
    trackNumber,
    discNumber,
    durationMs: tags?.durationMs ?? null,
  }
}

function metadataFromPath(relativePath: string): TrackMetadata {
  let segments = normalizeLibraryPath(relativePath)
    .split('/')
    .filter((segment) => segment.length > 0 && segment !== '.')
  let basename = segments.at(-1) ?? relativePath
  let stem = filenameStem(basename)
  let directories = segments.slice(0, -1)

  let discFromFolder: number | null = null
  if (directories.length > 0) {
    let lastDir = directories[directories.length - 1]!
    let discMatch = lastDir.match(DISC_FOLDER)
    if (discMatch) {
      discFromFolder = Number.parseInt(discMatch[1]!, 10)
      directories = directories.slice(0, -1)
    }
  }

  let albumFolder = directories.at(-1)
  let artistFolder = directories.at(-2) ?? (directories.length === 1 ? directories[0] : undefined)

  let parsedName = parseFilename(stem)

  return {
    title: parsedName.title,
    artist: artistFolder || UNKNOWN_ARTIST,
    album: albumFolder && directories.length >= 2 ? albumFolder : directories.length === 1 ? UNKNOWN_ALBUM : albumFolder || UNKNOWN_ALBUM,
    albumArtist: artistFolder || UNKNOWN_ARTIST,
    trackNumber: parsedName.trackNumber,
    discNumber: parsedName.discNumber ?? discFromFolder,
    durationMs: null,
  }
}

function parseFilename(stem: string): {
  title: string
  trackNumber: number | null
  discNumber: number | null
} {
  let match = stem.match(TRACK_PREFIX)
  if (!match) {
    return { title: stem, trackNumber: null, discNumber: null }
  }

  let rawNumber = match[1]!
  let title = match[2]!.trim() || stem
  let numeric = Number.parseInt(rawNumber, 10)

  if (rawNumber.length >= 3) {
    let trackNumber = numeric % 100
    let discNumber = Math.floor(numeric / 100)
    return {
      title,
      trackNumber: trackNumber === 0 ? null : trackNumber,
      discNumber: discNumber === 0 ? null : discNumber,
    }
  }

  return { title, trackNumber: numeric, discNumber: null }
}

function filenameStem(basename: string): string {
  let dot = basename.lastIndexOf('.')
  if (dot <= 0) {
    return basename
  }
  return basename.slice(0, dot)
}

function nonempty(value: string | null | undefined): string | undefined {
  let trimmed = value?.trim()
  return trimmed ? trimmed : undefined
}

function extensionOf(basename: string): string | null {
  let dot = basename.lastIndexOf('.')
  if (dot <= 0 || dot === basename.length - 1) {
    return null
  }
  return basename.slice(dot + 1).toLowerCase()
}

const MIME_BY_EXTENSION: Record<string, string> = {
  mp3: 'audio/mpeg',
  m4a: 'audio/mp4',
  mp4: 'audio/mp4',
  flac: 'audio/flac',
  ogg: 'audio/ogg',
  opus: 'audio/ogg',
  wav: 'audio/wav',
  aac: 'audio/aac',
  aiff: 'audio/aiff',
  aif: 'audio/aiff',
  wma: 'audio/x-ms-wma',
}

export type LibraryErrorCode = 'not_admin'

export class LibraryError extends Error {
  readonly code: LibraryErrorCode

  constructor(code: LibraryErrorCode, message: string) {
    super(message)
    this.name = 'LibraryError'
    this.code = code
  }
}

export type Track = {
  id: string
  path: string
  title: string
  artist: string
  album: string
  albumArtist: string
  discNumber: number | null
  trackNumber: number | null
  durationMs: number | null
  mime: string
  mtimeMs: number
  size: number
}

export type ScanLastResult = {
  outcome: 'succeeded' | 'failed'
  startedAt: string
  finishedAt: string
  tracksSeen: number
  tracksUpserted: number
  tracksPruned: number
  error: string | null
}

export type ScanStatus = {
  state: 'idle' | 'running'
  lastResult: ScanLastResult | null
}

export type WalkedFile = {
  relativePath: string
  mtimeMs: number
  size: number
  symlink: boolean
  absolutePath?: string
}

export type ScanAdapter = {
  walk(libraryRoot: string): AsyncIterable<WalkedFile>
}

export type StartScanResult =
  | { ok: true; done: Promise<void> }
  | { ok: false; reason: 'already_running' }

type TrackRow = {
  id: string
  path: string
  title: string
  artist: string
  album: string
  album_artist: string
  disc_number: number | null
  track_number: number | null
  duration_ms: number | null
  mime: string
  mtime_ms: number
  size: number
}

type ScanRunRow = {
  id: string
  status: 'running' | 'succeeded' | 'failed'
  started_at: string
  finished_at: string | null
  tracks_seen: number | null
  tracks_upserted: number | null
  tracks_pruned: number | null
  error: string | null
}

const activeScans = new WeakMap<AppDatabase, string>()

export function getScanStatus(database: AppDatabase): ScanStatus {
  recoverOrphanedScan(database)

  let running = database.sqlite
    .prepare(
      `SELECT id, status, started_at, finished_at, tracks_seen, tracks_upserted, tracks_pruned, error
       FROM scan_runs
       WHERE status = 'running'
       ORDER BY started_at DESC
       LIMIT 1`,
    )
    .get() as ScanRunRow | undefined

  let last = database.sqlite
    .prepare(
      `SELECT id, status, started_at, finished_at, tracks_seen, tracks_upserted, tracks_pruned, error
       FROM scan_runs
       WHERE status IN ('succeeded', 'failed')
       ORDER BY finished_at DESC
       LIMIT 1`,
    )
    .get() as ScanRunRow | undefined

  return {
    state: running ? 'running' : 'idle',
    lastResult: last ? toLastResult(last) : null,
  }
}

export async function startScan(
  database: AppDatabase,
  config: AppConfig,
  actor: HouseholdMember,
  options: { adapter?: ScanAdapter } = {},
): Promise<StartScanResult> {
  await requireActiveAdmin(database, actor)
  recoverOrphanedScan(database)

  let id = crypto.randomUUID()
  let startedAt = new Date().toISOString()

  database.sqlite.exec('BEGIN IMMEDIATE')
  try {
    let running = database.sqlite
      .prepare(`SELECT id FROM scan_runs WHERE status = 'running' LIMIT 1`)
      .get() as { id: string } | undefined
    if (running) {
      database.sqlite.exec('ROLLBACK')
      return { ok: false, reason: 'already_running' }
    }

    database.sqlite
      .prepare(
        `INSERT INTO scan_runs (id, status, started_at, finished_at, started_by, tracks_seen, tracks_upserted, tracks_pruned, error)
         VALUES (?, 'running', ?, NULL, ?, NULL, NULL, NULL, NULL)`,
      )
      .run(id, startedAt, actor.id)
    database.sqlite.exec('COMMIT')
  } catch (error) {
    database.sqlite.exec('ROLLBACK')
    throw error
  }

  activeScans.set(database, id)
  let done = runScan(database, config, id, options.adapter).finally(() => {
    if (activeScans.get(database) === id) {
      activeScans.delete(database)
    }
  })
  void done.catch(() => {
    // HTTP callers do not await the walk; never leave an unhandled rejection.
  })

  return { ok: true, done }
}

export async function isLibraryMountHealthy(libraryRoot: string): Promise<boolean> {
  try {
    let stat = await fs.stat(libraryRoot)
    if (!stat.isDirectory()) {
      return false
    }
    await fs.readdir(libraryRoot)
    return true
  } catch {
    return false
  }
}

export function listTracks(database: AppDatabase): Track[] {
  let rows = database.sqlite
    .prepare(
      `SELECT id, path, title, artist, album, album_artist, disc_number, track_number,
              duration_ms, mime, mtime_ms, size
       FROM tracks
       ORDER BY path ASC`,
    )
    .all() as TrackRow[]
  return rows.map(toTrack)
}

export function findTrackByPath(database: AppDatabase, relativePath: string): Track | null {
  return loadTrackByPath(database, normalizeLibraryPath(relativePath))
}

export function findTrackById(database: AppDatabase, id: string): Track | null {
  let row = database.sqlite
    .prepare(
      `SELECT id, path, title, artist, album, album_artist, disc_number, track_number,
              duration_ms, mime, mtime_ms, size
       FROM tracks
       WHERE id = ?`,
    )
    .get(id) as TrackRow | undefined
  return row ? toTrack(row) : null
}

export type AlbumGroup = {
  key: string
  album: string
  albumArtist: string
  tracks: Track[]
}

export type ArtistGroup = {
  key: string
  artist: string
  albums: AlbumGroup[]
  tracks: Track[]
}

export function albumGroupingKey(albumArtist: string, album: string): string {
  return encodeGroupingKey([albumArtist, album])
}

export function artistGroupingKey(artist: string): string {
  return encodeGroupingKey([artist])
}

export function listAlbums(database: AppDatabase): AlbumGroup[] {
  return groupAlbums(listTracks(database))
}

export function findAlbumByKey(database: AppDatabase, key: string): AlbumGroup | null {
  let parts = decodeGroupingKey(key)
  if (parts?.length !== 2) {
    return null
  }
  let [albumArtist, album] = parts
  let tracks = listTracks(database).filter(
    (track) => track.albumArtist === albumArtist && track.album === album,
  )
  if (tracks.length === 0) {
    return null
  }
  tracks.sort(compareAlbumTracks)
  return { key, album: album!, albumArtist: albumArtist!, tracks }
}

export function listArtists(database: AppDatabase): ArtistGroup[] {
  return groupArtists(listTracks(database))
}

export function findArtistByKey(database: AppDatabase, key: string): ArtistGroup | null {
  let parts = decodeGroupingKey(key)
  if (parts?.length !== 1) {
    return null
  }
  let artist = parts[0]!
  let tracks = listTracks(database)
  let hasArtist = tracks.some((track) => track.artist === artist || track.albumArtist === artist)
  if (!hasArtist) {
    return null
  }
  return buildArtistGroup(tracks, artist)
}

export function tracksForArtistPlay(artist: ArtistGroup): Track[] {
  let seen = new Set<string>()
  let ordered: Track[] = []
  for (let album of artist.albums) {
    for (let track of album.tracks) {
      if (!seen.has(track.id)) {
        seen.add(track.id)
        ordered.push(track)
      }
    }
  }
  for (let track of artist.tracks) {
    if (!seen.has(track.id)) {
      seen.add(track.id)
      ordered.push(track)
    }
  }
  return ordered
}

function encodeGroupingKey(parts: readonly string[]): string {
  return Buffer.from(parts.join('\0'), 'utf8').toString('base64url')
}

function decodeGroupingKey(key: string): string[] | null {
  if (!key) {
    return null
  }
  try {
    let decoded = Buffer.from(key, 'base64url').toString('utf8')
    if (Buffer.from(decoded, 'utf8').toString('base64url') !== key) {
      return null
    }
    return decoded.split('\0')
  } catch {
    return null
  }
}

function groupAlbums(tracks: Track[]): AlbumGroup[] {
  let groups = new Map<string, AlbumGroup>()
  for (let track of tracks) {
    let key = albumGroupingKey(track.albumArtist, track.album)
    let group = groups.get(key)
    if (!group) {
      group = {
        key,
        album: track.album,
        albumArtist: track.albumArtist,
        tracks: [],
      }
      groups.set(key, group)
    }
    group.tracks.push(track)
  }
  for (let group of groups.values()) {
    group.tracks.sort(compareAlbumTracks)
  }
  return [...groups.values()].sort((left, right) => {
    let artist = left.albumArtist.localeCompare(right.albumArtist)
    if (artist !== 0) {
      return artist
    }
    return left.album.localeCompare(right.album)
  })
}

function groupArtists(tracks: Track[]): ArtistGroup[] {
  let names = new Set<string>()
  for (let track of tracks) {
    names.add(track.artist)
    names.add(track.albumArtist)
  }
  return [...names]
    .sort((left, right) => left.localeCompare(right))
    .map((artist) => buildArtistGroup(tracks, artist))
}

function buildArtistGroup(tracks: Track[], artist: string): ArtistGroup {
  let albums = groupAlbums(tracks.filter((track) => track.albumArtist === artist))
  let matching = tracks.filter((track) => track.artist === artist)
  matching.sort(compareAlbumTracks)
  return {
    key: artistGroupingKey(artist),
    artist,
    albums,
    tracks: matching,
  }
}

function compareAlbumTracks(left: Track, right: Track) {
  let disc = (left.discNumber ?? 0) - (right.discNumber ?? 0)
  if (disc !== 0) {
    return disc
  }
  let number = (left.trackNumber ?? 0) - (right.trackNumber ?? 0)
  if (number !== 0) {
    return number
  }
  return left.path.localeCompare(right.path)
}

async function runScan(
  database: AppDatabase,
  config: AppConfig,
  scanId: string,
  adapter: ScanAdapter | undefined,
): Promise<void> {
  let seen = 0
  let upserted = 0
  let seenPaths = new Set<string>()
  let rules: MembershipRules = {
    extensions: config.libraryExtensions,
    skipDirectoryNames: config.librarySkipDirs,
  }

  try {
    let walker = adapter ?? createFilesystemAdapter(rules)
    for await (let file of walker.walk(config.libraryRoot)) {
      let relativePath = normalizeLibraryPath(file.relativePath)
      if (
        !isLibraryMember(relativePath, { ...rules, symlink: file.symlink }) ||
        !matchesScanGlobs(relativePath, config.libraryScanGlobs)
      ) {
        continue
      }

      seen += 1
      seenPaths.add(relativePath)
      let existing = loadTrackByPath(database, relativePath)
      if (existing && existing.mtimeMs === file.mtimeMs && existing.size === file.size) {
        continue
      }

      let tags = file.absolutePath ? await readEmbeddedTags(file.absolutePath) : null
      let metadata = resolveTrackMetadata(relativePath, tags)
      let now = new Date().toISOString()
      let mime = mimeForPath(relativePath)

      if (existing) {
        database.sqlite
          .prepare(
            `UPDATE tracks
             SET title = ?, artist = ?, album = ?, album_artist = ?, disc_number = ?,
                 track_number = ?, duration_ms = ?, mime = ?, mtime_ms = ?, size = ?, updated_at = ?
             WHERE path = ?`,
          )
          .run(
            metadata.title,
            metadata.artist,
            metadata.album,
            metadata.albumArtist,
            metadata.discNumber,
            metadata.trackNumber,
            metadata.durationMs,
            mime,
            file.mtimeMs,
            file.size,
            now,
            relativePath,
          )
      } else {
        database.sqlite
          .prepare(
            `INSERT INTO tracks (
               id, path, title, artist, album, album_artist, disc_number, track_number,
               duration_ms, mime, mtime_ms, size, updated_at
             ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .run(
            crypto.randomUUID(),
            relativePath,
            metadata.title,
            metadata.artist,
            metadata.album,
            metadata.albumArtist,
            metadata.discNumber,
            metadata.trackNumber,
            metadata.durationMs,
            mime,
            file.mtimeMs,
            file.size,
            now,
          )
      }
      upserted += 1
    }

    let pruned = pruneMissingTracks(database, seenPaths, config.libraryScanGlobs)
    finishScan(database, scanId, {
      status: 'succeeded',
      tracksSeen: seen,
      tracksUpserted: upserted,
      tracksPruned: pruned,
      error: null,
    })
  } catch (error) {
    finishScan(database, scanId, {
      status: 'failed',
      tracksSeen: seen,
      tracksUpserted: upserted,
      tracksPruned: 0,
      error: error instanceof Error ? error.message : 'Scan run failed',
    })
  }
}

function pruneMissingTracks(
  database: AppDatabase,
  seenPaths: Set<string>,
  scanGlobs: string[],
): number {
  let existing = database.sqlite.prepare('SELECT path FROM tracks').all() as { path: string }[]
  let missing = existing.filter(
    (row) => matchesScanGlobs(row.path, scanGlobs) && !seenPaths.has(row.path),
  )
  if (missing.length === 0) {
    return 0
  }

  let remove = database.sqlite.prepare('DELETE FROM tracks WHERE path = ?')
  database.sqlite.exec('BEGIN IMMEDIATE')
  try {
    for (let row of missing) {
      remove.run(row.path)
    }
    database.sqlite.exec('COMMIT')
  } catch (error) {
    database.sqlite.exec('ROLLBACK')
    throw error
  }
  return missing.length
}

function finishScan(
  database: AppDatabase,
  scanId: string,
  result: {
    status: 'succeeded' | 'failed'
    tracksSeen: number
    tracksUpserted: number
    tracksPruned: number
    error: string | null
  },
) {
  database.sqlite
    .prepare(
      `UPDATE scan_runs
       SET status = ?, finished_at = ?, tracks_seen = ?, tracks_upserted = ?, tracks_pruned = ?, error = ?
       WHERE id = ? AND status = 'running'`,
    )
    .run(
      result.status,
      new Date().toISOString(),
      result.tracksSeen,
      result.tracksUpserted,
      result.tracksPruned,
      result.error,
      scanId,
    )
}

function recoverOrphanedScan(database: AppDatabase) {
  if (activeScans.has(database)) {
    return
  }

  database.sqlite
    .prepare(
      `UPDATE scan_runs
       SET status = 'failed', finished_at = ?, error = ?
       WHERE status = 'running'`,
    )
    .run(new Date().toISOString(), 'Scan run was interrupted')
}

function createFilesystemAdapter(rules: MembershipRules): ScanAdapter {
  let skipNames = new Set(
    (rules.skipDirectoryNames ?? DEFAULT_SKIP_DIRECTORY_NAMES).map((name) => name.toLowerCase()),
  )

  return {
    async *walk(libraryRoot: string) {
      yield* walkDirectory(libraryRoot, '', skipNames)
    },
  }
}

async function* walkDirectory(
  directory: string,
  relativePrefix: string,
  skipNames: Set<string>,
): AsyncGenerator<WalkedFile> {
  let entries
  try {
    entries = await fs.readdir(directory, { withFileTypes: true })
  } catch (error) {
    if (isNotFound(error) && relativePrefix === '') {
      throw new Error('Library root is not available')
    }
    throw error
  }

  for (let entry of entries) {
    let relativePath = relativePrefix ? `${relativePrefix}/${entry.name}` : entry.name
    let absolutePath = path.join(directory, entry.name)
    let stat = await fs.lstat(absolutePath)

    if (stat.isSymbolicLink()) {
      yield {
        relativePath: normalizeLibraryPath(relativePath),
        mtimeMs: Math.round(stat.mtimeMs),
        size: stat.size,
        symlink: true,
        absolutePath,
      }
      continue
    }

    if (stat.isDirectory()) {
      if (entry.name.startsWith('.') || skipNames.has(entry.name.toLowerCase())) {
        continue
      }
      yield* walkDirectory(absolutePath, relativePath, skipNames)
      continue
    }

    if (!stat.isFile()) {
      continue
    }

    yield {
      relativePath: normalizeLibraryPath(relativePath),
      mtimeMs: Math.round(stat.mtimeMs),
      size: stat.size,
      symlink: false,
      absolutePath,
    }
  }
}

async function readEmbeddedTags(absolutePath: string): Promise<EmbeddedTags | null> {
  try {
    let parsed = await parseFile(absolutePath, { skipCovers: true, duration: true })
    let durationMs =
      typeof parsed.format.duration === 'number'
        ? Math.round(parsed.format.duration * 1000)
        : null
    return {
      title: parsed.common.title ?? null,
      artist: parsed.common.artist ?? parsed.common.artists?.[0] ?? null,
      album: parsed.common.album ?? null,
      albumArtist: parsed.common.albumartist ?? null,
      trackNumber: parsed.common.track.no ?? null,
      discNumber: parsed.common.disk.no ?? null,
      durationMs,
    }
  } catch {
    return null
  }
}

async function requireActiveAdmin(database: AppDatabase, actor: HouseholdMember) {
  let current = await findMemberById(database, actor.id)
  if (current == null || current.disabledAt != null || current.role !== 'admin') {
    throw new LibraryError('not_admin', 'Only an Admin can start a Scan run')
  }
}

function loadTrackByPath(database: AppDatabase, relativePath: string): Track | null {
  let row = database.sqlite
    .prepare(
      `SELECT id, path, title, artist, album, album_artist, disc_number, track_number,
              duration_ms, mime, mtime_ms, size
       FROM tracks
       WHERE path = ?`,
    )
    .get(relativePath) as TrackRow | undefined
  return row ? toTrack(row) : null
}

function toTrack(row: TrackRow): Track {
  return {
    id: row.id,
    path: row.path,
    title: row.title,
    artist: row.artist,
    album: row.album,
    albumArtist: row.album_artist,
    discNumber: row.disc_number,
    trackNumber: row.track_number,
    durationMs: row.duration_ms,
    mime: row.mime,
    mtimeMs: row.mtime_ms,
    size: row.size,
  }
}

function toLastResult(row: ScanRunRow): ScanLastResult {
  return {
    outcome: row.status === 'succeeded' ? 'succeeded' : 'failed',
    startedAt: row.started_at,
    finishedAt: row.finished_at ?? row.started_at,
    tracksSeen: row.tracks_seen ?? 0,
    tracksUpserted: row.tracks_upserted ?? 0,
    tracksPruned: row.tracks_pruned ?? 0,
    error: row.error,
  }
}

function mimeForPath(relativePath: string): string {
  let basename = relativePath.split('/').at(-1) ?? relativePath
  let extension = extensionOf(basename)
  return (extension && MIME_BY_EXTENSION[extension]) || 'application/octet-stream'
}

function matchesScanGlobs(relativePath: string, globs: string[]): boolean {
  if (globs.length === 0) {
    return true
  }
  return globs.some((glob) => matchGlob(glob, relativePath))
}

function matchGlob(glob: string, value: string): boolean {
  let escaped = glob.replace(/[.+^${}()|[\]\\]/g, '\\$&')
  let pattern = escaped.replaceAll('**', '\0').replaceAll('*', '[^/]*').replaceAll('\0', '.*')
  return new RegExp(`^${pattern}$`, 'i').test(value)
}

function isNotFound(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error != null &&
    'code' in error &&
    (error as { code?: string }).code === 'ENOENT'
  )
}
