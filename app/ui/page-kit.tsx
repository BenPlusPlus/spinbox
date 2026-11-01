import type { RemixNode } from 'remix/component'
import { css } from 'remix/component'

import { TrackMenu } from '../assets/track-menu.tsx'
import {
  tracksForArtistPlay,
  type AlbumGroup,
  type ArtistGroup,
  type Track,
} from '../modules/library/index.ts'
import { routes } from '../routes.ts'
import { icon } from './icons.tsx'
import { artworkPlate, playContainerButton, type PlaylistChoice } from './library-play.tsx'
import {
  alertBox,
  color,
  crumb,
  font,
  listing,
  listingRow,
  noticeBox,
  numCell,
  pageHeader,
  pageLede,
  pageTitle,
  rowSub,
  rowTitle,
  titleLink,
  wide,
} from './theme.ts'

export function pageHead(options: {
  title: string
  lede?: RemixNode
  actions?: RemixNode
  art?: RemixNode
}): RemixNode {
  let text = (
    <div mix={headText}>
      <h1 mix={pageTitle}>{options.title}</h1>
      {options.lede ? <p mix={pageLede}>{options.lede}</p> : null}
      {options.actions ? <div mix={headActions}>{options.actions}</div> : null}
    </div>
  )
  return (
    <header mix={[pageHeader, options.art ? headWithArt : null]}>
      {options.art ? <div mix={headArt}>{options.art}</div> : null}
      {text}
    </header>
  )
}

export function backLink(href: string, label: string): RemixNode {
  return (
    <a mix={crumb} href={href}>
      {icon('back')}
      {label}
    </a>
  )
}

export function alertMessage(message: string | undefined | null): RemixNode {
  if (!message) {
    return null
  }
  return (
    <div mix={alertBox} role="alert">
      {icon('alert')}
      <p mix={boxText}>{message}</p>
    </div>
  )
}

export function noticeMessage(message: RemixNode): RemixNode {
  if (!message) {
    return null
  }
  return (
    <div mix={noticeBox} role="status">
      {icon('info')}
      <p mix={boxText}>{message}</p>
    </div>
  )
}

export function notFound(title: string, copy: string, href: string, label: string): RemixNode {
  return (
    <main>
      {pageHead({ title, lede: copy })}
      <a mix={notFoundLink} href={href}>
        {icon('back')}
        {label}
      </a>
    </main>
  )
}

export function plural(count: number, one: string, many = `${one}s`): string {
  return `${count} ${count === 1 ? one : many}`
}

export function durationLabel(ms: number | null | undefined): string {
  if (ms == null) {
    return ''
  }
  let sec = Math.max(0, Math.round(ms / 1000))
  let h = Math.floor(sec / 3600)
  let m = Math.floor((sec % 3600) / 60)
  let s = sec % 60
  return h > 0
    ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
    : `${m}:${String(s).padStart(2, '0')}`
}

export function runningTime(tracks: Track[]): string {
  let total = tracks.reduce((sum, track) => sum + (track.durationMs ?? 0), 0)
  if (total === 0) {
    return ''
  }
  let minutes = Math.round(total / 60000)
  if (minutes < 60) {
    return `${minutes} min`
  }
  return `${Math.floor(minutes / 60)} hr ${minutes % 60} min`
}

export function albumTile(album: AlbumGroup, next?: string): RemixNode {
  let href = routes.libraryAlbum.href({ albumKey: album.key })
  return (
    <li mix={tile} key={album.key}>
      <div mix={tileArt}>
        <a href={href} tabIndex={-1} aria-hidden="true" mix={tileArtLink}>
          {artworkPlate(album.album, album.artworkTrackId)}
        </a>
        <span mix={tilePlay} data-tile-play>
          {playContainerButton('Play', album.tracks, 0, { next, variant: 'plate' })}
        </span>
      </div>
      <a mix={[titleLink, tileTitle]} href={href}>
        {album.album}
      </a>
      <span mix={tileSub}>{album.albumArtist}</span>
    </li>
  )
}

export function artistRow(artist: ArtistGroup, next?: string): RemixNode {
  let trackCount = artist.tracks.length
  return (
    <li mix={[listingRow, artistRowGrid]} key={artist.key}>
      {artworkPlate(artist.artist, artist.artworkTrackId, 'sm')}
      <span mix={rowMain}>
        <a mix={[titleLink, rowTitle]} href={routes.libraryArtist.href({ artistKey: artist.key })}>
          {artist.artist}
        </a>
        <span mix={rowSub}>
          {plural(artist.albums.length, 'Album')}
          {trackCount > 0 ? ` · ${plural(trackCount, 'Track')}` : ''}
        </span>
      </span>
      {playContainerButton('Play', tracksForArtistPlay(artist), 0, { next })}
    </li>
  )
}

