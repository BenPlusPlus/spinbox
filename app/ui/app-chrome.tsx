import type { Handle, RemixNode } from 'remix/ui'
import { css } from 'remix/ui'

import { routes } from '../routes.ts'
import { Document } from './document.tsx'

export type ChromeDestination = 'library' | 'playlists' | 'search' | 'settings'

export type ChromeTrack = {
  id: string
  title: string
  artist: string
}

export type ChromeState = {
  libraryHealthy: boolean
  currentTrack: ChromeTrack | null
  playing: boolean
  mediaHref: string | null
}

export type AppChromeProps = {
  children?: RemixNode
  title: string
  current: ChromeDestination
  chrome?: ChromeState
}

export function mediaHrefFor(trackId: string, playheadMs: number): string {
  let href = routes.mediaTrack.href({ trackId })
  if (playheadMs <= 0) {
    return href
  }
  return `${href}#t=${playheadMs / 1000}`
}

export function AppChrome(handle: Handle<AppChromeProps>) {
  return () => {
    let { children, title, current, chrome } = handle.props
    let libraryHealthy = chrome?.libraryHealthy ?? true
    let currentTrack = chrome?.currentTrack ?? null
    let playing = chrome?.playing ?? false
    let mediaHref = chrome?.mediaHref ?? null

    return (
      <Document title={title} head={fonts}>
        <div mix={shell}>
          <aside mix={sidebar} aria-label="Sidebar">
            <a href={routes.home.href()} mix={wordmark}>
              <span mix={wordmarkEyebrow}>Household</span>
              Spinbox
            </a>
            <nav mix={sideNav}>
              {sideLink('library', current, routes.home.href(), 'Library')}
              {sideLink('playlists', current, routes.playlists.href(), 'Playlists')}
              {sideLink('settings', current, routes.settings.index.href(), 'Settings')}
            </nav>
          </aside>

          <div mix={stage}>
            <header mix={topChrome}>
              <p mix={mobileBrand}>Spinbox</p>
              <form method="GET" action={routes.search.href()} mix={searchForm} role="search">
                <label mix={searchLabel}>
                  Search
                  <input
                    mix={searchInput}
                    type="search"
                    name="q"
                    placeholder="Tracks, Artists, Albums"
                    autoComplete="off"
                  />
                </label>
                <button mix={searchSubmit} type="submit">
                  Search
                </button>
              </form>
            </header>

            {libraryHealthy ? null : (
              <p mix={banner} role="status">
                Library storage is unavailable
              </p>
            )}

            <div mix={page}>{children}</div>

            <div mix={chromeFooter}>
              {currentTrack ? (
                <aside mix={dock} aria-label="Mini-dock">
                  <div mix={dockMeta}>
                    <span mix={dockEyebrow}>{playing ? 'Now playing' : 'Paused'}</span>
                    <strong>
                      Now playing · {currentTrack.title}
                      {playing ? '' : ' (paused)'}
                    </strong>
                    <span mix={dockArtist}>{currentTrack.artist}</span>
                  </div>
                  {mediaHref ? (
                    <audio mix={dockAudio} controls src={mediaHref} preload="metadata"></audio>
                  ) : null}
                </aside>
              ) : null}

              <nav mix={tabs} aria-label="Tabs">
                {tabLink('library', current, routes.home.href(), 'Library')}
                {tabLink('playlists', current, routes.playlists.href(), 'Playlists')}
                {tabLink('search', current, routes.search.href(), 'Search')}
                {tabLink('settings', current, routes.settings.index.href(), 'Settings')}
              </nav>
            </div>
          </div>
        </div>
      </Document>
    )
  }
}

function sideLink(
  destination: ChromeDestination,
  current: ChromeDestination,
  href: string,
  label: string,
): RemixNode {
  let active = destination === current
  return (
    <a href={href} mix={active ? [sideItem, sideItemCurrent] : sideItem} aria-current={active ? 'page' : undefined}>
      {label}
    </a>
  )
}

function tabLink(
  destination: ChromeDestination,
  current: ChromeDestination,
  href: string,
  label: string,
): RemixNode {
  let active = destination === current
  return (
    <a href={href} mix={active ? [tabItem, tabItemCurrent] : tabItem} aria-current={active ? 'page' : undefined}>
      {label}
    </a>
  )
}

let fonts = (
  <>
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
    <link
      href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,650&family=Source+Sans+3:wght@400;600&display=swap"
      rel="stylesheet"
    />
  </>
)

let shell = css({
  minHeight: '100vh',
  display: 'grid',
  background: '#1a120c',
  color: '#1c120c',
  fontFamily: '"Source Sans 3", "Segoe UI", sans-serif',
  '@media (min-width: 56rem)': {
    gridTemplateColumns: '15.5rem minmax(0, 1fr)',
  },
})

let sidebar = css({
  display: 'none',
  '@media (min-width: 56rem)': {
    display: 'flex',
    flexDirection: 'column',
    gap: '2.5rem',
    padding: '1.75rem 1.15rem 2rem',
    background:
      'linear-gradient(180deg, #2a1b12 0%, #1a120c 55%, #140e09 100%)',
    color: '#f3ead8',
    borderRight: '1px solid #3a281c',
    boxShadow: 'inset -18px 0 40px rgba(0, 0, 0, 0.28)',
  },
})

