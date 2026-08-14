import type { Handle } from 'remix/ui'
import { css } from 'remix/ui'

import type { HouseholdMember } from '../modules/auth/index.ts'
import {
  tracksForArtistPlay,
  type AlbumGroup,
  type ArtistGroup,
  type Track,
} from '../modules/library/index.ts'
import type { ListenResume } from '../modules/playback/index.ts'
import { routes } from '../routes.ts'
import { AppChrome, type ChromeState } from './app-chrome.tsx'
import {
  artworkPlaceholder,
  lonePlayButton,
  playButton,
  playContainerButton,
} from './library-play.tsx'

export type LibraryFacet = 'artists' | 'albums' | 'tracks'

export function LibraryHomePage(
  handle: Handle<{
    member: HouseholdMember
    tracks: Track[]
    albums: AlbumGroup[]
    artists: ArtistGroup[]
    recentlyPlayed: Track[]
    resume: ListenResume
    facet?: LibraryFacet
    chrome?: ChromeState
    error?: string
  }>,
) {
  return () => {
    let {
      member,
      tracks,
      albums,
      artists,
      recentlyPlayed,
      resume,
      facet = 'albums',
      chrome,
      error,
    } = handle.props
    let greeting = member.displayName ?? member.email

    return (
      <AppChrome title="Library · Spinbox" current="library" chrome={chrome}>
        <main>
          <h1 mix={heading}>Library</h1>
          <p mix={copy}>Welcome, {greeting}. Browse the Library and play into your Listening session.</p>
          {error ? <p mix={errorBox}>{error}</p> : null}

          {tracks.length === 0 ? (
            <section mix={empty}>
              <p mix={copy}>The Library index is empty. Nothing to browse yet.</p>
              {member.role === 'admin' ? (
                <form method="POST" action={routes.scanNow.href()}>
                  <input type="hidden" name="next" value={routes.home.href()} />
                  <button mix={playButton} type="submit">
                    Scan now
                  </button>
                </form>
              ) : (
                <p mix={copy}>The Library is empty — ask an Admin to run a Scan run.</p>
              )}
            </section>
          ) : null}

          <section>
            <h2 mix={subheading}>Continue</h2>
            {resume.lastActiveTrack ? (
              <form method="POST" action={routes.session.href()}>
                <input type="hidden" name="intent" value="continue" />
                <button mix={playButton} type="submit">
                  Continue · {resume.lastActiveTrack.title}
                </button>
              </form>
            ) : (
              <p mix={copy}>No last-active Track to resume yet.</p>
            )}
          </section>

          <section>
            <h2 mix={subheading}>Recently played</h2>
            {recentlyPlayed.length > 0 ? (
              <ol mix={recentList}>
                {recentlyPlayed.map((track) => (
                  <li mix={recentItem} key={track.id}>
                    {artworkPlaceholder(track.title)}
                    <span mix={recentTitle}>{track.title}</span>
                    <span mix={recentMeta}>{track.artist}</span>
                    {lonePlayButton(track.id)}
                  </li>
                ))}
              </ol>
            ) : (
              <p mix={copy}>No Recently played Tracks yet.</p>
            )}
          </section>

          <section>
            <h2 mix={visuallyHidden}>Browse</h2>
            <nav mix={facets} aria-label="Library facets">
              {facetLink('artists', facet, routes.libraryArtists.href(), 'Artists')}
              {facetLink('albums', facet, routes.libraryAlbums.href(), 'Albums')}
              {facetLink('tracks', facet, routes.libraryTracks.href(), 'Tracks')}
            </nav>

            {facet === 'artists' ? (
              <ul mix={cardList}>
                {artists.map((artist) => (
                  <li mix={card} key={artist.key}>
                    {artworkPlaceholder(artist.artist)}
                    <div mix={cardBody}>
                      <a mix={cardLink} href={routes.libraryArtist.href({ artistKey: artist.key })}>{artist.artist}</a>
                      <p mix={cardMeta}>
                        {artist.albums.length} {artist.albums.length === 1 ? 'Album' : 'Albums'}
                      </p>
                    </div>
                    {playContainerButton('Play', tracksForArtistPlay(artist), 0)}
                  </li>
                ))}
              </ul>
            ) : null}

            {facet === 'albums' ? (
              <ul mix={cardList}>
                {albums.map((album) => (
                  <li mix={card} key={album.key}>
                    {artworkPlaceholder(album.album)}
                    <div mix={cardBody}>
                      <a mix={cardLink} href={routes.libraryAlbum.href({ albumKey: album.key })}>{album.album}</a>
                      <p mix={cardMeta}>{album.albumArtist}</p>
                    </div>
                    {playContainerButton('Play', album.tracks, 0)}
                  </li>
                ))}
              </ul>
            ) : null}

            {facet === 'tracks' ? (
              <ul mix={trackList}>
                {tracks.map((track) => (
                  <li mix={trackItem} key={track.id}>
                    <span mix={title}>
                      {track.title} — {track.artist}
                    </span>
                    {lonePlayButton(track.id)}
                  </li>
                ))}
              </ul>
            ) : null}
          </section>
        </main>
      </AppChrome>
    )
  }
}