/**
 * One Track in a ruled listing: lead cell (number or plate), title and subline,
 * running time, then play and the Track actions menu.
 */
export function trackRow(options: {
  key: string
  lead: RemixNode
  title: RemixNode
  sub?: RemixNode
  durationMs?: number | null
  play?: RemixNode
  trackId?: string
  next?: string
  playlists?: PlaylistChoice[]
  trailing?: RemixNode
  muted?: boolean
}): RemixNode {
  return (
    <li mix={[listingRow, trackGrid, options.muted ? rowMuted : null]} key={options.key}>
      <span mix={leadCell}>{options.lead}</span>
      <span mix={rowMain}>
        <span mix={rowTitle}>{options.title}</span>
        {options.sub ? <span mix={rowSub}>{options.sub}</span> : null}
      </span>
      <span mix={[numCell, durationCell]}>{durationLabel(options.durationMs)}</span>
      <span mix={rowActions}>
        {options.play ?? <span mix={actionGap}></span>}
        {options.trackId ? (
          <TrackMenu trackId={options.trackId} next={options.next} playlists={options.playlists} />
        ) : null}
        {options.trailing}
      </span>
    </li>
  )
}

export let trackList = listing

export let albumGrid = css({
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fill, minmax(9.5rem, 1fr))',
  gap: '1.75rem 1rem',
  margin: 0,
  padding: 0,
  listStyle: 'none',
  [wide]: {
    gridTemplateColumns: 'repeat(auto-fill, minmax(11rem, 1fr))',
    gap: '2.25rem 1.5rem',
  },
})

export let artistList = listing

let headText = css({
  display: 'grid',
  gap: '0.75rem',
  minWidth: 0,
  alignContent: 'end',
})

let headActions = css({
  display: 'flex',
  flexWrap: 'wrap',
  gap: '0.5rem',
  marginTop: '0.35rem',
})

let headWithArt = css({
  gridTemplateColumns: 'minmax(0, 1fr)',
  gap: '1.25rem',
  [wide]: {
    gridTemplateColumns: '15rem minmax(0, 1fr)',
    gap: '2.25rem',
    alignItems: 'end',
  },
})

let headArt = css({
  width: 'min(15rem, 62vw)',
  [wide]: {
    width: '100%',
  },
})

let boxText = css({
  margin: 0,
})

let notFoundLink = css({
  display: 'inline-flex',
  alignItems: 'center',
  gap: '0.5rem',
  minHeight: '2.75rem',
  padding: '0 1.1rem',
  border: `1.5px solid ${color.ink}`,
  color: color.ink,
  textDecoration: 'none',
  fontStretch: font.semi,
  fontWeight: 750,
  fontSize: '0.875rem',
  letterSpacing: '0.06em',
  textTransform: 'uppercase',
  '& svg': {
    width: '1.1rem',
    height: '1.1rem',
  },
  '&:hover': {
    background: color.ink,
    color: color.paper,
  },
})

let tile = css({
  display: 'grid',
  alignContent: 'start',
  gap: '0.15rem',
  minWidth: 0,
  '&:hover [data-tile-play], &:focus-within [data-tile-play]': {
    opacity: 1,
    transform: 'none',
  },
})

let tileArt = css({
  position: 'relative',
  marginBottom: '0.6rem',
  outline: `1px solid rgba(17, 19, 24, 0.12)`,
  outlineOffset: '-1px',
})

let tileArtLink = css({
  display: 'block',
  textDecoration: 'none',
})

let tilePlay = css({
  position: 'absolute',
  right: '0.6rem',
  bottom: '0.6rem',
  transition: `opacity 160ms cubic-bezier(0.22, 1, 0.36, 1), transform 160ms cubic-bezier(0.22, 1, 0.36, 1)`,
  '@media (hover: hover)': {
    opacity: 0,
    transform: 'translateY(4px)',
  },
})

let tileTitle = css({
  display: '-webkit-box',
  WebkitLineClamp: '2',
  WebkitBoxOrient: 'vertical',
  overflow: 'hidden',
  fontWeight: 650,
  lineHeight: 1.25,
})

let tileSub = css({
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  color: color.mute,
  fontSize: '0.875rem',
})

let rowMain = css({
  display: 'grid',
  minWidth: 0,
})

let artistRowGrid = css({
  gridTemplateColumns: '2.75rem minmax(0, 1fr) auto',
  gap: '0 0.9rem',
})

let trackGrid = css({
  gridTemplateColumns: '2.75rem minmax(0, 1fr) auto auto',
})

let rowMuted = css({
  color: color.mute,
})

let leadCell = css({
  display: 'grid',
  placeItems: 'center start',
  minWidth: 0,
})

let durationCell = css({
  display: 'none',
  '@media (min-width: 30rem)': {
    display: 'block',
  },
})

let rowActions = css({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'end',
})

let actionGap = css({
  width: '2.75rem',
})
