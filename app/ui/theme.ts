import { css } from 'remix/component'

export const color = {
  night: '#16204A',
  night2: '#1D2A5E',
  nightLine: '#34417A',
  nightMute: '#A9B1D6',
  paper: '#F2F1EC',
  paperDeep: '#E7E5DD',
  sheet: '#FBFAF6',
  ink: '#111318',
  mute: '#565B6B',
  rule: '#D3D2CB',
  red: '#E5322D',
  redInk: '#C42420',
  yellow: '#F2C230',
} as const

export const font = {
  family: 'Archivo, Arial Narrow, system-ui, sans-serif',
  condensed: '68%',
  semi: '82%',
} as const

export const railWidth = '15.5rem'

const SLEEVES = [
  { background: color.night, color: color.paper },
  { background: color.redInk, color: color.paper },
  { background: color.yellow, color: color.ink },
  { background: color.ink, color: color.paper },
  { background: color.paperDeep, color: color.ink },
]

/** Printed sleeve colourway for a title without indexed artwork; stable per seed. */
export function sleeveFor(seed: string) {
  let hash = 0
  for (let index = 0; index < seed.length; index++) {
    hash = (hash * 31 + seed.charCodeAt(index)) >>> 0
  }
  return SLEEVES[hash % SLEEVES.length]!
}
export const wide = '@media (min-width: 56rem)'
export const reducedMotion = '@media (prefers-reduced-motion: reduce)'

export const globalStyles = `
@font-face{font-family:Archivo;font-style:normal;font-weight:100 900;font-stretch:62% 125%;font-display:swap;src:url(/fonts/archivo-latin.woff2);unicode-range:U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD}
@font-face{font-family:Archivo;font-style:normal;font-weight:100 900;font-stretch:62% 125%;font-display:swap;src:url(/fonts/archivo-latin-ext.woff2);unicode-range:U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0304,U+0308,U+0329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C4,U+2113,U+2C60-2C7F,U+A720-A7FF}
@font-face{font-family:Archivo;font-style:italic;font-weight:100 900;font-stretch:62% 125%;font-display:swap;src:url(/fonts/archivo-italic-latin.woff2);unicode-range:U+0000-00FF,U+2000-206F}
@layer reset, rmx;
@layer reset{
*,*::before,*::after{box-sizing:border-box}
html{background:${color.paper};color:${color.ink};-webkit-text-size-adjust:100%;scrollbar-color:#A4A7B1 ${color.paper}}
body{margin:0;font-family:${font.family};font-size:1rem;line-height:1.5;font-kerning:normal;-webkit-font-smoothing:antialiased;-moz-osx-font-smoothing:grayscale}
button,input,select,textarea{font:inherit;color:inherit;letter-spacing:inherit}
a{color:inherit;text-underline-offset:0.22em;text-decoration-thickness:1px}
img{display:block;max-width:100%}
::selection{background:${color.yellow};color:${color.ink}}
::placeholder{color:#686D7C;opacity:1}
:focus-visible{outline:2px solid ${color.night};outline-offset:2px}
[data-surface=night] :focus-visible{outline-color:${color.yellow}}
[data-surface=night]{scrollbar-color:${color.nightLine} ${color.night}}
[data-surface=night] ::selection{background:${color.yellow};color:${color.ink}}
input{caret-color:${color.redInk}}
}
@keyframes spinbox-vinyl{to{transform:rotate(360deg)}}
@media (prefers-reduced-motion: reduce){*,*::before,*::after{animation-duration:0.01ms!important;animation-iteration-count:1!important;transition-duration:0.01ms!important;scroll-behavior:auto!important}}
`

export const condensedCaps = css({
  fontStretch: font.condensed,
  fontWeight: 800,
  textTransform: 'uppercase',
  letterSpacing: '0.005em',
})

export const pageTitle = css({
  margin: 0,
  fontStretch: font.condensed,
  fontWeight: 800,
  textTransform: 'uppercase',
  fontSize: 'clamp(2.5rem, 2.2vw + 1.6rem, 4.25rem)',
  lineHeight: 0.92,
  letterSpacing: '-0.005em',
  textWrap: 'balance',
})