let wordmark = css({
  display: 'grid',
  gap: '0.2rem',
  padding: '0.35rem 0.7rem',
  color: '#f3ead8',
  textDecoration: 'none',
  fontFamily: 'Fraunces, Georgia, serif',
  fontSize: '1.85rem',
  fontWeight: 650,
  letterSpacing: '-0.03em',
  lineHeight: 1,
})

let wordmarkEyebrow = css({
  fontFamily: '"Source Sans 3", sans-serif',
  fontSize: '0.68rem',
  fontWeight: 600,
  letterSpacing: '0.22em',
  textTransform: 'uppercase',
  color: '#c4783a',
})

let sideNav = css({
  display: 'grid',
  gap: '0.35rem',
})

let sideItem = css({
  display: 'block',
  padding: '0.7rem 0.85rem',
  borderRadius: '2px',
  color: '#d8cbb8',
  textDecoration: 'none',
  letterSpacing: '0.04em',
  fontWeight: 600,
  '&:hover': {
    background: 'rgba(243, 234, 216, 0.06)',
    color: '#f3ead8',
  },
})

let sideItemCurrent = css({
  background: '#f3ead8',
  color: '#1c120c',
  boxShadow: '0 0 0 1px #c4783a',
  '&:hover': {
    background: '#f3ead8',
    color: '#1c120c',
  },
})

let stage = css({
  display: 'grid',
  gridTemplateRows: 'auto auto 1fr auto auto',
  minHeight: '100vh',
  background: '#f3ead8',
  backgroundImage:
    'radial-gradient(ellipse at top, rgba(196, 120, 58, 0.08), transparent 42%), linear-gradient(180deg, #f7f0e2 0%, #f3ead8 28%)',
})

let topChrome = css({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: '1rem',
  padding: '0.85rem 1.15rem',
  borderBottom: '1px solid #e0d3bf',
  '@media (min-width: 56rem)': {
    padding: '1rem 1.75rem',
  },
})

let mobileBrand = css({
  margin: 0,
  fontFamily: 'Fraunces, Georgia, serif',
  fontSize: '1.35rem',
  fontWeight: 650,
  '@media (min-width: 56rem)': {
    display: 'none',
  },
})

let searchForm = css({
  display: 'none',
  '@media (min-width: 56rem)': {
    display: 'flex',
    alignItems: 'end',
    gap: '0.45rem',
    marginLeft: 'auto',
    width: 'min(28rem, 100%)',
  },
})

let searchLabel = css({
  display: 'grid',
  gap: '0.25rem',
  flex: 1,
  fontSize: '0.72rem',
  fontWeight: 600,
  letterSpacing: '0.12em',
  textTransform: 'uppercase',
  color: '#6b5646',
})

let searchInput = css({
  width: '100%',
  padding: '0.6rem 0.75rem',
  border: '1px solid #c9b8a2',
  borderRadius: '2px',
  background: '#fffdf7',
  color: '#1c120c',
  font: 'inherit',
  letterSpacing: '0',
  textTransform: 'none',
  fontWeight: 400,
})

let searchSubmit = css({
  padding: '0.6rem 0.85rem',
  border: 0,
  borderRadius: '2px',
  background: '#1c120c',
  color: '#f3ead8',
  font: 'inherit',
  fontWeight: 600,
  cursor: 'pointer',
})

let banner = css({
  margin: 0,
  padding: '0.7rem 1.15rem',
  background: '#6b2414',
  color: '#f7efe4',
  fontWeight: 600,
  '@media (min-width: 56rem)': {
    padding: '0.75rem 1.75rem',
  },
})

let page = css({
  minWidth: 0,
  padding: '1.25rem 1.15rem 1.5rem',
  '@media (min-width: 56rem)': {
    padding: '1.75rem 1.75rem 2rem',
  },
})

let chromeFooter = css({
  position: 'sticky',
  bottom: 0,
  display: 'grid',
  alignSelf: 'end',
})

let dock = css({
  display: 'grid',
  gap: '0.55rem',
  margin: '0 0.75rem',
  padding: '0.85rem 1rem',
  background: '#1c120c',
  color: '#f3ead8',
  borderRadius: '3px 3px 0 0',
  boxShadow: '0 -10px 28px rgba(28, 18, 12, 0.22)',
  '@media (min-width: 56rem)': {
    margin: '0 1.75rem 0',
  },
})

let dockMeta = css({
  display: 'grid',
  gap: '0.1rem',
})

let dockEyebrow = css({
  fontSize: '0.68rem',
  letterSpacing: '0.16em',
  textTransform: 'uppercase',
  color: '#c4783a',
})

let dockArtist = css({
  color: '#d8cbb8',
  fontSize: '0.92rem',
})

let dockAudio = css({
  width: '100%',
})

let tabs = css({
  display: 'grid',
  gridTemplateColumns: 'repeat(4, 1fr)',
  borderTop: '3px solid #c4783a',
  background: '#1c120c',
  '@media (min-width: 56rem)': {
    display: 'none',
  },
})

let tabItem = css({
  padding: '0.85rem 0.35rem 0.95rem',
  color: '#d8cbb8',
  textAlign: 'center',
  textDecoration: 'none',
  fontSize: '0.82rem',
  fontWeight: 600,
  letterSpacing: '0.04em',
})

let tabItemCurrent = css({
  color: '#f3ead8',
  boxShadow: 'inset 0 -3px 0 #c4783a',
})
