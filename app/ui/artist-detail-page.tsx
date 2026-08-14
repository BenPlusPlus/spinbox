import type { Handle } from 'remix/ui'
import { css } from 'remix/ui'

import { tracksForArtistPlay, type ArtistGroup } from '../modules/library/index.ts'
import { routes } from '../routes.ts'
import { AppChrome, type ChromeState } from './app-chrome.tsx'
import { artworkPlaceholder, playContainerButton } from './library-play.tsx'

export function ArtistDetailPage(
  handle: Handle<{
    artist: ArtistGroup | null
    chrome?: ChromeState
  }>,
) {
  return () => {
    let { artist, chrome } = handle.props
    if (artist == null) {
      return (
        <AppChrome title="Artist · Spinbox" current="library" chrome={chrome}>
          <main>
            <p mix={copy}>That Artist was not found in the Library.</p>
            <a mix={back} href={routes.libraryArtists.href()}>
              Back to Artists
            </a>
          </main>
        </AppChrome>
      )
    }

    let next = routes.libraryArtist.href({ artistKey: artist.key })
    let playTracks = tracksForArtistPlay(artist)

    return (
      <AppChrome title={`${artist.artist} · Spinbox`} current="library" chrome={chrome}>
        <main>
          <p mix={crumb}>
            <a href={routes.libraryArtists.href()}>Artists</a>
          </p>
          <header mix={hero}>
            {artworkPlaceholder(artist.artist)}
            <div>
              <h1 mix={heading}>{artist.artist}</h1>
              <div mix={actions}>{playContainerButton('Play', playTracks, 0, { next })}</div>
            </div>
          </header>

          {artist.albums.length > 0 ? (
            <section>
              <h2 mix={subheading}>Albums</h2>
              <ul mix={cardList}>
                {artist.albums.map((album) => (
                  <li mix={card} key={album.key}>
                    {artworkPlaceholder(album.album)}
                    <div mix={cardBody}>
                      <a mix={cardLink} href={routes.libraryAlbum.href({ albumKey: album.key })}>
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

          {artist.tracks.length > 0 ? (
            <section>
              <h2 mix={subheading}>Tracks</h2>
              <ul mix={list}>
                {artist.tracks.map((track) => {
                  let startAt = playTracks.findIndex((candidate) => candidate.id === track.id)
                  return (
                    <li mix={item} key={track.id}>
                      <span mix={title}>
                        {track.title} — {track.album}
                      </span>
                      {playContainerButton('Play', playTracks, startAt < 0 ? 0 : startAt, { next })}
                    </li>
                  )
                })}
              </ul>
            </section>
          ) : null}
        </main>
      </AppChrome>
    )
  }
}

let crumb = css({
  margin: '0 0 1.25rem',
  fontSize: '0.85rem',
  '& a': {
    color: '#6b5646',
  },
})

let hero = css({
  display: 'flex',
  gap: '1rem',
  alignItems: 'start',
  margin: '0 0 1.5rem',
})

let heading = css({
  margin: '0 0 0.65rem',
  fontSize: '2rem',
  fontFamily: 'Fraunces, Georgia, serif',
})

let subheading = css({
  margin: '1.75rem 0 0.6rem',
  fontSize: '1.15rem',
})

let copy = css({
  margin: '0 0 0.85rem',
  maxWidth: '36rem',
  lineHeight: 1.5,
  color: '#4a4038',
})

let back = css({
  color: '#1c120c',
})

let actions = css({
  display: 'flex',
  flexWrap: 'wrap',
  gap: '0.45rem',
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

let meta = css({
  margin: '0.15rem 0 0',
  color: '#6b5646',
  fontSize: '0.92rem',
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
  gap: '0.5rem 0.75rem',
  padding: '0.5rem 0',
  borderBottom: '1px solid #e0d6c8',
})

let title = css({
  flex: '1 1 12rem',
})
