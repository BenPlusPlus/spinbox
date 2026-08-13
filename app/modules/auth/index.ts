/** `remix/auth` wiring, credentials, cookie sessions, roles, Invites, Household member lifecycle. */
import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto'

import { completeAuth, createCredentialsAuthProvider } from 'remix/auth'
import { createCookie } from 'remix/cookie'
import { auth, createSessionAuthScheme } from 'remix/middleware/auth'
import { redirect } from 'remix/response/redirect'
import type { Session } from 'remix/session'
import { createCookieSessionStorage } from 'remix/session-storage/cookie'

import type { AppDatabase } from '../../data/index.ts'
import { publicOrigin, type AppConfig } from '../config/index.ts'

const MIN_PASSWORD_LENGTH = 8
const MAX_PASSWORD_LENGTH = 256
const MAX_DISPLAY_NAME_LENGTH = 80
const SCRYPT_N = 16384
const SCRYPT_R = 8
const SCRYPT_P = 1
const SCRYPT_KEYLEN = 32
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const AUTH_SESSION_KEY = 'auth'
const SESSION_COOKIE_NAME = 'spinbox_session'

export type MemberRole = 'admin' | 'member'

export type HouseholdMember = {
  id: string
  email: string
  displayName: string | null
  role: MemberRole
  disabledAt: string | null
  createdAt: string
}

type AuthSessionRecord = {
  memberId: string
}

export type AuthErrorCode = 'setup_unavailable' | 'invalid_email' | 'invalid_password'

export class AuthError extends Error {
  readonly code: AuthErrorCode

  constructor(code: AuthErrorCode, message: string) {
    super(message)
    this.name = 'AuthError'
    this.code = code
  }
}

type MemberRow = {
  id: string
  email: string
  display_name: string | null
  role: MemberRole
  disabled_at: string | null
  created_at: string
}

export async function householdHasMembers(database: AppDatabase): Promise<boolean> {
  let row = database.sqlite.prepare('SELECT COUNT(*) AS count FROM members').get() as {
    count: number
  }
  return row.count > 0
}

export async function createFirstAdmin(
  database: AppDatabase,
  input: { email: string; password: string; displayName?: string | null },
): Promise<HouseholdMember> {
  let email = normalizeEmail(input.email)
  if (!email || !EMAIL_PATTERN.test(email)) {
    throw new AuthError('invalid_email', 'Enter a valid email address')
  }

  let password = input.password
  if (password.length < MIN_PASSWORD_LENGTH || password.length > MAX_PASSWORD_LENGTH) {
    throw new AuthError(
      'invalid_password',
      `Password must be between ${MIN_PASSWORD_LENGTH} and ${MAX_PASSWORD_LENGTH} characters`,
    )
  }

  let displayName = normalizeDisplayName(input.displayName)
  let passwordHash = await hashPassword(password)
  let id = crypto.randomUUID()
  let createdAt = new Date().toISOString()

  database.sqlite.exec('BEGIN IMMEDIATE')
  try {
    let existing = database.sqlite.prepare('SELECT COUNT(*) AS count FROM members').get() as {
      count: number
    }
    if (existing.count > 0) {
      throw new AuthError('setup_unavailable', 'Setup is unavailable once a Household member exists')
    }

    database.sqlite
      .prepare(
        `INSERT INTO members (id, email, display_name, role, disabled_at, created_at)
         VALUES (?, ?, ?, 'admin', NULL, ?)`,
      )
      .run(id, email, displayName, createdAt)
    database.sqlite
      .prepare(
        `INSERT INTO credentials (member_id, password_hash, updated_at)
         VALUES (?, ?, ?)`,
      )
      .run(id, passwordHash, createdAt)
    database.sqlite.exec('COMMIT')
  } catch (error) {
    database.sqlite.exec('ROLLBACK')
    throw error
  }

  return {
    id,
    email,
    displayName,
    role: 'admin',
    disabledAt: null,
    createdAt,
  }
}

export async function authenticateMember(
  database: AppDatabase,
  input: { email: string; password: string },
): Promise<HouseholdMember | null> {
  let email = normalizeEmail(input.email)
  if (!email) {
    return null
  }

  let row = database.sqlite
    .prepare(
      `SELECT m.id, m.email, m.display_name, m.role, m.disabled_at, m.created_at, c.password_hash
       FROM members m
       JOIN credentials c ON c.member_id = m.id
       WHERE m.email = ?`,
    )
    .get(email) as (MemberRow & { password_hash: string }) | undefined

  if (!row || row.disabled_at != null) {
    return null
  }

  if (!(await verifyPassword(input.password, row.password_hash))) {
    return null
  }

  return toHouseholdMember(row)
}

