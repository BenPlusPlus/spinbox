import type { Handle } from 'remix/ui'
import { css } from 'remix/ui'

import type { HouseholdMember } from '../modules/auth/index.ts'
import type { ScanStatus } from '../modules/library/index.ts'
import { routes } from '../routes.ts'
import { AppChrome, type ChromeState } from './app-chrome.tsx'

export function SettingsPage(
  handle: Handle<{
    member: HouseholdMember
    members?: HouseholdMember[]
    scanStatus?: ScanStatus
    error?: string
    notice?: string
    chrome?: ChromeState
  }>,
) {
  return () => {
    let { member, members, scanStatus, error, notice, chrome } = handle.props

    return (
      <AppChrome title="Settings · Spinbox" current="settings" chrome={chrome}>
        <main>
          <h1 mix={heading}>Settings</h1>
          <p mix={copy}>
            {member.mustChangePassword
              ? 'An Admin set a temporary password. Change it before you continue.'
              : 'Update your display name or password. Sign out when you are done.'}
          </p>
          {error ? <p mix={errorBox}>{error}</p> : null}
          {notice ? <p mix={noticeBox}>{notice}</p> : null}

          {member.mustChangePassword ? null : (
            <>
              <h2 mix={subheading}>Display name</h2>
              <form method="POST" action={routes.settings.action.href()} mix={stack}>
                <input type="hidden" name="intent" value="displayName" />
                <label mix={field}>
                  Display name
                  <input
                    mix={input}
                    type="text"
                    name="displayName"
                    autoComplete="nickname"
                    value={member.displayName ?? ''}
                  />
                </label>
                <button mix={submit} type="submit">
                  Save display name
                </button>
              </form>
            </>
          )}

          <h2 mix={subheading}>Password</h2>
          <form method="POST" action={routes.settings.action.href()} mix={stack}>
            <input type="hidden" name="intent" value="password" />
            <label mix={field}>
              Current password
              <input
                mix={input}
                type="password"
                name="currentPassword"
                autoComplete="current-password"
                required
              />
            </label>
            <label mix={field}>
              New password
              <input
                mix={input}
                type="password"
                name="newPassword"
                autoComplete="new-password"
                required
                minLength={8}
              />
            </label>
            <button mix={submit} type="submit">
              Change password
            </button>
          </form>

          {member.role === 'admin' && scanStatus && !member.mustChangePassword ? (
            <>
              <h2 mix={subheading}>Library Scan run</h2>
              <p mix={copy}>{scanStatusCopy(scanStatus)}</p>
              <form method="POST" action={routes.scanNow.href()}>
                <button mix={submit} type="submit" disabled={scanStatus.state === 'running'}>
                  Scan now
                </button>
              </form>
            </>
          ) : null}

          {member.role === 'admin' && members && !member.mustChangePassword ? (
            <>
              <h2 mix={subheading}>Household members</h2>
              <p mix={copy}>
                Promote or demote roles. Disable to block sign-in and keep their data. Hard delete is
                permanent. Invites live on a separate page.
              </p>
              <p mix={copy}>
                <a href={routes.invites.index.href()}>Invites</a>
              </p>
              <ul mix={list}>
                {members.map((row) => (
                  <li mix={rowStyle}>
                    <div>
                      <strong>{row.displayName ?? row.email}</strong>
                      {row.displayName ? ` · ${row.email}` : ''}
                      {' · '}
                      {row.role === 'admin' ? 'Admin' : 'Member'}
                      {row.disabledAt ? ' · Disabled' : ''}
                    </div>
                    <div mix={actions}>
                      {row.role === 'member' ? (
                        <form method="POST" action={routes.memberPromote.href({ id: row.id })}>
                          <button mix={action} type="submit">
                            Promote
                          </button>
                        </form>
                      ) : (
                        <form method="POST" action={routes.memberDemote.href({ id: row.id })}>
                          <button mix={action} type="submit">
                            Demote
                          </button>
                        </form>
                      )}
                      {row.disabledAt ? (
                        <form method="POST" action={routes.memberEnable.href({ id: row.id })}>
                          <button mix={action} type="submit">
                            Re-enable
                          </button>
                        </form>
                      ) : (
                        <form method="POST" action={routes.memberDisable.href({ id: row.id })}>
                          <button mix={action} type="submit">
                            Disable
                          </button>
                        </form>
                      )}
                      <form method="POST" action={routes.memberTemporaryPassword.href({ id: row.id })}>
                        <input
                          mix={inlineInput}
                          type="password"
                          name="password"
                          placeholder="Temporary password"
                          required
                          minLength={8}
                        />
                        <button mix={action} type="submit">
                          Set temporary password
                        </button>
                      </form>
                      <form method="POST" action={routes.memberHardDelete.href({ id: row.id })}>
                        <button mix={danger} type="submit">
                          Hard delete
                        </button>
                      </form>
                    </div>
                  </li>
                ))}
              </ul>
            </>
          ) : null}

          <form method="POST" action={routes.logout.href()}>
            <button mix={signOut} type="submit">
              Sign out
            </button>
          </form>
        </main>
      </AppChrome>
    )
  }
}

