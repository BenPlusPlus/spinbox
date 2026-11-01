import type { Handle, RemixNode } from 'remix/component'
import { css } from 'remix/component'

import { PlayerIsland, playerProps, type PlayerRepeat, type PlayerTrack } from '../assets/player.tsx'
import { routes } from '../routes.ts'
import { Document } from './document.tsx'
import { icon, type IconName } from './icons.tsx'
import { color, font, railWidth, wide } from './theme.ts'

export type ChromeDestination = 'library' | 'playlists' | 'search' | 'settings' | 'now-playing'

export type ChromeTrack = PlayerTrack

export type ChromePlaylist = {
  id: string
  name: string
}

export type ChromeState = {
  libraryHealthy: boolean
  currentTrack: ChromeTrack | null
  playing: boolean
  mediaHref: string | null
  playheadMs?: number
  shuffle?: boolean
  repeat?: PlayerRepeat
  queue?: ChromeTrack[]
  playlists?: ChromePlaylist[]
}

export type AppChromeProps = {
  children?: RemixNode
  title: string
  current: ChromeDestination
  chrome?: ChromeState
}

export function mediaHrefFor(trackId: string): string {
  return routes.mediaTrack.href({ trackId })
}

export function AppChrome(handle: Handle<AppChromeProps>) {
  return () => {
    let { children, title, current, chrome } = handle.props
    let libraryHealthy = chrome?.libraryHealthy ?? true
    let currentTrack = chrome?.currentTrack ?? null
    let playing = chrome?.playing ?? false
    let mediaHref = chrome?.mediaHref ?? null
    let showDock = current !== 'now-playing' && currentTrack != null
    let flush = current === 'now-playing'

    return (
      <Document title={title}>
        <div mix={shell}>
          <aside mix={[rail, showDock ? railWithDock : null]} aria-label="Sidebar" data-surface="night">
            <a href={routes.home.href()} mix={wordmark}>
              <span mix={wordmarkMark} aria-hidden="true"></span>
              Spinbox
            </a>
            <nav mix={railNav}>
              {railLink('library', current, routes.home.href(), 'Library', 'library')}
              {railLink('playlists', current, routes.playlists.index.href(), 'Playlists', 'playlist')}
              {railLink('settings', current, routes.settings.index.href(), 'Settings', 'settings')}
            </nav>
          </aside>

          <div mix={stage}>
            {flush ? null : (
              <header mix={current === 'search' ? [topBar, topBarBare] : topBar}>
                <a href={routes.home.href()} mix={mobileBrand}>
                  <span mix={wordmarkMark} aria-hidden="true"></span>
                  Spinbox
                </a>
                {current === 'search' ? null : (
                <form method="GET" action={routes.search.href()} mix={searchForm} role="search">
                  <label mix={searchField}>
                    <span mix={searchLabelText}>Search</span>
                    {icon('search')}
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
                )}
              </header>
            )}

            {libraryHealthy ? null : (
              <div mix={banner} role="status">
                {icon('alert')}
                <p mix={bannerText}>
                  <strong>Library storage is unavailable</strong>
                  <span>
                    Spinbox can't read the music folder right now. Check that the drive or share
                    holding your music is connected, then reload.
                  </span>
                </p>
              </div>
            )}

            <div mix={[flush ? pageFlush : page, showDock ? pageWithDock : null]}>{children}</div>
          </div>

          <div mix={chromeFooter}>
            {showDock ? (
              <PlayerIsland
                {...playerProps(
                  {
                    currentTrack,
                    queue: chrome?.queue ?? [],
                    playing,
                    shuffle: chrome?.shuffle ?? false,
                    repeat: chrome?.repeat ?? 'off',
                    playheadMs: chrome?.playheadMs ?? 0,
                    mediaHref,
                  },
                  'dock',
                )}
              />
            ) : null}

            <nav mix={tabs} aria-label="Tabs" data-surface="night">
              {tabLink('library', current, routes.home.href(), 'Library', 'library')}
              {tabLink('playlists', current, routes.playlists.index.href(), 'Playlists', 'playlist')}
              {tabLink('search', current, routes.search.href(), 'Search', 'search')}
              {tabLink('settings', current, routes.settings.index.href(), 'Settings', 'settings')}
            </nav>
          </div>
        </div>
      </Document>
    )
  }
}

