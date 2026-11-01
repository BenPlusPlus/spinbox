/** Authenticated range delivery, weak ETag / status map, stream-source seam. */
import * as fs from 'node:fs/promises'
import * as path from 'node:path'

import { parseFile } from 'music-metadata'
import { openLazyFile } from 'remix/fs'
import { createFileResponse } from 'remix/response/file'

import type { AppDatabase } from '../../data/index.ts'
import type { HouseholdMember } from '../auth/index.ts'
import type { AppConfig } from '../config/index.ts'
import {
  findTrackArtwork,
  findTrackById,
  isLibraryMountHealthy,
  resolveLibraryPath,
  type Track,
} from '../library/index.ts'

export type StreamSource = {
  absolutePath: string
  mime: string
}

/** v1 stream-source adapter: the original file jailed under LIBRARY_ROOT. */
export function resolveSource(track: Track, libraryRoot: string): StreamSource | null {
  let absolutePath = resolveLibraryPath(libraryRoot, track.path)
  return absolutePath ? { absolutePath, mime: track.mime } : null
}

export async function serveTrack(
  database: AppDatabase,
  config: AppConfig,
  request: Request,
  input: { trackId: string; member: HouseholdMember | null },
): Promise<Response> {
  if (input.member == null) {
    return new Response('Unauthorized', { status: 401 })
  }

  let track = findTrackById(database, input.trackId)
  if (track == null) {
    return notFound()
  }

  let source = resolveSource(track, config.libraryRoot)
  if (source == null) {
    return notFound()
  }

  if (!(await isLibraryMountHealthy(config.libraryRoot))) {
    return new Response('Service Unavailable', { status: 503 })
  }

  let fileStat = await statRegularFile(source.absolutePath)
  if (fileStat == null) {
    return notFound()
  }

  let file = openLazyFile(source.absolutePath, {
    type: source.mime,
    lastModified: Math.round(fileStat.mtimeMs),
  })
  return createFileResponse(file, request, {
    cacheControl: 'private, no-cache',
    etag: 'weak',
    acceptRanges: true,
  })
}

const ARTWORK_CACHE_CONTROL = 'private, max-age=86400'

const IMAGE_MIME_BY_EXTENSION: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
}

type EmbeddedImage = { data: Uint8Array; mime: string }

const EMBEDDED_ARTWORK_CACHE_LIMIT = 64
const embeddedArtworkCache = new Map<string, EmbeddedImage>()

/** Album art for a Track: its folder image, else the picture embedded in its tags. */
export async function serveArtwork(
  database: AppDatabase,
  config: AppConfig,
  request: Request,
  input: { trackId: string; member: HouseholdMember | null },
): Promise<Response> {
  if (input.member == null) {
    return new Response('Unauthorized', { status: 401 })
  }

  let artwork = findTrackArtwork(database, input.trackId)
  if (artwork == null) {
    return notFound()
  }

  let sourcePath = artwork.kind === 'folder' ? artwork.path : artwork.track.path
  let absolutePath = sourcePath ? resolveLibraryPath(config.libraryRoot, sourcePath) : null
  if (absolutePath == null) {
    return notFound()
  }

  if (!(await isLibraryMountHealthy(config.libraryRoot))) {
    return new Response('Service Unavailable', { status: 503 })
  }

  let fileStat = await statRegularFile(absolutePath)
  if (fileStat == null) {
    return notFound()
  }

  if (artwork.kind === 'folder') {
    let mime = imageMimeForPath(absolutePath)
    if (mime == null) {
      return notFound()
    }
    let file = openLazyFile(absolutePath, {
      type: mime,
      lastModified: Math.round(fileStat.mtimeMs),
    })
    return createFileResponse(file, request, {
      cacheControl: ARTWORK_CACHE_CONTROL,
      etag: 'weak',
    })
  }

  let mtimeMs = Math.round(fileStat.mtimeMs)
  let etag = `W/"art-${artwork.track.id}-${mtimeMs}-${fileStat.size}"`
  let headers = { 'Cache-Control': ARTWORK_CACHE_CONTROL, ETag: etag }
  if (matchesIfNoneMatch(request.headers.get('If-None-Match'), etag)) {
    return new Response(null, { status: 304, headers })
  }

  let image = await loadEmbeddedImage(`${artwork.track.id}:${mtimeMs}:${fileStat.size}`, absolutePath)
  if (image == null) {
    return notFound()
  }

  return new Response(request.method === 'HEAD' ? null : Buffer.from(image.data), {
    status: 200,
    headers: {
      ...headers,
      'Content-Type': image.mime,
      'Content-Length': String(image.data.byteLength),
    },
  })
}

async function loadEmbeddedImage(cacheKey: string, absolutePath: string): Promise<EmbeddedImage | null> {
  let cached = embeddedArtworkCache.get(cacheKey)
  if (cached) {
    embeddedArtworkCache.delete(cacheKey)
    embeddedArtworkCache.set(cacheKey, cached)
    return cached
  }

  let image: EmbeddedImage | null = null
  try {
    let parsed = await parseFile(absolutePath, { duration: false })
    let pictures = parsed.common.picture ?? []
    let picture =
      pictures.find((candidate) => candidate.type?.toLowerCase() === 'cover (front)') ?? pictures[0]
    if (picture && picture.data.byteLength > 0) {
      image = { data: picture.data, mime: imageMimeForFormat(picture.format) }
    }
  } catch {
    return null
  }
  if (image == null) {
    return null
  }

  embeddedArtworkCache.set(cacheKey, image)
  while (embeddedArtworkCache.size > EMBEDDED_ARTWORK_CACHE_LIMIT) {
    let oldest = embeddedArtworkCache.keys().next().value
    if (oldest === undefined) {
      break
    }
    embeddedArtworkCache.delete(oldest)
  }
  return image
}

function imageMimeForPath(absolutePath: string): string | null {
  let extension = path.extname(absolutePath).slice(1).toLowerCase()
  return IMAGE_MIME_BY_EXTENSION[extension] ?? null
}

function imageMimeForFormat(format: string | undefined): string {
  let value = (format ?? '').trim().toLowerCase()
  if (value.includes('/')) {
    return value === 'image/jpg' ? 'image/jpeg' : value
  }
  return IMAGE_MIME_BY_EXTENSION[value] ?? 'application/octet-stream'
}

function matchesIfNoneMatch(header: string | null, etag: string): boolean {
  if (!header) {
    return false
  }
  let opaque = etag.replace(/^W\//, '')
  return header
    .split(',')
    .map((value) => value.trim())
    .some((value) => value === '*' || value.replace(/^W\//, '') === opaque)
}

function notFound(): Response {
  return new Response('Not Found', { status: 404 })
}

async function statRegularFile(absolutePath: string) {
  try {
    let stat = await fs.lstat(absolutePath)
    if (stat.isSymbolicLink() || !stat.isFile()) {
      return null
    }
    return stat
  } catch {
    return null
  }
}

