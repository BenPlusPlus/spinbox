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
  hasArtwork: boolean
}

export type ArtworkKind = 'folder' | 'embedded'

export type TrackArtwork = {
  track: Track
  kind: ArtworkKind
  /** Library-relative folder image path when kind is 'folder'. */
  path: string | null
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
  artwork_kind: ArtworkKind | null
  artwork_path: string | null
  artwork_checked: number
}

const TRACK_COLUMNS = `id, path, title, artist, album, album_artist, disc_number, track_number,
              duration_ms, mime, mtime_ms, size, artwork_kind, artwork_path, artwork_checked`

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
       ORDER BY finished_at DESC, started_at DESC, rowid DESC
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
      `SELECT ${TRACK_COLUMNS}
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
  let row = loadTrackRowById(database, id)
  return row ? toTrack(row) : null
}

/** The recorded artwork source for a Track, or null when it has none. */
export function findTrackArtwork(database: AppDatabase, trackId: string): TrackArtwork | null {
  let row = loadTrackRowById(database, trackId)
  if (row?.artwork_kind == null) {
    return null
  }
  return { track: toTrack(row), kind: row.artwork_kind, path: row.artwork_path }
}

/**
 * Resolve a library-relative path to an absolute path jailed under the Library root.
 * Returns null for empty, `..`-escaping, or NUL-containing paths.
 */
export function resolveLibraryPath(libraryRoot: string, relativePath: string): string | null {
  let relative = normalizeLibraryPath(relativePath)
  if (!relative || relative.includes('\0')) {
    return null
  }

  let segments = relative.split('/').filter((segment) => segment.length > 0 && segment !== '.')
  if (segments.length === 0 || segments.some((segment) => segment === '..')) {
    return null
  }

  let root = path.resolve(libraryRoot)
  let absolutePath = path.resolve(root, ...segments)
  return isPathInside(absolutePath, root) ? absolutePath : null
}

export function isPathInside(inner: string, outer: string): boolean {
  let resolvedInner = path.resolve(inner)
  let resolvedOuter = path.resolve(outer)
  if (process.platform === 'win32') {
    resolvedInner = resolvedInner.toLowerCase()
    resolvedOuter = resolvedOuter.toLowerCase()
  }
  let relative = path.relative(resolvedOuter, resolvedInner)
  if (relative === '' || path.isAbsolute(relative)) {
    return false
  }
  return relative.split(path.sep)[0] !== '..'
}

export type AlbumGroup = {
  key: string
  album: string
  albumArtist: string
  tracks: Track[]
  /** First Track in display order that has artwork. */
  artworkTrackId: string | null
}

export type ArtistGroup = {
  key: string
  artist: string
  albums: AlbumGroup[]
  tracks: Track[]
  /** First Album with artwork, else first matching Track with artwork. */
  artworkTrackId: string | null
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
  return {
    key,
    album: album!,
    albumArtist: albumArtist!,
    tracks,
    artworkTrackId: firstArtworkTrackId(tracks),
  }
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

export type LibrarySearchResults = {
  tracks: Track[]
  albums: AlbumGroup[]
  artists: ArtistGroup[]
}

export function searchLibrary(database: AppDatabase, query: string): LibrarySearchResults {
  let needle = query.trim().toLowerCase()
  if (!needle) {
    return { tracks: [], albums: [], artists: [] }
  }

  let tracks = listTracks(database)
  let matches = (value: string) => value.toLowerCase().includes(needle)

  return {
    tracks: tracks.filter(
      (track) =>
        matches(track.title) ||
        matches(track.artist) ||
        matches(track.album) ||
        matches(track.albumArtist),
    ),
    albums: groupAlbums(tracks).filter(
      (album) => matches(album.album) || matches(album.albumArtist),
    ),
    artists: groupArtists(tracks).filter((artist) => matches(artist.artist)),
  }
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
        artworkTrackId: null,
      }
      groups.set(key, group)
    }
    group.tracks.push(track)
  }
  for (let group of groups.values()) {
    group.tracks.sort(compareAlbumTracks)
    group.artworkTrackId = firstArtworkTrackId(group.tracks)
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
    artworkTrackId:
      albums.find((album) => album.artworkTrackId != null)?.artworkTrackId ??
      firstArtworkTrackId(matching),
  }
}

function firstArtworkTrackId(tracks: readonly Track[]): string | null {
  return tracks.find((track) => track.hasArtwork)?.id ?? null
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
    let folderImages = new Map<string, Promise<string | null>>()
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
      let existing = loadTrackRowByPath(database, relativePath)
      let folderImage = await findFolderImage(config.libraryRoot, relativePath, folderImages)

      if (existing && existing.mtime_ms === file.mtimeMs && existing.size === file.size) {
        await refreshArtwork(database, existing, folderImage, file.absolutePath)
        continue
      }

      let parsed = file.absolutePath ? await readEmbeddedTags(file.absolutePath) : null
      let metadata = resolveTrackMetadata(relativePath, parsed?.tags ?? null)
      let artwork = artworkFor(folderImage, parsed?.hasPicture ?? false)
      let now = new Date().toISOString()
      let mime = mimeForPath(relativePath)

      if (existing) {
        database.sqlite
          .prepare(
            `UPDATE tracks
             SET title = ?, artist = ?, album = ?, album_artist = ?, disc_number = ?,
                 track_number = ?, duration_ms = ?, mime = ?, mtime_ms = ?, size = ?, updated_at = ?,
                 artwork_kind = ?, artwork_path = ?, artwork_checked = 1
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
            artwork.kind,
            artwork.path,
            relativePath,
          )
      } else {
        database.sqlite
          .prepare(
            `INSERT INTO tracks (
               id, path, title, artist, album, album_artist, disc_number, track_number,
               duration_ms, mime, mtime_ms, size, updated_at,
               artwork_kind, artwork_path, artwork_checked
             ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
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
            artwork.kind,
            artwork.path,
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

async function readEmbeddedTags(
  absolutePath: string,
): Promise<{ tags: EmbeddedTags; hasPicture: boolean } | null> {
  try {
    let parsed = await parseFile(absolutePath, { duration: true })
    let durationMs =
      typeof parsed.format.duration === 'number'
        ? Math.round(parsed.format.duration * 1000)
        : null
    return {
      tags: {
        title: parsed.common.title ?? null,
        artist: parsed.common.artist ?? parsed.common.artists?.[0] ?? null,
        album: parsed.common.album ?? null,
        albumArtist: parsed.common.albumartist ?? null,
        trackNumber: parsed.common.track.no ?? null,
        discNumber: parsed.common.disk.no ?? null,
        durationMs,
      },
      hasPicture: (parsed.common.picture?.length ?? 0) > 0,
    }
  } catch {
    return null
  }
}

async function hasEmbeddedPicture(absolutePath: string): Promise<boolean> {
  try {
    let parsed = await parseFile(absolutePath, { duration: false })
    return (parsed.common.picture?.length ?? 0) > 0
  } catch {
    return false
  }
}

const FOLDER_IMAGE_NAMES = ['cover', 'folder', 'front', 'album']
const FOLDER_IMAGE_EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp']

type ArtworkSource = { kind: ArtworkKind | null; path: string | null }

function artworkFor(folderImage: string | null, hasPicture: boolean): ArtworkSource {
  if (folderImage) {
    return { kind: 'folder', path: folderImage }
  }
  return hasPicture ? { kind: 'embedded', path: null } : { kind: null, path: null }
}

/**
 * Library-relative path of the preferred folder image beside a Track, or null.
 * Directory listings are cached per Scan run; any fs error fails soft to null.
 */
function findFolderImage(
  libraryRoot: string,
  trackPath: string,
  cache: Map<string, Promise<string | null>>,
): Promise<string | null> {
  let directory = trackPath.split('/').slice(0, -1).join('/')
  let cached = cache.get(directory)
  if (!cached) {
    cached = lookupFolderImage(libraryRoot, directory)
    cache.set(directory, cached)
  }
  return cached
}

async function lookupFolderImage(libraryRoot: string, directory: string): Promise<string | null> {
  try {
    let root = path.resolve(libraryRoot)
    let absoluteDirectory = directory ? resolveLibraryPath(root, directory) : root
    if (!absoluteDirectory) {
      return null
    }

    let byLowerName = new Map<string, string>()
    for (let entry of await fs.readdir(absoluteDirectory, { withFileTypes: true })) {
      if (entry.isFile()) {
        byLowerName.set(entry.name.toLowerCase(), entry.name)
      }
    }

    for (let name of FOLDER_IMAGE_NAMES) {
      for (let extension of FOLDER_IMAGE_EXTENSIONS) {
        let actual = byLowerName.get(`${name}.${extension}`)
        if (!actual) {
          continue
        }
        let relativePath = directory ? `${directory}/${actual}` : actual
        let absolutePath = resolveLibraryPath(root, relativePath)
        if (!absolutePath) {
          continue
        }
        let stat = await fs.lstat(absolutePath)
        if (!stat.isSymbolicLink() && stat.isFile() && stat.size > 0) {
          return normalizeLibraryPath(relativePath)
        }
      }
    }
    return null
  } catch {
    return null
  }
}

/** Keep artwork columns current for a Track whose audio file did not change. */
async function refreshArtwork(
  database: AppDatabase,
  row: TrackRow,
  folderImage: string | null,
  absolutePath: string | undefined,
) {
  let next: ArtworkSource
  if (folderImage) {
    next = { kind: 'folder', path: folderImage }
  } else if (row.artwork_checked && row.artwork_kind !== 'folder') {
    next = { kind: row.artwork_kind, path: null }
  } else {
    let embedded = absolutePath ? await hasEmbeddedPicture(absolutePath) : false
    next = artworkFor(null, embedded)
  }

  if (
    row.artwork_checked &&
    row.artwork_kind === next.kind &&
    row.artwork_path === next.path
  ) {
    return
  }

  database.sqlite
    .prepare(
      `UPDATE tracks SET artwork_kind = ?, artwork_path = ?, artwork_checked = 1 WHERE id = ?`,
    )
    .run(next.kind, next.path, row.id)
}

async function requireActiveAdmin(database: AppDatabase, actor: HouseholdMember) {
  let current = await findMemberById(database, actor.id)
  if (current == null || current.disabledAt != null || current.role !== 'admin') {
    throw new LibraryError('not_admin', 'Only an Admin can start a Scan run')
  }
}

function loadTrackByPath(database: AppDatabase, relativePath: string): Track | null {
  let row = loadTrackRowByPath(database, relativePath)
  return row ? toTrack(row) : null
}

function loadTrackRowByPath(database: AppDatabase, relativePath: string): TrackRow | undefined {
  return database.sqlite
    .prepare(
      `SELECT ${TRACK_COLUMNS}
       FROM tracks
       WHERE path = ?`,
    )
    .get(relativePath) as TrackRow | undefined
}

function loadTrackRowById(database: AppDatabase, id: string): TrackRow | undefined {
  return database.sqlite
    .prepare(
      `SELECT ${TRACK_COLUMNS}
       FROM tracks
       WHERE id = ?`,
    )
    .get(id) as TrackRow | undefined
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
    hasArtwork: row.artwork_kind != null,
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
