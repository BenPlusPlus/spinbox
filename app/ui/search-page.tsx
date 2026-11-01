import type { Handle } from 'remix/component'
import { css } from 'remix/component'

import type { AlbumGroup, ArtistGroup, Track } from '../modules/library/index.ts'
import type { PlaylistSummary } from '../modules/playlists/index.ts'
import { routes } from '../routes.ts'
import { AppChrome, type ChromeState } from './app-chrome.tsx'
import { icon } from './icons.tsx'
import { artworkPlate, lonePlayButton } from './library-play.tsx'
import { albumGrid, albumTile, artistList, artistRow, pageHead, plural, trackList, trackRow } from './page-kit.tsx'
import {
  btnPrimary,
  color,
  emptyNote,
  input,
  listingRow,
  numCell,
  rowTitle,
  section,
  sectionTitle,
  titleLink,
  visuallyHidden,
} from './theme.ts'

export function SearchPage(
  handle: Handle<{
    query?: string
    tracks?: Track[]
    albums?: AlbumGroup[]
    artists?: ArtistGroup[]
    playlists?: PlaylistSummary[]
    chrome?: ChromeState
  }>,
) {
  return () => {
    let {
      query = '',
      tracks = [],
      albums = [],
      artists = [],
      playlists = [],
      chrome,
    } = handle.props
    let next = query ? `${routes.search.href()}?q=${encodeURIComponent(query)}` : routes.search.href()
    let total = tracks.length + albums.length + artists.length + playlists.length

    return (
      <AppChrome title="Search · Spinbox" current="search" chrome={chrome}>
        <main>
          {pageHead({
            title: 'Search',
            lede: query
              ? total > 0
                ? `${plural(total, 'result')} for “${query}”.`
                : `Nothing matched “${query}”.`
              : 'Search Tracks, Artists, Albums, and your Playlists.',
          })}

          <form method="GET" action={routes.search.href()} mix={searchForm} role="search">
            <label mix={searchField}>
              <span mix={visuallyHidden}>Search the Library</span>
              <span mix={searchIcon} aria-hidden="true">
                {icon('search')}
              </span>
              <input
                mix={[input, searchInput]}
                type="search"
                name="q"
                value={query}
                placeholder="Tracks, Artists, Albums, Playlists"
                autoComplete="off"
              />
            </label>
            <button mix={btnPrimary} type="submit">
              Search
            </button>
          </form>

          {query && total === 0 ? (
            <p mix={emptyNote}>
              No matching Tracks, Albums, Artists, or Playlists for “{query}”. Try a shorter word or check the
              spelling.
            </p>
          ) : null}

          {tracks.length > 0 ? (
            <section mix={section}>
              <h2 mix={sectionTitle}>Tracks</h2>
              <ul mix={trackList}>
                {tracks.map((track) =>
                  trackRow({
                    key: track.id,
                    lead: artworkPlate(track.album || track.title, track.hasArtwork ? track.id : null, 'sm'),
                    title: track.title,
                    sub: `${track.artist} · ${track.album}`,
                    durationMs: track.durationMs,
                    play: lonePlayButton(track.id, next),
                    trackId: track.id,
                    next,
                    playlists: chrome?.playlists,
                  }),
                )}
              </ul>
            </section>
          ) : null}

          {albums.length > 0 ? (
            <section mix={section}>
              <h2 mix={sectionTitle}>Albums</h2>
              <ul mix={albumGrid}>{albums.map((album) => albumTile(album, next))}</ul>
            </section>
          ) : null}

          {artists.length > 0 ? (
            <section mix={section}>
              <h2 mix={sectionTitle}>Artists</h2>
              <ul mix={artistList}>{artists.map((artist) => artistRow(artist, next))}</ul>
            </section>
          ) : null}

          {playlists.length > 0 ? (
            <section mix={section}>
              <h2 mix={sectionTitle}>Your playlists</h2>
              <ul mix={trackList}>
                {playlists.map((playlist) => (
                  <li mix={[listingRow, playlistRow]} key={playlist.id}>
                    <span mix={playlistIcon}>{icon('playlist')}</span>
                    <a mix={[titleLink, rowTitle]} href={routes.playlist.index.href({ id: playlist.id })}>
                      {playlist.name}
                    </a>
                    <span mix={numCell}>{plural(playlist.trackCount, 'Track')}</span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </main>
      </AppChrome>
    )
  }
}

let searchForm = css({
  display: 'grid',
  gridTemplateColumns: 'minmax(0, 1fr) auto',
  gap: '0.5rem',
  maxWidth: '40rem',
  marginBottom: '2.5rem',
})

let searchField = css({
  position: 'relative',
  display: 'block',
})

let searchIcon = css({
  position: 'absolute',
  left: '0.8rem',
  top: '50%',
  transform: 'translateY(-50%)',
  display: 'grid',
  color: color.mute,
  pointerEvents: 'none',
  '& svg': {
    width: '1.2rem',
    height: '1.2rem',
  },
})

let searchInput = css({
  paddingLeft: '2.6rem',
  minHeight: '3rem',
  fontSize: '1.0625rem',
})

let playlistRow = css({
  gridTemplateColumns: '2.75rem minmax(0, 1fr) auto',
  paddingRight: '0.75rem',
})

let playlistIcon = css({
  display: 'grid',
  placeItems: 'center',
  width: '2.75rem',
  height: '2.75rem',
  background: color.night,
  color: color.paper,
  '& svg': {
    width: '1.2rem',
    height: '1.2rem',
  },
})
