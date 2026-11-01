import type { Handle } from 'remix/component'
import { css } from 'remix/component'

import type { Invite, InviteStatus } from '../modules/auth/index.ts'
import { routes } from '../routes.ts'
import { AppChrome, type ChromeState } from './app-chrome.tsx'
import { icon } from './icons.tsx'
import { alertMessage, backLink, pageHead } from './page-kit.tsx'
import {
  btnPrimary,
  btnSecondary,
  btnSmall,
  caps,
  color,
  emptyNote,
  field,
  input,
  listing,
  meta,
  section,
  sectionTitle,
  wide,
} from './theme.ts'

const statusLabel: Record<InviteStatus, string> = {
  unused: 'Waiting',
  accepted: 'Accepted',
  revoked: 'Revoked',
  expired: 'Expired',
}

export function InvitesPage(
  handle: Handle<{
    invites: Invite[]
    mintedUrl?: string
    error?: string
    chrome?: ChromeState
  }>,
) {
  return () => {
    let { invites, mintedUrl, error, chrome } = handle.props

    return (
      <AppChrome title="Invites · Spinbox" current="settings" chrome={chrome}>
        <main>
          {backLink(routes.settings.index.href(), 'Settings')}
          {pageHead({
            title: 'Invites',
            lede: 'Mint a single-use Invite. It expires after 7 days. Bind an email to lock who can accept, or leave it blank for an open link.',
          })}
          {alertMessage(error)}

          {mintedUrl ? (
            <div mix={mintedPanel} role="status">
              <p mix={mintedCopy}>
                <strong>Invite created.</strong> Share this accept URL before it expires:
              </p>
              <code mix={mintedUrlText} aria-label="Invite accept URL">
                {mintedUrl}
              </code>
            </div>
          ) : null}

          <form method="POST" action={routes.invites.action.href()} mix={mintForm}>
            <label mix={field}>
              Email (optional)
              <input mix={input} type="email" name="email" autoComplete="off" placeholder="name@example.com" />
            </label>
            <button mix={btnPrimary} type="submit">
              {icon('plus')}
              Mint Invite
            </button>
          </form>

          <section mix={section}>
            <h2 mix={sectionTitle}>Household Invites</h2>
            {invites.length === 0 ? (
              <p mix={emptyNote}>No Invites yet.</p>
            ) : (
              <ul mix={listing}>
                {invites.map((invite) => (
                  <li mix={row} key={invite.id}>
                    <span mix={[caps, tag, invite.status === 'unused' ? tagLive : null]}>
                      {statusLabel[invite.status]}
                    </span>
                    <span mix={who}>
                      <strong mix={whoName}>{invite.email ?? 'Open link'}</strong>
                      <span mix={meta}>expires {formatDate(invite.expiresAt)}</span>
                    </span>
                    {invite.status === 'unused' ? (
                      <form method="POST" action={routes.inviteRevoke.href({ id: invite.id })}>
                        <button mix={[btnSecondary, btnSmall]} type="submit">
                          Revoke
                        </button>
                      </form>
                    ) : (
                      <span></span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </main>
      </AppChrome>
    )
  }
}

function formatDate(iso: string): string {
  let date = new Date(iso)
  if (Number.isNaN(date.getTime())) {
    return iso
  }
  return date.toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'UTC',
    timeZoneName: 'short',
  })
}

let mintedPanel = css({
  display: 'grid',
  gap: '0.5rem',
  margin: '0 0 2rem',
  padding: '1rem 1.1rem 1.1rem',
  maxWidth: '40rem',
  background: color.ink,
  color: color.paper,
})

let mintedCopy = css({
  margin: 0,
  '& strong': {
    fontWeight: 750,
  },
})

let mintedUrlText = css({
  display: 'block',
  padding: '0.7rem 0.85rem',
  background: color.sheet,
  color: color.ink,
  fontFamily: 'ui-monospace, SFMono-Regular, Consolas, monospace',
  fontSize: '0.875rem',
  lineHeight: 1.45,
  overflowWrap: 'anywhere',
  userSelect: 'all',
})

let mintForm = css({
  display: 'grid',
  gap: '0.75rem',
  maxWidth: '36rem',
  [wide]: {
    gridTemplateColumns: 'minmax(0, 1fr) auto',
    alignItems: 'end',
  },
})

let row = css({
  display: 'grid',
  gridTemplateColumns: '6.5rem minmax(0, 1fr) auto',
  alignItems: 'center',
  gap: '0 1rem',
  minHeight: '3.5rem',
  padding: '0.5rem 0.25rem',
  borderBottom: `1px solid ${color.rule}`,
})

let tag = css({
  justifySelf: 'start',
  padding: '0.2rem 0.4rem',
  border: `1px solid ${color.rule}`,
  color: color.mute,
  fontSize: '0.6875rem',
})

let tagLive = css({
  borderColor: color.ink,
  color: color.ink,
})

let who = css({
  display: 'grid',
  minWidth: 0,
})

let whoName = css({
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  fontWeight: 600,
})
