/** `remix/auth` wiring, credentials, cookie sessions, roles, Invites, Household member lifecycle. */
import { createHash, randomBytes, scrypt, timingSafeEqual } from 'node:crypto'

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
const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000
const INVITE_TOKEN_BYTES = 32

export type MemberRole = 'admin' | 'member'

export type HouseholdMember = {
  id: string
  email: string
  displayName: string | null
  role: MemberRole
  disabledAt: string | null
  createdAt: string
  mustChangePassword: boolean
  sessionEpoch: number
}

type AuthSessionRecord = {
  memberId: string
  sessionEpoch: number
}

export type InviteStatus = 'unused' | 'revoked' | 'expired' | 'accepted'

export type Invite = {
  id: string
  email: string | null
  createdBy: string
  expiresAt: string
  revokedAt: string | null
  acceptedAt: string | null
  acceptedBy: string | null
  createdAt: string
  status: InviteStatus
}

export type MintedInvite = Invite & {
  token: string
}

export type AuthErrorCode =
  | 'setup_unavailable'
  | 'invalid_email'
  | 'invalid_password'
  | 'not_admin'
  | 'invite_unavailable'
  | 'email_taken'
  | 'last_admin'
  | 'member_unavailable'

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
  must_change_password: number
  session_epoch: number
}