// Label text comes first in markup so link names read cleanly; CSS orders the glyph before it.
function railLink(
  destination: ChromeDestination,
  current: ChromeDestination,
  href: string,
  label: string,
  glyph: IconName,
): RemixNode {
  let active = destination === current
  return (
    <a href={href} mix={active ? [railItem, railItemCurrent] : railItem} aria-current={active ? 'page' : undefined}>
      {label}
      {icon(glyph)}
    </a>
  )
}

function tabLink(
  destination: ChromeDestination,
  current: ChromeDestination,
  href: string,
  label: string,
  glyph: IconName,
): RemixNode {
  let active = destination === current
  return (
    <a href={href} mix={active ? [tabItem, tabItemCurrent] : tabItem} aria-current={active ? 'page' : undefined}>
      {label}
      {icon(glyph)}
    </a>
  )
}

const dockReserve = '4.5rem'
const tabsReserve = '3.75rem'

let shell = css({
  minHeight: '100dvh',
  background: color.paper,
  color: color.ink,
  [wide]: {
    display: 'grid',
    gridTemplateColumns: `${railWidth} minmax(0, 1fr)`,
  },
})

let rail = css({
  display: 'none',
  [wide]: {
    position: 'sticky',
    top: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: '2.25rem',
    height: '100dvh',
    overflowY: 'auto',
    padding: '1.5rem 0 1.5rem',
    background: color.night,
    color: color.paper,
  },
})

let railWithDock = css({
  [wide]: {
    paddingBottom: '10rem',
  },
})

let wordmark = css({
  display: 'flex',
  alignItems: 'center',
  gap: '0.6rem',
  padding: '0 1.25rem',
  color: color.paper,
  textDecoration: 'none',
  fontStretch: font.condensed,
  fontWeight: 800,
  fontSize: '2rem',
  lineHeight: 1,
  letterSpacing: '0.01em',
  textTransform: 'uppercase',
})

let wordmarkMark = css({
  display: 'inline-block',
  width: '0.62em',
  height: '0.62em',
  borderRadius: '50%',
  background: `radial-gradient(circle, ${color.red} 0 22%, currentColor 23% 100%)`,
  flex: 'none',
})

let railNav = css({
  display: 'grid',
  borderTop: `1px solid ${color.nightLine}`,
})

let railItem = css({
  display: 'flex',
  alignItems: 'center',
  gap: '0.85rem',
  minHeight: '3rem',
  padding: '0 1.25rem',
  borderBottom: `1px solid ${color.nightLine}`,
  color: color.nightMute,
  textDecoration: 'none',
  fontStretch: font.semi,
  fontWeight: 700,
  fontSize: '0.9375rem',
  letterSpacing: '0.07em',
  textTransform: 'uppercase',
  transition: 'background-color 160ms cubic-bezier(0.22, 1, 0.36, 1), color 160ms cubic-bezier(0.22, 1, 0.36, 1)',
  '& svg': {
    order: -1,
    width: '1.15rem',
    height: '1.15rem',
    flex: 'none',
  },
  '&:hover': {
    background: color.night2,
    color: color.paper,
  },
})

let railItemCurrent = css({
  color: color.ink,
  background: color.yellow,
  '&:hover': {
    background: color.yellow,
    color: color.ink,
  },
})

let stage = css({
  minWidth: 0,
  display: 'flex',
  flexDirection: 'column',
  minHeight: '100dvh',
})

let topBar = css({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: '1rem',
  minHeight: '3.5rem',
  padding: '0.5rem 1.15rem',
  background: color.night,
  color: color.paper,
  [wide]: {
    minHeight: '4.25rem',
    padding: '0.85rem 2.5rem',
    background: 'transparent',
    color: color.ink,
    borderBottom: `1px solid ${color.rule}`,
  },
})

let topBarBare = css({
  [wide]: {
    display: 'none',
  },
})

let mobileBrand = css({
  display: 'flex',
  alignItems: 'center',
  gap: '0.5rem',
  color: 'inherit',
  textDecoration: 'none',
  fontStretch: font.condensed,
  fontWeight: 800,
  fontSize: '1.6rem',
  lineHeight: 1,
  textTransform: 'uppercase',
  [wide]: {
    display: 'none',
  },
})

