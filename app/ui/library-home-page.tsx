import type { Handle } from 'remix/ui'
import { css } from 'remix/ui'

import type { HouseholdMember } from '../modules/auth/index.ts'
import { routes } from '../routes.ts'
import { Document } from './document.tsx'

let page = css({
  minHeight: '100vh',
  margin: 0,
  padding: '2rem 1.5rem',
  background: '#f4efe6',
  color: '#1a1410',
  fontFamily: 'Georgia, "Times New Roman", serif',
})

let heading = css({
  margin: '0 0 0.5rem',
  fontSize: '2rem',
})

let copy = css({
  margin: '0 0 1.5rem',
  maxWidth: '36rem',
  lineHeight: 1.5,
  color: '#4a4038',
})

let signOut = css({
  padding: '0.55rem 0.8rem',
  border: '1px solid #1a1410',
  borderRadius: '2px',
  background: 'transparent',
  fontFamily: 'system-ui, sans-serif',
  cursor: 'pointer',
})

export function LibraryHomePage(handle: Handle<{ member: HouseholdMember }>) {
  return () => {
    let { member } = handle.props
    let greeting = member.displayName ?? member.email

    return (
      <Document title="Library · Spinbox">
        <main mix={page}>
          <h1 mix={heading}>Library</h1>
          <p mix={copy}>
            Welcome, {greeting}. This is a stub Library home. Browse and playback land in later
            slices.
          </p>
          <form method="POST" action={routes.logout.href()}>
            <button mix={signOut} type="submit">
              Sign out
            </button>
          </form>
        </main>
      </Document>
    )
  }
}
