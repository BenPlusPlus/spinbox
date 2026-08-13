import type { Handle, RemixNode } from 'remix/ui'
import { css } from 'remix/ui'

import { Document } from './document.tsx'

export interface AuthShellProps {
  children?: RemixNode
  title: string
  lead?: string
  error?: string
}

let page = css({
  minHeight: '100vh',
  display: 'grid',
  placeItems: 'center',
  padding: '2rem 1.25rem',
  background: '#1a1410',
  color: '#f4efe6',
  fontFamily: 'Georgia, "Times New Roman", serif',
})

let card = css({
  width: 'min(26rem, 100%)',
  padding: '2rem 1.75rem 1.75rem',
  background: '#f4efe6',
  color: '#1a1410',
  borderRadius: '2px',
  boxShadow: '0 24px 60px rgba(0, 0, 0, 0.35)',
})

let wordmark = css({
  margin: '0 0 0.35rem',
  fontSize: '0.85rem',
  letterSpacing: '0.18em',
  textTransform: 'uppercase',
  color: '#8a6a4a',
})

let heading = css({
  margin: '0 0 0.5rem',
  fontSize: '1.85rem',
  fontWeight: 600,
})

let lead = css({
  margin: '0 0 1.5rem',
  lineHeight: 1.45,
  color: '#4a4038',
})

let errorBox = css({
  margin: '0 0 1rem',
  padding: '0.65rem 0.75rem',
  background: '#f3d6cc',
  color: '#6b2414',
  fontFamily: 'system-ui, sans-serif',
  fontSize: '0.95rem',
})

export function AuthShell(handle: Handle<AuthShellProps>) {
  return () => {
    let { children, title, lead: leadText, error } = handle.props

    return (
      <Document title={`${title} · Spinbox`}>
        <main mix={page}>
          <section mix={card}>
            <p mix={wordmark}>Spinbox</p>
            <h1 mix={heading}>{title}</h1>
            {leadText ? <p mix={lead}>{leadText}</p> : null}
            {error ? <p mix={errorBox}>{error}</p> : null}
            {children}
          </section>
        </main>
      </Document>
    )
  }
}

export let fieldStack = css({
  display: 'grid',
  gap: '0.9rem',
})

export let field = css({
  display: 'grid',
  gap: '0.35rem',
  fontFamily: 'system-ui, sans-serif',
  fontSize: '0.95rem',
})

export let input = css({
  padding: '0.65rem 0.7rem',
  border: '1px solid #c4b8a8',
  borderRadius: '2px',
  background: '#fffdf8',
  font: 'inherit',
  color: 'inherit',
})

export let submit = css({
  marginTop: '0.4rem',
  padding: '0.7rem 0.9rem',
  border: 0,
  borderRadius: '2px',
  background: '#1a1410',
  color: '#f4efe6',
  font: 'inherit',
  fontWeight: 600,
  letterSpacing: '0.02em',
  cursor: 'pointer',
})