function facetLink(
  destination: LibraryFacet,
  current: LibraryFacet,
  href: string,
  label: string,
) {
  let active = destination === current
  return (
    <a href={href} mix={active ? [facetItem, facetItemCurrent] : facetItem} aria-current={active ? 'page' : undefined}>{label}</a>
  )
}

let heading = css({
  margin: '0 0 0.5rem',
  fontSize: '2rem',
  fontFamily: 'Fraunces, Georgia, serif',
})

let subheading = css({
  margin: '2rem 0 0.6rem',
  fontSize: '1.15rem',
})

let copy = css({
  margin: '0 0 1.5rem',
  maxWidth: '36rem',
  lineHeight: 1.5,
  color: '#4a4038',
})

let errorBox = css({
  margin: '0 0 1rem',
  maxWidth: '36rem',
  color: '#8a2a2a',
})

let empty = css({
  margin: '0 0 2rem',
  padding: '1.1rem 1.15rem',
  maxWidth: '28rem',
  background: '#fffdf7',
  border: '1px solid #e0d3bf',
  borderRadius: '2px',
})

let recentList = css({
  margin: 0,
  padding: '0.15rem 0 0.35rem',
  listStyle: 'none',
  display: 'flex',
  gap: '0.75rem',
  overflowX: 'auto',
})

let recentItem = css({
  display: 'grid',
  justifyItems: 'start',
  alignContent: 'start',
  gap: '0.35rem',
  flex: '0 0 8.5rem',
  width: '8.5rem',
})

let recentTitle = css({
  fontWeight: 600,
  lineHeight: 1.25,
})

let recentMeta = css({
  color: '#6b5646',
  fontSize: '0.85rem',
})

let title = css({
  flex: '1 1 12rem',
})

let facets = css({
  display: 'flex',
  flexWrap: 'wrap',
  gap: '0.35rem',
  margin: '1.75rem 0 1rem',
})

let facetItem = css({
  padding: '0.45rem 0.8rem',
  border: '1px solid #c9b8a2',
  borderRadius: '2px',
  color: '#4a4038',
  textDecoration: 'none',
  fontWeight: 600,
  letterSpacing: '0.04em',
})

let facetItemCurrent = css({
  background: '#1c120c',
  borderColor: '#1c120c',
  color: '#f3ead8',
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

let cardLink = css({
  color: '#1c120c',
  fontWeight: 600,
  textDecoration: 'none',
  '&:hover': {
    textDecoration: 'underline',
  },
})

let cardMeta = css({
  margin: '0.15rem 0 0',
  color: '#6b5646',
  fontSize: '0.92rem',
})

let trackList = css({
  margin: 0,
  padding: 0,
  listStyle: 'none',
  maxWidth: '40rem',
})

let trackItem = css({
  display: 'flex',
  flexWrap: 'wrap',
  alignItems: 'baseline',
  gap: '0.4rem 0.65rem',
  padding: '0.45rem 0',
  borderBottom: '1px solid #e0d6c8',
})

let visuallyHidden = css({
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
