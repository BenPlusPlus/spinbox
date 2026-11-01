import type { Handle } from 'remix/component'
import { css } from 'remix/component'

import type { HouseholdMember } from '../modules/auth/index.ts'
import type { ScanStatus } from '../modules/library/index.ts'
import { routes } from '../routes.ts'
import { AppChrome, type ChromeState } from './app-chrome.tsx'
import { icon } from './icons.tsx'
import { alertMessage, noticeMessage, pageHead } from './page-kit.tsx'
import {
  btnDanger,
  btnPrimary,
  btnSecondary,
  btnSmall,
  caps,
  color,
  field,
  formStack,
  input,
  listing,
  meta,
  pageLede,
  section,
  sectionTitle,
  wide,
} from './theme.ts'

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
    let isAdmin = member.role === 'admin' && !member.mustChangePassword

    return (
      <AppChrome title="Settings · Spinbox" current="settings" chrome={chrome}>
        <main>
          {pageHead({
            title: 'Settings',
            lede: member.mustChangePassword
              ? 'An Admin set a temporary password. Change it before you continue.'
              : 'Update your display name or password. Sign out when you are done.',
          })}
          {alertMessage(error)}
          {noticeMessage(notice)}

          <div mix={accountGrid}>
            {member.mustChangePassword ? null : (
              <section>
                <h2 mix={sectionTitle}>Profile</h2>
                <form method="POST" action={routes.settings.action.href()} mix={formStack}>
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
                  <div>
                    <button mix={btnPrimary} type="submit">
                      Save display name
                    </button>
                  </div>
                </form>
              </section>
            )}

            <section>
              <h2 mix={sectionTitle}>Password</h2>
              <form method="POST" action={routes.settings.action.href()} mix={formStack}>
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
                  <span mix={hint}>At least 8 characters.</span>
                </label>
                <div>
                  <button mix={btnPrimary} type="submit">
                    Change password
                  </button>
                </div>
              </form>
            </section>
          </div>

          {isAdmin && scanStatus ? (
            <section mix={section}>
              <h2 mix={sectionTitle}>Library Scan run</h2>
              <div mix={scanPanel}>
                <span mix={[scanLamp, scanStatus.state === 'running' ? scanLampOn : null]} aria-hidden="true"></span>
                <p mix={scanCopy}>{scanStatusCopy(scanStatus)}</p>
                <form method="POST" action={routes.scanNow.href()}>
                  <button mix={btnSecondary} type="submit" disabled={scanStatus.state === 'running'}>
                    {icon('record')}
                    Scan now
                  </button>
                </form>
              </div>
            </section>
          ) : null}

          {isAdmin && members ? (
            <section mix={section}>
              <h2 mix={sectionTitle}>
                Household members
                <a mix={invitesLink} href={routes.invites.index.href()}>
                  {icon('plus')}
                  Invites
                </a>
              </h2>
              <p mix={[pageLede, membersLede]}>
                Promote or demote roles. Disable to block sign-in and keep their data. Hard delete is permanent.
                Invites live on a separate page.
              </p>
              <ul mix={listing}>
                {members.map((row) => (
                  <li mix={memberRow} key={row.id}>
                    <div mix={memberWho}>
                      <strong mix={memberName}>{row.displayName ?? row.email}</strong>
                      {row.displayName ? <span mix={meta}>{row.email}</span> : null}
                      <span mix={tagRow}>
                        <span mix={[caps, tag, row.role === 'admin' ? tagAdmin : null]}>
                          {row.role === 'admin' ? 'Admin' : 'Member'}
                        </span>
                        {row.disabledAt ? <span mix={[caps, tag, tagDisabled]}>Disabled</span> : null}
                      </span>
                    </div>
                    <div mix={memberActions}>
                      {row.role === 'member' ? (
                        <form method="POST" action={routes.memberPromote.href({ id: row.id })}>
                          <button mix={[btnSecondary, btnSmall]} type="submit">
                            Promote
                          </button>
                        </form>
                      ) : (
                        <form method="POST" action={routes.memberDemote.href({ id: row.id })}>
                          <button mix={[btnSecondary, btnSmall]} type="submit">
                            Demote
                          </button>
                        </form>
                      )}
                      {row.disabledAt ? (
                        <form method="POST" action={routes.memberEnable.href({ id: row.id })}>
                          <button mix={[btnSecondary, btnSmall]} type="submit">
                            Re-enable
                          </button>
                        </form>
                      ) : (
                        <form method="POST" action={routes.memberDisable.href({ id: row.id })}>
                          <button mix={[btnSecondary, btnSmall]} type="submit">
                            Disable
                          </button>
                        </form>
                      )}
                      <form method="POST" action={routes.memberHardDelete.href({ id: row.id })}>
                        <button mix={[btnDanger, btnSmall]} type="submit">
                          Hard delete
                        </button>
                      </form>
                    </div>
                    <form
                      method="POST"
                      action={routes.memberTemporaryPassword.href({ id: row.id })}
                      mix={tempForm}
                    >
                      <label mix={[field, tempField]}>
                        Temporary password
                        <input
                          mix={[input, tempInput]}
                          type="password"
                          name="password"
                          autoComplete="new-password"
                          required
                          minLength={8}
                        />
                      </label>
                      <button mix={[btnSecondary, btnSmall]} type="submit">
                        Set temporary password
                      </button>
                    </form>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          <section mix={[section, signOutSection]}>
            <form method="POST" action={routes.logout.href()}>
              <button mix={btnSecondary} type="submit">
                Sign out
              </button>
            </form>
          </section>
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

let accountGrid = css({
  display: 'grid',
  gap: '3rem',
  [wide]: {
    gridTemplateColumns: 'repeat(2, minmax(0, 24rem))',
    gap: '3.5rem',
  },
})

let hint = css({
  color: color.mute,
  fontStretch: '100%',
  fontWeight: 400,
  fontSize: '0.8125rem',
  letterSpacing: 0,
  textTransform: 'none',
})

let scanPanel = css({
  display: 'flex',
  flexWrap: 'wrap',
  alignItems: 'center',
  gap: '0.75rem 1rem',
  maxWidth: '52rem',
})

let scanLamp = css({
  width: '0.6rem',
  height: '0.6rem',
  borderRadius: '50%',
  background: color.rule,
  flex: 'none',
})

let scanLampOn = css({
  background: color.red,
})

let scanCopy = css({
  flex: '1 1 14rem',
  margin: 0,
  fontVariantNumeric: 'tabular-nums',
})

let invitesLink = css({
  display: 'inline-flex',
  alignItems: 'center',
  gap: '0.3rem',
  color: color.ink,
  fontSize: '0.8125rem',
  textDecoration: 'none',
  '& svg': {
    width: '1rem',
    height: '1rem',
  },
  '&:hover': {
    textDecoration: 'underline',
  },
})

let membersLede = css({
  marginBottom: '1.25rem',
  fontSize: '0.9375rem',
})

let memberRow = css({
  display: 'grid',
  gap: '0.85rem 1.5rem',
  padding: '1rem 0.25rem 1.1rem',
  borderBottom: `1px solid ${color.rule}`,
  [wide]: {
    gridTemplateColumns: 'minmax(0, 1fr) auto',
    alignItems: 'start',
  },
})

let memberWho = css({
  display: 'grid',
  gap: '0.1rem',
  minWidth: 0,
})

let memberName = css({
  fontWeight: 650,
  fontSize: '1.0625rem',
})

let tagRow = css({
  display: 'flex',
  gap: '0.35rem',
  marginTop: '0.35rem',
})

let tag = css({
  padding: '0.2rem 0.4rem',
  border: `1px solid ${color.ink}`,
  fontSize: '0.6875rem',
})

let tagAdmin = css({
  background: color.ink,
  color: color.paper,
})

let tagDisabled = css({
  borderColor: color.redInk,
  color: color.redInk,
})

let memberActions = css({
  display: 'flex',
  flexWrap: 'wrap',
  gap: '0.4rem',
  [wide]: {
    justifyContent: 'end',
  },
})

let tempForm = css({
  display: 'flex',
  flexWrap: 'wrap',
  alignItems: 'end',
  gap: '0.5rem',
  [wide]: {
    gridColumn: '1 / -1',
  },
})

let tempField = css({
  flex: '0 1 16rem',
  fontSize: '0.75rem',
})

let tempInput = css({
  minHeight: '2.25rem',
  padding: '0.35rem 0.6rem',
  fontSize: '0.9375rem',
})

let signOutSection = css({
  paddingTop: '1.5rem',
  borderTop: `1px solid ${color.rule}`,
})
