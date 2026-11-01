import type { Handle } from 'remix/component'
import { css } from 'remix/component'

import type { AlbumGroup } from '../modules/library/index.ts'
import { routes } from '../routes.ts'
import { AppChrome, type ChromeState } from './app-chrome.tsx'
import { artworkPlate, playContainerButton } from './library-play.tsx'
import { backLink, notFound, pageHead, plural, runningTime, trackList, trackRow } from './page-kit.tsx'
import { color, numCell } from './theme.ts'

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
          {notFound(
            'Album not found',
            'That Album was not found in the Library. It may have moved or been removed in the last Scan run.',
            routes.libraryAlbums.href(),
            'Back to Albums',
          )}
        </AppChrome>
      )
    }

    let next = routes.libraryAlbum.href({ albumKey: album.key })
    let showDiscs = album.tracks.some((track) => track.discNumber != null && track.discNumber > 1)
    let length = runningTime(album.tracks)

    return (
      <AppChrome title={`${album.album} · Spinbox`} current="library" chrome={chrome}>
        <main>
          {backLink(routes.libraryAlbums.href(), 'Albums')}
          {pageHead({
            art: artworkPlate(album.album, album.artworkTrackId, 'fill'),
            title: album.album,
            lede: (
              <>
                <strong mix={artistName}>{album.albumArtist}</strong>
                {' · '}
                {plural(album.tracks.length, 'Track')}
                {length ? ` · ${length}` : ''}
              </>
            ),
            actions: (
              <>
                {playContainerButton('Play all', album.tracks, 0, { next })}
                {playContainerButton('Shuffle', album.tracks, 0, { shuffle: true, next })}
              </>
            ),
          })}
          <ol mix={trackList}>
            {album.tracks.map((track, index) =>
              trackRow({
                key: track.id,
                lead: (
                  <span mix={[numCell, trackNo]}>
                    {showDiscs && track.discNumber != null
                      ? `${track.discNumber}.${track.trackNumber ?? index + 1}`
                      : (track.trackNumber ?? index + 1)}
                  </span>
                ),
                title: track.title,
                sub: track.artist !== album.albumArtist ? track.artist : undefined,
                durationMs: track.durationMs,
                play: playContainerButton('Play', album.tracks, index, { next }),
                trackId: track.id,
                next,
                playlists: chrome?.playlists,
              }),
            )}
          </ol>
        </main>
      </AppChrome>
    )
  }
}

let artistName = css({
  color: color.ink,
  fontWeight: 650,
})

let trackNo = css({
  color: color.mute,
})