type InviteRow = {
  id: string
  email: string | null
  created_by: string
  expires_at: string
  revoked_at: string | null
  accepted_at: string | null
  accepted_by: string | null
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
  let email = parseEmail(input.email)
  let password = parsePassword(input.password)
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

    insertMemberRow(database, {
      id,
      email,
      displayName,
      role: 'admin',
      createdAt,
      passwordHash,
    })
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
    mustChangePassword: false,
    sessionEpoch: 0,
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
      `SELECT m.id, m.email, m.display_name, m.role, m.disabled_at, m.created_at,
              m.must_change_password, m.session_epoch, c.password_hash
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
      `SELECT id, email, display_name, role, disabled_at, created_at,
              must_change_password, session_epoch
       FROM members
       WHERE id = ?`,
    )
    .get(id) as MemberRow | undefined

  return row ? toHouseholdMember(row) : null
}

export async function mintInvite(
  database: AppDatabase,
  actor: HouseholdMember,
  input: { email?: string | null; now?: Date } = {},
): Promise<MintedInvite> {
  await requireActiveAdmin(database, actor)

  let email = parseOptionalEmail(input.email)
  let now = input.now ?? new Date()
  let id = crypto.randomUUID()
  let token = randomBytes(INVITE_TOKEN_BYTES).toString('base64url')
  let createdAt = now.toISOString()
  let expiresAt = new Date(now.getTime() + INVITE_TTL_MS).toISOString()

  database.sqlite
    .prepare(
      `INSERT INTO invites (id, token_hash, email, created_by, expires_at, revoked_at, accepted_at, accepted_by, created_at)
       VALUES (?, ?, ?, ?, ?, NULL, NULL, NULL, ?)`,
    )
    .run(id, hashInviteToken(token), email, actor.id, expiresAt, createdAt)

  return {
    id,
    token,
    email,
    createdBy: actor.id,
    expiresAt,
    revokedAt: null,
    acceptedAt: null,
    acceptedBy: null,
    createdAt,
    status: 'unused',
  }
}

export async function listInvites(
  database: AppDatabase,
  actor: HouseholdMember,
  input: { now?: Date } = {},
): Promise<Invite[]> {
  await requireActiveAdmin(database, actor)
  let now = input.now ?? new Date()
  let rows = database.sqlite
    .prepare(
      `SELECT id, email, created_by, expires_at, revoked_at, accepted_at, accepted_by, created_at
       FROM invites
       ORDER BY created_at DESC`,
    )
    .all() as InviteRow[]
  return rows.map((row) => toInvite(row, now))
}

export async function findInviteByToken(
  database: AppDatabase,
  token: string,
  input: { now?: Date } = {},
): Promise<Invite | null> {
  let row = loadInviteByToken(database, token)
  return row ? toInvite(row, input.now ?? new Date()) : null
}

export async function revokeInvite(
  database: AppDatabase,
  actor: HouseholdMember,
  inviteId: string,
  input: { now?: Date } = {},
): Promise<Invite> {
  await requireActiveAdmin(database, actor)
  let now = input.now ?? new Date()
  let revokedAt = now.toISOString()

  database.sqlite.exec('BEGIN IMMEDIATE')
  try {
    let row = database.sqlite
      .prepare(
        `SELECT id, email, created_by, expires_at, revoked_at, accepted_at, accepted_by, created_at
         FROM invites
         WHERE id = ?`,
      )
      .get(inviteId) as InviteRow | undefined

    if (row == null || inviteStatus(row, now) !== 'unused') {
      throw new AuthError('invite_unavailable', 'This Invite cannot be revoked')
    }

    let revoked = database.sqlite
      .prepare(
        `UPDATE invites
         SET revoked_at = ?
         WHERE id = ? AND accepted_at IS NULL AND revoked_at IS NULL AND expires_at > ?`,
      )
      .run(revokedAt, inviteId, revokedAt)
    if (revoked.changes !== 1) {
      throw new AuthError('invite_unavailable', 'This Invite cannot be revoked')
    }
    database.sqlite.exec('COMMIT')
    return toInvite({ ...row, revoked_at: revokedAt }, now)
  } catch (error) {
    database.sqlite.exec('ROLLBACK')
    throw error
  }
}

export async function redeemInvite(
  database: AppDatabase,
  input: {
    token: string
    email: string
    password: string
    displayName?: string | null
    now?: Date
  },
): Promise<HouseholdMember> {
  let email = parseEmail(input.email)
  let password = parsePassword(input.password)
  let displayName = normalizeDisplayName(input.displayName)
  let now = input.now ?? new Date()
  let passwordHash = await hashPassword(password)
  let id = crypto.randomUUID()
  let createdAt = now.toISOString()

  database.sqlite.exec('BEGIN IMMEDIATE')
  try {
    let invite = loadInviteByToken(database, input.token)
    if (invite == null || inviteStatus(invite, now) !== 'unused') {
      throw new AuthError('invite_unavailable', 'This Invite cannot be used')
    }

    if (invite.email != null && invite.email !== email) {
      throw new AuthError('invalid_email', 'This Invite is for a different email address')
    }

    insertMemberRow(database, {
      id,
      email,
      displayName,
      role: 'member',
      createdAt,
      passwordHash,
    })
    let accepted = database.sqlite
      .prepare(
        `UPDATE invites
         SET accepted_at = ?, accepted_by = ?
         WHERE id = ? AND accepted_at IS NULL AND revoked_at IS NULL AND expires_at > ?`,
      )
      .run(createdAt, id, invite.id, createdAt)
    if (accepted.changes !== 1) {
      throw new AuthError('invite_unavailable', 'This Invite cannot be used')
    }
    database.sqlite.exec('COMMIT')
  } catch (error) {
    database.sqlite.exec('ROLLBACK')
    if (isUniqueConstraint(error)) {
      throw new AuthError('email_taken', 'A Household member with that email already exists')
    }
    throw error
  }

  return {
    id,
    email,
    displayName,
    role: 'member',
    disabledAt: null,
    createdAt,
    mustChangePassword: false,
    sessionEpoch: 0,
  }
}

export async function listMembers(
  database: AppDatabase,
  actor: HouseholdMember,
): Promise<HouseholdMember[]> {
  await requireActiveAdmin(database, actor)
  let rows = database.sqlite
    .prepare(
      `SELECT id, email, display_name, role, disabled_at, created_at,
              must_change_password, session_epoch
       FROM members
       ORDER BY created_at ASC`,
    )
    .all() as MemberRow[]
  return rows.map(toHouseholdMember)
}

export async function promoteMember(
  database: AppDatabase,
  actor: HouseholdMember,
  memberId: string,
): Promise<HouseholdMember> {
  await requireActiveAdmin(database, actor)
  return setMemberRole(database, memberId, 'admin')
}

export async function demoteMember(
  database: AppDatabase,
  actor: HouseholdMember,
  memberId: string,
): Promise<HouseholdMember> {
  await requireActiveAdmin(database, actor)
  return setMemberRole(database, memberId, 'member')
}

function setMemberRole(
  database: AppDatabase,
  memberId: string,
  role: MemberRole,
): HouseholdMember {
  database.sqlite.exec('BEGIN IMMEDIATE')
  try {
    let row = loadMemberRow(database, memberId)
    if (row == null) {
      throw new AuthError('member_unavailable', 'That Household member was not found')
    }

    if (row.role !== role) {
      if (role === 'member') {
        rejectIfLastActiveAdmin(database, row)
      }
      database.sqlite.prepare('UPDATE members SET role = ? WHERE id = ?').run(role, memberId)
      row = { ...row, role }
    }

    database.sqlite.exec('COMMIT')
    return toHouseholdMember(row)
  } catch (error) {
    database.sqlite.exec('ROLLBACK')
    throw error
  }
}

function loadMemberRow(database: AppDatabase, memberId: string): MemberRow | undefined {
  return database.sqlite
    .prepare(
      `SELECT id, email, display_name, role, disabled_at, created_at,
              must_change_password, session_epoch
       FROM members
       WHERE id = ?`,
    )
    .get(memberId) as MemberRow | undefined
}

export async function disableMember(
  database: AppDatabase,
  actor: HouseholdMember,
  memberId: string,
  input: { now?: Date } = {},
): Promise<HouseholdMember> {
  await requireActiveAdmin(database, actor)
  let now = input.now ?? new Date()
  let disabledAt = now.toISOString()

  database.sqlite.exec('BEGIN IMMEDIATE')
  try {
    let row = loadMemberRow(database, memberId)
    if (row == null) {
      throw new AuthError('member_unavailable', 'That Household member was not found')
    }

    if (row.disabled_at == null) {
      rejectIfLastActiveAdmin(database, row)
      database.sqlite
        .prepare('UPDATE members SET disabled_at = ?, session_epoch = session_epoch + 1 WHERE id = ?')
        .run(disabledAt, memberId)
      row = { ...row, disabled_at: disabledAt, session_epoch: row.session_epoch + 1 }
    }

    database.sqlite.exec('COMMIT')
    return toHouseholdMember(row)
  } catch (error) {
    database.sqlite.exec('ROLLBACK')
    throw error
  }
}

export async function hardDeleteMember(
  database: AppDatabase,
  actor: HouseholdMember,
  memberId: string,
): Promise<void> {
  await requireActiveAdmin(database, actor)

  database.sqlite.exec('BEGIN IMMEDIATE')
  try {
    let row = loadMemberRow(database, memberId)
    if (row == null) {
      throw new AuthError('member_unavailable', 'That Household member was not found')
    }

    rejectIfLastActiveAdmin(database, row)
    database.sqlite.prepare('DELETE FROM invites WHERE created_by = ?').run(memberId)
    database.sqlite
      .prepare('UPDATE invites SET accepted_by = NULL WHERE accepted_by = ?')
      .run(memberId)
    database.sqlite.prepare('DELETE FROM credentials WHERE member_id = ?').run(memberId)
    database.sqlite.prepare('DELETE FROM members WHERE id = ?').run(memberId)
    database.sqlite.exec('COMMIT')
  } catch (error) {
    database.sqlite.exec('ROLLBACK')
    throw error
  }
}

export async function enableMember(
  database: AppDatabase,
  actor: HouseholdMember,
  memberId: string,
): Promise<HouseholdMember> {
  await requireActiveAdmin(database, actor)

  database.sqlite.exec('BEGIN IMMEDIATE')
  try {
    let row = loadMemberRow(database, memberId)
    if (row == null) {
      throw new AuthError('member_unavailable', 'That Household member was not found')
    }

    if (row.disabled_at != null) {
      database.sqlite.prepare('UPDATE members SET disabled_at = NULL WHERE id = ?').run(memberId)
      row = { ...row, disabled_at: null }
    }

    database.sqlite.exec('COMMIT')
    return toHouseholdMember(row)
  } catch (error) {
    database.sqlite.exec('ROLLBACK')
    throw error
  }
}

export async function updateOwnDisplayName(
  database: AppDatabase,
  actor: HouseholdMember,
  displayName: string | null,
): Promise<HouseholdMember> {
  let current = await requireActiveMember(database, actor)
  let nextName = normalizeDisplayName(displayName)

  database.sqlite
    .prepare('UPDATE members SET display_name = ? WHERE id = ?')
    .run(nextName, current.id)

  let updated = await findMemberById(database, current.id)
  if (updated == null) {
    throw new AuthError('member_unavailable', 'That Household member was not found')
  }
  return updated
}

export async function changeOwnPassword(
  database: AppDatabase,
  actor: HouseholdMember,
  input: { currentPassword: string; newPassword: string },
): Promise<HouseholdMember> {
  let current = await requireActiveMember(database, actor)
  let newPassword = parsePassword(input.newPassword)
  let passwordHash = await loadPasswordHash(database, current.id)
  if (passwordHash == null || !(await verifyPassword(input.currentPassword, passwordHash))) {
    throw new AuthError('invalid_password', 'Current password is incorrect')
  }

  return replacePassword(database, current.id, newPassword, { mustChangePassword: false })
}

export async function setTemporaryPassword(
  database: AppDatabase,
  actor: HouseholdMember,
  memberId: string,
  input: { password: string },
): Promise<HouseholdMember> {
  await requireActiveAdmin(database, actor)
  let password = parsePassword(input.password)

  let row = loadMemberRow(database, memberId)
  if (row == null) {
    throw new AuthError('member_unavailable', 'That Household member was not found')
  }

  return replacePassword(database, memberId, password, { mustChangePassword: true })
}

export async function recoverLastAdmin(
  database: AppDatabase,
  input: { email: string; password: string },
): Promise<HouseholdMember> {
  let email = parseEmail(input.email)
  let password = parsePassword(input.password)
  let passwordHash = await hashPassword(password)
  let updatedAt = new Date().toISOString()

  database.sqlite.exec('BEGIN IMMEDIATE')
  try {
    let row = database.sqlite
      .prepare(
        `SELECT id, email, display_name, role, disabled_at, created_at,
                must_change_password, session_epoch
         FROM members
         WHERE email = ?`,
      )
      .get(email) as MemberRow | undefined
    if (row == null) {
      throw new AuthError('member_unavailable', 'That Household member was not found')
    }

    database.sqlite
      .prepare(
        `UPDATE members
         SET role = 'admin',
             disabled_at = NULL,
             must_change_password = 0,
             session_epoch = session_epoch + 1
         WHERE id = ?`,
      )
      .run(row.id)
    database.sqlite
      .prepare(
        `UPDATE credentials
         SET password_hash = ?, updated_at = ?
         WHERE member_id = ?`,
      )
      .run(passwordHash, updatedAt, row.id)

    let updated = loadMemberRow(database, row.id)
    if (updated == null) {
      throw new AuthError('member_unavailable', 'That Household member was not found')
    }
    database.sqlite.exec('COMMIT')
    return toHouseholdMember(updated)
  } catch (error) {
    database.sqlite.exec('ROLLBACK')
    throw error
  }
}

async function replacePassword(
  database: AppDatabase,
  memberId: string,
  password: string,
  options: { mustChangePassword: boolean },
): Promise<HouseholdMember> {
  let passwordHash = await hashPassword(password)
  let updatedAt = new Date().toISOString()
  let mustChange = options.mustChangePassword ? 1 : 0

  database.sqlite.exec('BEGIN IMMEDIATE')
  try {
    let row = loadMemberRow(database, memberId)
    if (row == null) {
      throw new AuthError('member_unavailable', 'That Household member was not found')
    }

    database.sqlite
      .prepare(
        `UPDATE credentials
         SET password_hash = ?, updated_at = ?
         WHERE member_id = ?`,
      )
      .run(passwordHash, updatedAt, memberId)
    database.sqlite
      .prepare(
        `UPDATE members
         SET must_change_password = ?, session_epoch = session_epoch + 1
         WHERE id = ?`,
      )
      .run(mustChange, memberId)

    let updated = loadMemberRow(database, memberId)
    if (updated == null) {
      throw new AuthError('member_unavailable', 'That Household member was not found')
    }
    database.sqlite.exec('COMMIT')
    return toHouseholdMember(updated)
  } catch (error) {
    database.sqlite.exec('ROLLBACK')
    throw error
  }
}

function loadPasswordHash(database: AppDatabase, memberId: string): string | null {
  let row = database.sqlite
    .prepare('SELECT password_hash FROM credentials WHERE member_id = ?')
    .get(memberId) as { password_hash: string } | undefined
  return row?.password_hash ?? null
}

async function requireActiveMember(
  database: AppDatabase,
  actor: HouseholdMember,
): Promise<HouseholdMember> {
  let current = await findActiveMemberById(database, actor.id)
  if (current == null) {
    throw new AuthError('member_unavailable', 'That Household member was not found')
  }
  return current
}

function rejectIfLastActiveAdmin(database: AppDatabase, target: MemberRow) {
  if (target.role !== 'admin' || target.disabled_at != null) {
    return
  }

  let row = database.sqlite
    .prepare(
      `SELECT COUNT(*) AS count
       FROM members
       WHERE role = 'admin' AND disabled_at IS NULL`,
    )
    .get() as { count: number }

  if (row.count <= 1) {
    throw new AuthError('last_admin', 'The last Admin cannot be demoted, Disabled, or Hard deleted')
  }
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

async function findActiveMemberSession(
  database: AppDatabase,
  id: string,
  sessionEpoch: number,
): Promise<HouseholdMember | null> {
  let member = await findActiveMemberById(database, id)
  if (member == null || member.sessionEpoch !== sessionEpoch) {
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

      return {
        memberId: record.memberId,
        sessionEpoch: typeof record.sessionEpoch === 'number' ? record.sessionEpoch : 0,
      }
    },
    verify(value) {
      return findActiveMemberSession(database, value.memberId, value.sessionEpoch)
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
  session.set(AUTH_SESSION_KEY, {
    memberId: member.id,
    sessionEpoch: member.sessionEpoch,
  } satisfies AuthSessionRecord)
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
    mustChangePassword: row.must_change_password === 1,
    sessionEpoch: row.session_epoch,
  }
}

function parseEmail(value: string): string {
  let email = normalizeEmail(value)
  if (!email || !EMAIL_PATTERN.test(email)) {
    throw new AuthError('invalid_email', 'Enter a valid email address')
  }
  return email
}

function parsePassword(password: string): string {
  if (password.length < MIN_PASSWORD_LENGTH || password.length > MAX_PASSWORD_LENGTH) {
    throw new AuthError(
      'invalid_password',
      `Password must be between ${MIN_PASSWORD_LENGTH} and ${MAX_PASSWORD_LENGTH} characters`,
    )
  }
  return password
}

function inviteStatus(invite: InviteRow, now: Date): InviteStatus {
  if (invite.accepted_at != null) {
    return 'accepted'
  }
  if (invite.revoked_at != null) {
    return 'revoked'
  }
  if (now.toISOString() >= invite.expires_at) {
    return 'expired'
  }
  return 'unused'
}

function toInvite(row: InviteRow, now: Date): Invite {
  return {
    id: row.id,
    email: row.email,
    createdBy: row.created_by,
    expiresAt: row.expires_at,
    revokedAt: row.revoked_at,
    acceptedAt: row.accepted_at,
    acceptedBy: row.accepted_by,
    createdAt: row.created_at,
    status: inviteStatus(row, now),
  }
}

function loadInviteByToken(database: AppDatabase, token: string): InviteRow | null {
  if (!token) {
    return null
  }
  let row = database.sqlite
    .prepare(
      `SELECT id, email, created_by, expires_at, revoked_at, accepted_at, accepted_by, created_at
       FROM invites
       WHERE token_hash = ?`,
    )
    .get(hashInviteToken(token)) as InviteRow | undefined
  return row ?? null
}

function insertMemberRow(
  database: AppDatabase,
  input: {
    id: string
    email: string
    displayName: string | null
    role: MemberRole
    createdAt: string
    passwordHash: string
  },
) {
  database.sqlite
    .prepare(
      `INSERT INTO members (id, email, display_name, role, disabled_at, created_at)
       VALUES (?, ?, ?, ?, NULL, ?)`,
    )
    .run(input.id, input.email, input.displayName, input.role, input.createdAt)
  database.sqlite
    .prepare(
      `INSERT INTO credentials (member_id, password_hash, updated_at)
       VALUES (?, ?, ?)`,
    )
    .run(input.id, input.passwordHash, input.createdAt)
}

function isUniqueConstraint(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error != null &&
    'code' in error &&
    (error as { code?: string }).code === 'ERR_SQLITE_ERROR' &&
    'message' in error &&
    typeof (error as { message?: string }).message === 'string' &&
    (error as { message: string }).message.includes('UNIQUE')
  )
}

async function requireActiveAdmin(
  database: AppDatabase,
  actor: HouseholdMember,
): Promise<HouseholdMember> {
  let current = await findActiveMemberById(database, actor.id)
  if (current == null || current.role !== 'admin') {
    throw new AuthError('not_admin', 'Only an Admin can do this')
  }
  return current
}

function hashInviteToken(token: string): string {
  return createHash('sha256').update(token).digest('base64url')
}

function normalizeEmail(value: string): string {
  return value.trim().toLowerCase()
}

function parseOptionalEmail(value: string | null | undefined): string | null {
  let email = value == null ? '' : normalizeEmail(value)
  if (!email) {
    return null
  }
  return parseEmail(email)
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