export const pageHeader = css({
  display: 'grid',
  gap: '0.65rem',
  paddingBottom: '1.1rem',
  marginBottom: '2rem',
  borderBottom: `3px solid ${color.ink}`,
})

export const pageLede = css({
  margin: 0,
  maxWidth: '38rem',
  color: color.mute,
  fontSize: '1rem',
  lineHeight: 1.5,
})

export const sectionTitle = css({
  display: 'flex',
  alignItems: 'baseline',
  justifyContent: 'space-between',
  gap: '1rem',
  margin: '0 0 0.85rem',
  paddingTop: '0.55rem',
  borderTop: `2px solid ${color.ink}`,
  fontStretch: font.semi,
  fontWeight: 750,
  fontSize: '1.0625rem',
  lineHeight: 1.2,
  letterSpacing: '0.04em',
  textTransform: 'uppercase',
})

export const section = css({
  marginTop: '3rem',
  '&:first-child': {
    marginTop: 0,
  },
})

export const caps = css({
  fontStretch: font.semi,
  fontWeight: 700,
  fontSize: '0.75rem',
  lineHeight: 1.2,
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
})

export const meta = css({
  color: color.mute,
  fontSize: '0.875rem',
  lineHeight: 1.35,
})

export const body = css({
  margin: 0,
  maxWidth: '38rem',
  lineHeight: 1.55,
})

export const crumb = css({
  display: 'inline-flex',
  alignItems: 'center',
  gap: '0.35rem',
  marginBottom: '1.25rem',
  color: color.mute,
  fontStretch: font.semi,
  fontWeight: 700,
  fontSize: '0.8125rem',
  letterSpacing: '0.06em',
  textTransform: 'uppercase',
  textDecoration: 'none',
  '&:hover': {
    color: color.ink,
  },
  '& svg': {
    width: '1rem',
    height: '1rem',
  },
})

export const titleLink = css({
  color: 'inherit',
  textDecoration: 'none',
  '&:hover': {
    textDecoration: 'underline',
  },
})

const buttonBase = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '0.5rem',
  minHeight: 'var(--btn-h, 2.75rem)',
  padding: '0 var(--btn-px, 1.1rem)',
  border: '1.5px solid transparent',
  borderRadius: 0,
  fontStretch: font.semi,
  fontWeight: 750,
  fontSize: 'var(--btn-fs, 0.875rem)',
  letterSpacing: '0.06em',
  textTransform: 'uppercase' as const,
  whiteSpace: 'nowrap' as const,
  textDecoration: 'none',
  cursor: 'pointer',
  transition: 'background-color 160ms cubic-bezier(0.22, 1, 0.36, 1), color 160ms cubic-bezier(0.22, 1, 0.36, 1)',
  '& svg': {
    width: '1.15rem',
    height: '1.15rem',
    flex: 'none',
  },
  '&:disabled': {
    cursor: 'not-allowed',
    opacity: 0.45,
  },
}

export const btnPrimary = css({
  ...buttonBase,
  background: color.ink,
  borderColor: color.ink,
  color: color.paper,
  '&:hover:not(:disabled)': {
    background: color.night,
    borderColor: color.night,
  },
})

export const btnSecondary = css({
  ...buttonBase,
  background: 'transparent',
  borderColor: color.ink,
  color: color.ink,
  '&:hover:not(:disabled)': {
    background: color.ink,
    color: color.paper,
  },
})

export const btnDanger = css({
  ...buttonBase,
  background: 'transparent',
  borderColor: color.redInk,
  color: color.redInk,
  '&:hover:not(:disabled)': {
    background: color.redInk,
    color: color.paper,
  },
})

/** Size modifier: sets only custom properties so it works regardless of css() layer order. */
export const btnSmall = css({
  '--btn-h': '2.25rem',
  '--btn-px': '0.8rem',
  '--btn-fs': '0.8125rem',
} as Record<string, string>)

