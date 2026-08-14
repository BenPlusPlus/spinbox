import type { Handle } from 'remix/ui'
import { css } from 'remix/ui'

import type { AlbumGroup } from '../modules/library/index.ts'
import { routes } from '../routes.ts'
import { AppChrome, type ChromeState } from './app-chrome.tsx'
import { TrackMenu } from '../assets/track-menu.tsx'
import { artworkPlaceholder, playContainerButton } from './library-play.tsx'

export function AlbumDetailPage(
  handle: Handle<{
    album: AlbumGroup | null
    chrome?: ChromeState
  }>,
) {
  return () => {
    let { album, chrome } = handle.props
    if (album == null) {
      return (
        <AppChrome title="Album · Spinbox" current="library" chrome={chrome}>
          <main>
            <p mix={copy}>That Album was not found in the Library.</p>
            <a mix={back} href={routes.libraryAlbums.href()}>
              Back to Albums
            </a>
          </main>
        </AppChrome>
      )
    }

    let next = routes.libraryAlbum.href({ albumKey: album.key })
    let showDiscs = album.tracks.some((track) => track.discNumber != null)

    return (
      <AppChrome title={`${album.album} · Spinbox`} current="library" chrome={chrome}>
        <main>
          <p mix={crumb}>
            <a href={routes.libraryAlbums.href()}>Albums</a>
          </p>
          <header mix={hero}>
            {artworkPlaceholder(album.album)}
            <div>
              <h1 mix={heading}>{album.album}</h1>
              <p mix={copy}>{album.albumArtist}</p>
              <div mix={actions}>
                {playContainerButton('Play all', album.tracks, 0, { next })}
                {playContainerButton('Shuffle', album.tracks, 0, { shuffle: true, next })}
              </div>
            </div>
          </header>
          <ol mix={list}>
            {album.tracks.map((track, index) => (
              <li mix={item} key={track.id}>
                <span mix={indexCell}>
                  {showDiscs && track.discNumber != null
                    ? `${track.discNumber}.${track.trackNumber ?? index + 1}`
                    : (track.trackNumber ?? index + 1)}
                </span>
                <span mix={title}>{track.title}</span>
                {playContainerButton('Play', album.tracks, index, { next })}
                <TrackMenu trackId={track.id} next={next} />
              </li>
            ))}
          </ol>
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
  margin: '0 0 0.35rem',
  fontSize: '2rem',
  fontFamily: 'Fraunces, Georgia, serif',
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

let indexCell = css({
  width: '2.4rem',
  color: '#6b5646',
  fontVariantNumeric: 'tabular-nums',
})

let title = css({
  flex: '1 1 12rem',
})
