import type { Handle, RemixNode } from 'remix/component'
import { css } from 'remix/component'

import { Document } from './document.tsx'
import { icon } from './icons.tsx'
import {
  btnPrimary,
  color,
  field as themeField,
  font,
  input as themeInput,
  pageLede,
  wide,
} from './theme.ts'

export interface AuthShellProps {
  children?: RemixNode
  title: string
  lead?: string
  error?: string
}

export function AuthShell(handle: Handle<AuthShellProps>) {
  return () => {
    let { children, title, lead: leadText, error } = handle.props

    return (
      <Document title={`${title} · Spinbox`}>
        <main mix={page} data-surface="night">
          <div mix={brand}>
            <span mix={brandRecord} aria-hidden="true">
              <span mix={brandLabel}></span>
            </span>
            <p mix={wordmark}>Spinbox</p>
            <p mix={tagline}>The household record player.</p>
          </div>
          <section mix={card}>
            <h1 mix={heading}>{title}</h1>
            {leadText ? <p mix={[pageLede, lead]}>{leadText}</p> : null}
            {error ? (
              <p mix={errorBox} role="alert">
                {icon('alert')}
                <span>{error}</span>
              </p>
            ) : null}
            {children}
          </section>
        </main>
      </Document>
    )
  }
}

export let fieldStack = css({
  display: 'grid',
  gap: '1rem',
})

export let field = themeField

export let input = themeInput

let submitFull = css({
  marginTop: '0.5rem',
  width: '100%',
})

export let submit = [btnPrimary, submitFull]

let page = css({
  minHeight: '100dvh',
  display: 'grid',
  alignContent: 'center',
  justifyItems: 'center',
  gap: '2rem',
  padding: '2.5rem 1.25rem',
  background: color.night,
  color: color.paper,
  [wide]: {
    gridTemplateColumns: 'minmax(0, 22rem) minmax(0, 27rem)',
    justifyContent: 'center',
    alignItems: 'center',
    gap: '5rem',
  },
})

let brand = css({
  display: 'grid',
  justifyItems: 'center',
  gap: '0.5rem',
  textAlign: 'center',
  [wide]: {
    justifyItems: 'start',
    textAlign: 'left',
  },
})

let brandRecord = css({
  display: 'none',
  [wide]: {
    display: 'grid',
    placeItems: 'center',
    width: '15rem',
    height: '15rem',
    marginBottom: '1.5rem',
    borderRadius: '50%',
    background: `repeating-radial-gradient(circle at center, #0b0d12 0 2px, #171a22 2px 3px)`,
    boxShadow: `0 0 0 1px ${color.nightLine}`,
  },
})

let brandLabel = css({
  width: '36%',
  height: '36%',
  borderRadius: '50%',
  background: color.red,
  boxShadow: `inset 0 0 0 0.45rem ${color.red}, inset 0 0 0 0.5rem ${color.redInk}`,
  position: 'relative',
  '&::after': {
    content: '""',
    position: 'absolute',
    inset: '46%',
    borderRadius: '50%',
    background: color.night,
  },
})

let wordmark = css({
  margin: 0,
  fontStretch: font.condensed,
  fontWeight: 800,
  fontSize: 'clamp(2.75rem, 5vw + 1rem, 4.5rem)',
  lineHeight: 0.9,
  letterSpacing: '0.01em',
  textTransform: 'uppercase',
})

let tagline = css({
  margin: 0,
  color: color.nightMute,
  fontSize: '1rem',
})

let card = css({
  width: 'min(27rem, 100%)',
  padding: '1.75rem 1.5rem 1.6rem',
  background: color.paper,
  color: color.ink,
  borderTop: `3px solid ${color.ink}`,
  '@media (min-width: 30rem)': {
    padding: '2.25rem 2rem 2rem',
  },
})

let heading = css({
  margin: '0 0 0.6rem',
  paddingBottom: '0.75rem',
  borderBottom: `3px solid ${color.ink}`,
  fontStretch: font.condensed,
  fontWeight: 800,
  fontSize: '2.5rem',
  lineHeight: 0.95,
  textTransform: 'uppercase',
})

let lead = css({
  margin: '0 0 1.5rem',
})

let errorBox = css({
  display: 'flex',
  gap: '0.6rem',
  alignItems: 'start',
  margin: '0 0 1.25rem',
  padding: '0.75rem 0.9rem',
  border: `1.5px solid ${color.redInk}`,
  background: color.sheet,
  lineHeight: 1.45,
  '& svg': {
    flex: 'none',
    width: '1.2rem',
    height: '1.2rem',
    marginTop: '0.1rem',
    color: color.redInk,
  },
})