/** Square icon button whose text stays the accessible name but is not painted. */
export const iconButton = css({
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  flex: 'none',
  width: '2.75rem',
  height: '2.75rem',
  padding: 0,
  border: 0,
  borderRadius: 0,
  background: 'transparent',
  color: 'inherit',
  fontSize: 0,
  lineHeight: 0,
  cursor: 'pointer',
  transition: 'background-color 160ms cubic-bezier(0.22, 1, 0.36, 1), color 160ms cubic-bezier(0.22, 1, 0.36, 1)',
  '& svg': {
    width: '1.25rem',
    height: '1.25rem',
  },
  '&:hover:not(:disabled)': {
    background: 'rgba(17, 19, 24, 0.08)',
  },
  '&:disabled': {
    cursor: 'not-allowed',
    opacity: 0.3,
  },
})

export const field = css({
  display: 'grid',
  gap: '0.4rem',
  fontStretch: font.semi,
  fontWeight: 700,
  fontSize: '0.8125rem',
  letterSpacing: '0.06em',
  textTransform: 'uppercase',
})

export const input = css({
  width: '100%',
  minHeight: '2.75rem',
  padding: '0.55rem 0.75rem',
  border: `1.5px solid ${color.ink}`,
  borderRadius: 0,
  background: color.sheet,
  color: color.ink,
  fontStretch: '100%',
  fontWeight: 400,
  fontSize: '1rem',
  letterSpacing: 0,
  textTransform: 'none',
  '&:focus-visible': {
    outlineOffset: 0,
  },
  '&[readonly]': {
    background: color.paperDeep,
  },
})

export const formStack = css({
  display: 'grid',
  gap: '1rem',
  maxWidth: '24rem',
})

export const alertBox = css({
  display: 'flex',
  gap: '0.65rem',
  alignItems: 'start',
  margin: '0 0 1.5rem',
  padding: '0.8rem 1rem',
  maxWidth: '40rem',
  background: color.sheet,
  border: `1.5px solid ${color.redInk}`,
  color: color.ink,
  lineHeight: 1.45,
  '& svg': {
    flex: 'none',
    width: '1.25rem',
    height: '1.25rem',
    marginTop: '0.1rem',
    color: color.redInk,
  },
})

export const noticeBox = css({
  display: 'flex',
  gap: '0.65rem',
  alignItems: 'start',
  margin: '0 0 1.5rem',
  padding: '0.8rem 1rem',
  maxWidth: '40rem',
  background: color.ink,
  color: color.paper,
  lineHeight: 1.45,
  overflowWrap: 'anywhere',
  '& svg': {
    flex: 'none',
    width: '1.25rem',
    height: '1.25rem',
    marginTop: '0.1rem',
    color: color.yellow,
  },
})

export const emptyNote = css({
  margin: 0,
  padding: '1.25rem 0',
  borderBottom: `1px solid ${color.rule}`,
  color: color.mute,
})

/** Hairline-ruled listing rows shared by every Track table. */
export const listing = css({
  margin: 0,
  padding: 0,
  listStyle: 'none',
  borderTop: `1px solid ${color.rule}`,
})

export const listingRow = css({
  display: 'grid',
  alignItems: 'center',
  gap: '0 0.75rem',
  minHeight: '3.25rem',
  padding: '0.35rem 0.25rem 0.35rem 0.5rem',
  borderBottom: `1px solid ${color.rule}`,
  '&:hover': {
    background: color.paperDeep,
  },
})

export const numCell = css({
  fontStretch: font.semi,
  fontWeight: 600,
  fontVariantNumeric: 'tabular-nums',
  color: color.mute,
  fontSize: '0.875rem',
})

export const rowTitle = css({
  display: 'block',
  minWidth: 0,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  fontWeight: 550,
})

export const rowSub = css({
  display: 'block',
  minWidth: 0,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  color: color.mute,
  fontSize: '0.875rem',
})

export const visuallyHidden = css({
  position: 'absolute',
  width: '1px',
  height: '1px',
  padding: 0,
  margin: '-1px',
  overflow: 'hidden',
  clip: 'rect(0, 0, 0, 0)',
  whiteSpace: 'nowrap',
  border: 0,
})
