import type { Handle } from 'remix/ui'
import { css } from 'remix/ui'

import {
  tracksForArtistPlay,
  type AlbumGroup,
  type ArtistGroup,
  type Track,
} from '../modules/library/index.ts'
import type { PlaylistSummary } from '../modules/playlists/index.ts'
import { routes } from '../routes.ts'
import { AppChrome, type ChromeState } from './app-chrome.tsx'
import { artworkPlaceholder, lonePlayButton, playContainerButton } from './library-play.tsx'
import { TrackMenu } from '../assets/track-menu.tsx'

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
    let hasResults = tracks.length + albums.length + artists.length + playlists.length > 0

    return (
      <AppChrome title="Search · Spinbox" current="search" chrome={chrome}>
        <main>
          <h1 mix={heading}>Search</h1>
          <form method="GET" action={routes.search.href()} mix={searchForm} role="search">
            <label mix={field}>
              Search the Library
              <input
                mix={input}
                type="search"
                name="q"
                value={query}
                placeholder="Tracks, Artists, Albums, Playlists"
                autoComplete="off"
              />
            </label>
            <button mix={submit} type="submit">
              Search
            </button>
          </form>
          {query ? (
            hasResults ? (
              <>
                {tracks.length > 0 ? (
                  <section>
                    <h2 mix={subheading}>Tracks</h2>
                    <ul mix={list}>
                      {tracks.map((track) => (
                        <li mix={item} key={track.id}>
                          <span mix={title}>
                            {track.title} — {track.artist}
                          </span>
                          {lonePlayButton(track.id, next)}
                          <TrackMenu trackId={track.id} next={next} playlists={chrome?.playlists} />
                        </li>
                      ))}
                    </ul>
                  </section>
                ) : null}
                {albums.length > 0 ? (
                  <section>
                    <h2 mix={subheading}>Albums</h2>
                    <ul mix={cardList}>
                      {albums.map((album) => (
                        <li mix={card} key={album.key}>
                          {artworkPlaceholder(album.album)}
                          <div mix={cardBody}>
                            <a
                              mix={link}
                              href={routes.libraryAlbum.href({ albumKey: album.key })}
                            >
                              {album.album}
                            </a>
                            <p mix={meta}>{album.albumArtist}</p>
                          </div>
                          {playContainerButton('Play', album.tracks, 0, { next })}
                        </li>
                      ))}
                    </ul>
                  </section>
                ) : null}
                {artists.length > 0 ? (
                  <section>
                    <h2 mix={subheading}>Artists</h2>
                    <ul mix={cardList}>
                      {artists.map((artist) => (
                        <li mix={card} key={artist.key}>
                          {artworkPlaceholder(artist.artist)}
                          <div mix={cardBody}>
                            <a
                              mix={link}
                              href={routes.libraryArtist.href({ artistKey: artist.key })}
                            >
                              {artist.artist}
                            </a>
                          </div>
                          {playContainerButton('Play', tracksForArtistPlay(artist), 0, { next })}
                        </li>
                      ))}
                    </ul>
                  </section>
                ) : null}
                {playlists.length > 0 ? (
                  <section>
                    <h2 mix={subheading}>Your playlists</h2>
                    <ul mix={list}>
                      {playlists.map((playlist) => (
                        <li mix={item} key={playlist.id}>
                          <a mix={link} href={routes.playlist.index.href({ id: playlist.id })}>
                            {playlist.name}
                          </a>
                        </li>
                      ))}
                    </ul>
                  </section>
                ) : null}
              </>
            ) : (
              <p mix={copy}>No matching Tracks, Albums, Artists, or Playlists for “{query}”.</p>
            )
          ) : (
            <p mix={copy}>Search Tracks, Artists, Albums, and your Playlists.</p>
          )}
        </main>
      </AppChrome>
    )
  }
}

let heading = css({
  margin: '0 0 0.5rem',
  fontSize: '2rem',
  fontFamily: 'Fraunces, Georgia, serif',
})

let subheading = css({
  margin: '1.5rem 0 0.6rem',
  fontSize: '1.15rem',
})

let copy = css({
  margin: '1.25rem 0 0',
  maxWidth: '36rem',
  lineHeight: 1.5,
  color: '#4a4038',
})

let searchForm = css({
  display: 'grid',
  gap: '0.75rem',
  maxWidth: '28rem',
  '@media (min-width: 56rem)': {
    gridTemplateColumns: '1fr auto',
    alignItems: 'end',
  },
})

let field = css({
  display: 'grid',
  gap: '0.35rem',
  fontFamily: '"Source Sans 3", sans-serif',
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
  background: '#1c120c',
  color: '#f3ead8',
  fontFamily: '"Source Sans 3", sans-serif',
  fontWeight: 600,
  cursor: 'pointer',
})

let list = css({
  margin: 0,
  padding: 0,
  listStyle: 'none',
  maxWidth: '40rem',
})

let item = css({
  display: 'flex',
  flexWrap: 'wrap',
  alignItems: 'baseline',
  gap: '0.4rem 0.65rem',
  padding: '0.45rem 0',
  borderBottom: '1px solid #e0d6c8',
})

let title = css({
  flex: '1 1 12rem',
})

let cardList = css({
  margin: 0,
  padding: 0,
  listStyle: 'none',
  display: 'grid',
  gap: '0.65rem',
  maxWidth: '40rem',
})

let card = css({
  display: 'flex',
  alignItems: 'center',
  gap: '0.85rem',
  padding: '0.55rem 0.15rem',
  borderBottom: '1px solid #e0d6c8',
})

let cardBody = css({
  flex: '1 1 12rem',
  minWidth: 0,
})

let meta = css({
  margin: '0.15rem 0 0',
  color: '#6b5646',
  fontSize: '0.92rem',
})

let link = css({
  color: '#1c120c',
  fontWeight: 600,
  textDecoration: 'none',
  '&:hover': {
    textDecoration: 'underline',
  },
})
