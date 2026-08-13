import type { Handle } from 'remix/ui'
import { css } from 'remix/ui'

import type { Invite } from '../modules/auth/index.ts'
import { routes } from '../routes.ts'
import { Document } from './document.tsx'

export function InvitesPage(
  handle: Handle<{
    invites: Invite[]
    mintedUrl?: string
    error?: string
  }>,
) {
  return () => {
    let { invites, mintedUrl, error } = handle.props

    return (
      <Document title="Invites · Spinbox">
        <main mix={page}>
          <p mix={crumb}>
            <a href={routes.home.href()}>Library</a>
          </p>
          <h1 mix={heading}>Invites</h1>
          <p mix={copy}>
            Mint a single-use Invite. It expires after 7 days. Bind an email to lock who can accept,
            or leave it blank for an open link.
          </p>
          {error ? <p mix={errorBox}>{error}</p> : null}
          {mintedUrl ? (
            <p mix={minted}>
              Invite created. Share this accept URL before it expires: {mintedUrl}
            </p>
          ) : null}
          <form method="POST" action={routes.invites.action.href()} mix={mintForm}>
            <label mix={field}>
              Email (optional)
              <input mix={input} type="email" name="email" autoComplete="off" />
            </label>
            <button mix={submit} type="submit">
              Mint Invite
            </button>
          </form>
          <h2 mix={subheading}>Household Invites</h2>
          {invites.length === 0 ? (
            <p mix={copy}>No Invites yet.</p>
          ) : (
            <ul mix={list}>
              {invites.map((invite) => (
                <li mix={row}>
                  <span>
                    {invite.email ?? 'Open link'} · {invite.status} · expires {invite.expiresAt}
                  </span>
                  {invite.status === 'unused' ? (
                    <form method="POST" action={routes.inviteRevoke.href({ id: invite.id })}>
                      <button mix={revoke} type="submit">
                        Revoke
                      </button>
                    </form>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </main>
      </Document>
    )
  }
}

let page = css({
  minHeight: '100vh',
  margin: 0,
  padding: '2rem 1.5rem',
  background: '#f4efe6',
  color: '#1a1410',
  fontFamily: 'Georgia, "Times New Roman", serif',
})

let crumb = css({
  margin: '0 0 1rem',
  fontFamily: 'system-ui, sans-serif',
  fontSize: '0.9rem',
})

let heading = css({
  margin: '0 0 0.5rem',
  fontSize: '2rem',
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

let minted = css({
  margin: '0 0 1.25rem',
  padding: '0.75rem 0.85rem',
  maxWidth: '40rem',
  background: '#1a1410',
  color: '#f4efe6',
  fontFamily: 'system-ui, sans-serif',
  fontSize: '0.95rem',
  wordBreak: 'break-all',
})

let errorBox = css({
  margin: '0 0 1rem',
  padding: '0.65rem 0.75rem',
  maxWidth: '36rem',
  background: '#f3d6cc',
  color: '#6b2414',
  fontFamily: 'system-ui, sans-serif',
})

let mintForm = css({
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
  maxWidth: '40rem',
})

let row = css({
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  gap: '1rem',
  padding: '0.7rem 0',
  borderTop: '1px solid #d9cfc0',
  fontFamily: 'system-ui, sans-serif',
  fontSize: '0.95rem',
})

let revoke = css({
  padding: '0.35rem 0.65rem',
  border: '1px solid #1a1410',
  borderRadius: '2px',
  background: 'transparent',
  font: 'inherit',
  cursor: 'pointer',
})