function scanStatusCopy(status: ScanStatus): string {
  if (status.state === 'running') {
    return 'Scan run: running'
  }
  if (!status.lastResult) {
    return 'Scan run: idle'
  }
  let result = status.lastResult
  if (result.outcome === 'succeeded') {
    return `Last Scan run: succeeded · ${result.tracksSeen} Tracks`
  }
  return `Last Scan run: failed${result.error ? ` · ${result.error}` : ''}`
}

let heading = css({
  margin: '0 0 0.5rem',
  fontSize: '2rem',
  fontFamily: 'Fraunces, Georgia, serif',
})

let subheading = css({
  margin: '2rem 0 0.75rem',
  fontSize: '1.2rem',
})

let copy = css({
  margin: '0 0 1.25rem',
  maxWidth: '36rem',
  lineHeight: 1.5,
  color: '#4a4038',
})

let errorBox = css({
  margin: '0 0 1rem',
  padding: '0.65rem 0.75rem',
  maxWidth: '36rem',
  background: '#f3d6cc',
  color: '#6b2414',
  fontFamily: 'system-ui, sans-serif',
})

let noticeBox = css({
  margin: '0 0 1rem',
  padding: '0.65rem 0.75rem',
  maxWidth: '36rem',
  background: '#1a1410',
  color: '#f4efe6',
  fontFamily: 'system-ui, sans-serif',
})

let stack = css({
  display: 'grid',
  gap: '0.75rem',
  maxWidth: '22rem',
})

let field = css({
  display: 'grid',
  gap: '0.35rem',
  fontFamily: 'system-ui, sans-serif',
  fontSize: '0.95rem',
})

let input = css({
  padding: '0.65rem 0.7rem',
  border: '1px solid #c4b8a8',
  borderRadius: '2px',
  background: '#fffdf8',
  font: 'inherit',
})

let submit = css({
  padding: '0.7rem 0.9rem',
  border: 0,
  borderRadius: '2px',
  background: '#1a1410',
  color: '#f4efe6',
  fontFamily: 'system-ui, sans-serif',
  fontWeight: 600,
  cursor: 'pointer',
})

let list = css({
  listStyle: 'none',
  margin: 0,
  padding: 0,
  maxWidth: '48rem',
})

let rowStyle = css({
  display: 'grid',
  gap: '0.65rem',
  padding: '0.85rem 0',
  borderTop: '1px solid #d9cfc0',
  fontFamily: 'system-ui, sans-serif',
  fontSize: '0.95rem',
})

let actions = css({
  display: 'flex',
  flexWrap: 'wrap',
  gap: '0.5rem',
  alignItems: 'center',
})

let action = css({
  padding: '0.35rem 0.65rem',
  border: '1px solid #1a1410',
  borderRadius: '2px',
  background: 'transparent',
  font: 'inherit',
  cursor: 'pointer',
})

let danger = css({
  padding: '0.35rem 0.65rem',
  border: '1px solid #6b2414',
  borderRadius: '2px',
  background: 'transparent',
  color: '#6b2414',
  font: 'inherit',
  cursor: 'pointer',
})

let inlineInput = css({
  padding: '0.35rem 0.5rem',
  border: '1px solid #c4b8a8',
  borderRadius: '2px',
  background: '#fffdf8',
  font: 'inherit',
})

let signOut = css({
  marginTop: '2rem',
  padding: '0.55rem 0.8rem',
  border: '1px solid #1a1410',
  borderRadius: '2px',
  background: 'transparent',
  fontFamily: 'system-ui, sans-serif',
  cursor: 'pointer',
})