export async function findMemberById(
  database: AppDatabase,
  id: string,
): Promise<HouseholdMember | null> {
  let row = database.sqlite
    .prepare(
      `SELECT id, email, display_name, role, disabled_at, created_at
       FROM members
       WHERE id = ?`,
    )
    .get(id) as MemberRow | undefined

  return row ? toHouseholdMember(row) : null
}

async function findActiveMemberById(
  database: AppDatabase,
  id: string,
): Promise<HouseholdMember | null> {
  let member = await findMemberById(database, id)
  if (member == null || member.disabledAt != null) {
    return null
  }
  return member
}

export function createSessionCookie(config: AppConfig) {
  return createCookie(SESSION_COOKIE_NAME, {
    secrets: [config.sessionSecret],
    httpOnly: true,
    secure: config.publicUrl.protocol === 'https:',
    sameSite: 'Lax',
    path: '/',
  })
}

export function createMemberSessionStorage() {
  return createCookieSessionStorage()
}

export function createMemberPasswordProvider(database: AppDatabase) {
  return createCredentialsAuthProvider({
    parse(context) {
      let formData = context.get(FormData)
      if (formData == null) {
        throw new Error('Expected formData() middleware before verifyCredentials()')
      }

      return {
        email: String(formData.get('email') ?? ''),
        password: String(formData.get('password') ?? ''),
      }
    },
    verify({ email, password }) {
      return authenticateMember(database, { email, password })
    },
  })
}

function createMemberSessionScheme(database: AppDatabase) {
  return createSessionAuthScheme<HouseholdMember, AuthSessionRecord>({
    read(session) {
      let value = session.get(AUTH_SESSION_KEY)
      if (value == null || typeof value !== 'object') {
        return null
      }

      let record = value as Partial<AuthSessionRecord>
      if (typeof record.memberId !== 'string' || record.memberId.length === 0) {
        return null
      }

      return { memberId: record.memberId }
    },
    verify(value) {
      return findActiveMemberById(database, value.memberId)
    },
    invalidate(session) {
      session.unset(AUTH_SESSION_KEY)
    },
  })
}

export function createMemberAuthMiddleware(database: AppDatabase) {
  return auth({
    schemes: [createMemberSessionScheme(database)],
  })
}

function writeAuthSession(session: Session, member: HouseholdMember) {
  session.set(AUTH_SESSION_KEY, { memberId: member.id } satisfies AuthSessionRecord)
}

export function signInMember(context: Parameters<typeof completeAuth>[0], member: HouseholdMember) {
  let session = completeAuth(context)
  writeAuthSession(session, member)
  return session
}

export function signOutMember(session: Session) {
  session.destroy()
}

export function publicRedirect(
  config: AppConfig,
  path: string,
  init?: ResponseInit | number,
): Response {
  return redirect(new URL(path, publicOrigin(config)), init)
}

function toHouseholdMember(row: MemberRow): HouseholdMember {
  return {
    id: row.id,
    email: row.email,
    displayName: row.display_name,
    role: row.role,
    disabledAt: row.disabled_at,
    createdAt: row.created_at,
  }
}

function normalizeEmail(value: string): string {
  return value.trim().toLowerCase()
}

function normalizeDisplayName(value: string | null | undefined): string | null {
  let trimmed = value?.trim() ?? ''
  if (!trimmed) {
    return null
  }
  return trimmed.slice(0, MAX_DISPLAY_NAME_LENGTH)
}

async function hashPassword(password: string): Promise<string> {
  let salt = randomBytes(16)
  let hash = await scryptHash(password, salt, SCRYPT_KEYLEN, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
  })
  return `scrypt$${SCRYPT_N}$${SCRYPT_R}$${SCRYPT_P}$${salt.toString('base64url')}$${hash.toString('base64url')}`
}

async function verifyPassword(password: string, encoded: string): Promise<boolean> {
  let parts = encoded.split('$')
  if (parts.length !== 6 || parts[0] !== 'scrypt') {
    return false
  }

  let n = Number(parts[1])
  let r = Number(parts[2])
  let p = Number(parts[3])
  if (!Number.isInteger(n) || !Number.isInteger(r) || !Number.isInteger(p)) {
    return false
  }

  let salt: Buffer
  let expected: Buffer
  try {
    salt = Buffer.from(parts[4]!, 'base64url')
    expected = Buffer.from(parts[5]!, 'base64url')
  } catch {
    return false
  }

  if (salt.length === 0 || expected.length === 0) {
    return false
  }

  let actual = await scryptHash(password, salt, expected.length, { N: n, r, p })
  if (actual.length !== expected.length) {
    return false
  }

  return timingSafeEqual(actual, expected)
}

function scryptHash(
  password: string,
  salt: Buffer,
  keylen: number,
  options: { N: number; r: number; p: number },
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, keylen, options, (error, derivedKey) => {
      if (error) {
        reject(error)
        return
      }
      resolve(derivedKey)
    })
  })
}
