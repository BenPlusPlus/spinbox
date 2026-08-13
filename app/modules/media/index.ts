/** Authenticated range delivery, weak ETag / status map, stream-source seam. */
import * as fs from 'node:fs/promises'
import * as path from 'node:path'

import { openLazyFile } from 'remix/fs'
import { createFileResponse } from 'remix/response/file'

import type { AppDatabase } from '../../data/index.ts'
import type { HouseholdMember } from '../auth/index.ts'
import type { AppConfig } from '../config/index.ts'
import { findTrackById, normalizeLibraryPath, type Track } from '../library/index.ts'

export type StreamSource = {
  absolutePath: string
  mime: string
}

/** v1 stream-source adapter: the original file jailed under LIBRARY_ROOT. */
export function resolveSource(track: Track, libraryRoot: string): StreamSource | null {
  let relative = normalizeLibraryPath(track.path)
  if (!relative || relative.includes('\0')) {
    return null
  }

  let segments = relative.split('/').filter((segment) => segment.length > 0 && segment !== '.')
  if (segments.length === 0 || segments.some((segment) => segment === '..')) {
    return null
  }

  let root = path.resolve(libraryRoot)
  let absolutePath = path.resolve(root, ...segments)
  if (!isPathInside(absolutePath, root)) {
    return null
  }

  return { absolutePath, mime: track.mime }
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

async function isLibraryMountHealthy(libraryRoot: string): Promise<boolean> {
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

function isPathInside(inner: string, outer: string): boolean {
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