let searchForm = css({
  display: 'none',
  [wide]: {
    display: 'flex',
    alignItems: 'stretch',
    marginLeft: 'auto',
    width: 'min(26rem, 100%)',
  },
})

let searchField = css({
  position: 'relative',
  flex: 1,
  display: 'block',
  '& svg': {
    position: 'absolute',
    left: '0.75rem',
    top: '50%',
    width: '1.1rem',
    height: '1.1rem',
    transform: 'translateY(-50%)',
    color: color.mute,
    pointerEvents: 'none',
  },
})

let searchLabelText = css({
  position: 'absolute',
  width: '1px',
  height: '1px',
  overflow: 'hidden',
  clip: 'rect(0, 0, 0, 0)',
  whiteSpace: 'nowrap',
})

let searchInput = css({
  width: '100%',
  height: '2.75rem',
  padding: '0 0.75rem 0 2.4rem',
  border: `1.5px solid ${color.ink}`,
  borderRight: 0,
  borderRadius: 0,
  background: color.sheet,
  color: color.ink,
  fontSize: '0.9375rem',
  '&:focus-visible': {
    outlineOffset: 0,
  },
})

let searchSubmit = css({
  height: '2.75rem',
  padding: '0 1rem',
  border: `1.5px solid ${color.ink}`,
  borderRadius: 0,
  background: color.ink,
  color: color.paper,
  fontStretch: font.semi,
  fontWeight: 750,
  fontSize: '0.8125rem',
  letterSpacing: '0.07em',
  textTransform: 'uppercase',
  cursor: 'pointer',
  '&:hover': {
    background: color.night,
    borderColor: color.night,
  },
})

let banner = css({
  display: 'flex',
  gap: '0.75rem',
  alignItems: 'start',
  padding: '0.85rem 1.15rem',
  background: color.sheet,
  color: color.ink,
  borderBottom: `1.5px solid ${color.redInk}`,
  '& svg': {
    flex: 'none',
    width: '1.25rem',
    height: '1.25rem',
    marginTop: '0.1rem',
    color: color.redInk,
  },
  [wide]: {
    padding: '0.9rem 2.5rem',
  },
})

let bannerText = css({
  display: 'grid',
  gap: '0.15rem',
  margin: 0,
  maxWidth: '48rem',
  lineHeight: 1.4,
  '& strong': {
    fontWeight: 750,
  },
  '& span': {
    fontSize: '0.9375rem',
  },
})

let page = css({
  flex: 1,
  minWidth: 0,
  width: '100%',
  maxWidth: '78rem',
  padding: `1.5rem 1.15rem calc(${tabsReserve} + 2rem + env(safe-area-inset-bottom))`,
  [wide]: {
    padding: '2.5rem 2.5rem 4rem',
  },
})

let pageFlush = css({
  flex: 1,
  minWidth: 0,
  padding: `0 0 calc(${tabsReserve} + env(safe-area-inset-bottom))`,
  [wide]: {
    padding: 0,
  },
})

let pageWithDock = css({
  paddingBottom: `calc(${tabsReserve} + ${dockReserve} + 2rem + env(safe-area-inset-bottom))`,
  [wide]: {
    paddingBottom: '4rem',
  },
})

let chromeFooter = css({
  position: 'fixed',
  left: 0,
  right: 0,
  bottom: 0,
  zIndex: 40,
  display: 'grid',
  [wide]: {
    right: 'auto',
    width: railWidth,
  },
})

let tabs = css({
  display: 'grid',
  gridTemplateColumns: 'repeat(4, 1fr)',
  paddingBottom: 'env(safe-area-inset-bottom)',
  background: color.night,
  borderTop: `1px solid ${color.nightLine}`,
  [wide]: {
    display: 'none',
  },
})

let tabItem = css({
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '0.2rem',
  minHeight: tabsReserve,
  color: color.nightMute,
  textDecoration: 'none',
  fontStretch: font.semi,
  fontWeight: 700,
  fontSize: '0.6875rem',
  letterSpacing: '0.07em',
  textTransform: 'uppercase',
  '& svg': {
    order: -1,
    width: '1.3rem',
    height: '1.3rem',
  },
})

let tabItemCurrent = css({
  color: color.paper,
  boxShadow: `inset 0 3px 0 ${color.yellow}`,
})
