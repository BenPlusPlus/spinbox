/** Typed env (`LIBRARY_ROOT`, `SPINBOX_DATA_DIR`, `SPINBOX_PUBLIC_URL`). Fail-fast at boot. */
import * as path from 'node:path'

const DEFAULT_PORT = 44100
const DEFAULT_LIBRARY_ROOT = 'data/library'
const DEFAULT_DATA_DIR = 'data/app'

export class ConfigError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ConfigError'
  }
}

export type AppConfig = {
  libraryRoot: string
  dataDir: string
  publicUrl: URL
  port: number
}

export type EnvSource = Record<string, string | undefined>

/** Canonical origin for cookies, redirects, and absolute links. Always SPINBOX_PUBLIC_URL. */
export function publicOrigin(config: AppConfig): string {
  return config.publicUrl.origin
}

export function loadConfig(env: EnvSource = process.env): AppConfig {
  let development = env.NODE_ENV === 'development'
  let problems: string[] = []

  let libraryRoot = readAbsolutePath(
    env.LIBRARY_ROOT,
    'LIBRARY_ROOT',
    development ? path.resolve(DEFAULT_LIBRARY_ROOT) : undefined,
    problems,
  )
  let dataDir = readAbsolutePath(
    env.SPINBOX_DATA_DIR,
    'SPINBOX_DATA_DIR',
    development ? path.resolve(DEFAULT_DATA_DIR) : undefined,
    problems,
  )
  let port = readPort(env, development, problems)
  let publicUrl = readPublicUrl(env.SPINBOX_PUBLIC_URL, port, development, problems)

  if (libraryRoot && dataDir && isPathInside(dataDir, libraryRoot)) {
    problems.push('SPINBOX_DATA_DIR must not be under the Library (LIBRARY_ROOT)')
  }

  if (problems.length > 0) {
    throw new ConfigError(`Invalid Spinbox configuration:\n- ${problems.join('\n- ')}`)
  }

  return {
    libraryRoot: libraryRoot!,
    dataDir: dataDir!,
    publicUrl: publicUrl!,
    port: port!,
  }
}

function readAbsolutePath(
  value: string | undefined,
  name: string,
  fallback: string | undefined,
  problems: string[],
): string | undefined {
  let trimmed = value?.trim()
  if (!trimmed) {
    if (fallback) {
      return fallback
    }
    problems.push(`${name} is required`)
    return undefined
  }

  if (!path.isAbsolute(trimmed)) {
    problems.push(`${name} must be an absolute path`)
    return undefined
  }

  return path.normalize(trimmed)
}

function readPort(env: EnvSource, development: boolean, problems: string[]): number | undefined {
  let raw = env.SPINBOX_PORT?.trim() || env.PORT?.trim()
  if (!raw) {
    if (development) {
      return DEFAULT_PORT
    }
    problems.push('Listen port is required (set PORT or SPINBOX_PORT)')
    return undefined
  }

  if (!/^\d+$/.test(raw)) {
    problems.push('Listen port must be an integer between 1 and 65535 (PORT or SPINBOX_PORT)')
    return undefined
  }

  let port = Number.parseInt(raw, 10)
  if (port < 1 || port > 65535) {
    problems.push('Listen port must be an integer between 1 and 65535 (PORT or SPINBOX_PORT)')
    return undefined
  }

  return port
}

function readPublicUrl(
  value: string | undefined,
  port: number | undefined,
  development: boolean,
  problems: string[],
): URL | undefined {
  let trimmed = value?.trim()
  if (!trimmed) {
    if (development && port !== undefined) {
      return new URL(`http://127.0.0.1:${port}`)
    }
    problems.push('SPINBOX_PUBLIC_URL is required')
    return undefined
  }

  let parsed: URL
  try {
    parsed = new URL(trimmed)
  } catch {
    problems.push('SPINBOX_PUBLIC_URL must be an absolute http(s) origin (scheme + host)')
    return undefined
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    problems.push('SPINBOX_PUBLIC_URL must be an absolute http(s) origin (scheme + host)')
    return undefined
  }

  if (parsed.username || parsed.password) {
    problems.push('SPINBOX_PUBLIC_URL must not include credentials')
    return undefined
  }

  if (parsed.search || parsed.hash || (parsed.pathname !== '/' && parsed.pathname !== '')) {
    problems.push('SPINBOX_PUBLIC_URL must be an origin only (scheme + host[+port], no path)')
    return undefined
  }

  return parsed
}

function isPathInside(inner: string, outer: string): boolean {
  let resolvedInner = path.resolve(inner)
  let resolvedOuter = path.resolve(outer)
  if (process.platform === 'win32') {
    resolvedInner = resolvedInner.toLowerCase()
    resolvedOuter = resolvedOuter.toLowerCase()
  }
  let relative = path.relative(resolvedOuter, resolvedInner)
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative))
}
