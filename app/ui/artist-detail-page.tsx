import type { Handle } from 'remix/component'
import { css } from 'remix/component'

import { tracksForArtistPlay, type ArtistGroup } from '../modules/library/index.ts'
import { routes } from '../routes.ts'
import { AppChrome, type ChromeState } from './app-chrome.tsx'
import { artworkPlate, playContainerButton } from './library-play.tsx'
import {
  albumGrid,
  albumTile,
  backLink,
  notFound,
  pageHead,
  plural,
  trackList,
  trackRow,
} from './page-kit.tsx'
import { section, sectionTitle } from './theme.ts'

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
          {notFound(
            'Artist not found',
            'That Artist was not found in the Library. It may have moved or been removed in the last Scan run.',
            routes.libraryArtists.href(),
            'Back to Artists',
          )}
        </AppChrome>
      )
    }

    let next = routes.libraryArtist.href({ artistKey: artist.key })
    let playTracks = tracksForArtistPlay(artist)
    let counts = [
      artist.albums.length > 0 ? plural(artist.albums.length, 'Album') : null,
      artist.tracks.length > 0 ? plural(artist.tracks.length, 'Track') : null,
    ]
      .filter(Boolean)
      .join(' · ')

    return (
      <AppChrome title={`${artist.artist} · Spinbox`} current="library" chrome={chrome}>
        <main>
          {backLink(routes.libraryArtists.href(), 'Artists')}
          {pageHead({
            art: artworkPlate(artist.artist, artist.artworkTrackId, 'fill'),
            title: artist.artist,
            lede: counts || undefined,
            actions: playContainerButton('Play', playTracks, 0, { next, variant: 'primary' }),
          })}

          {artist.albums.length > 0 ? (
            <section mix={firstSection}>
              <h2 mix={sectionTitle}>Albums</h2>
              <ul mix={albumGrid}>{artist.albums.map((album) => albumTile(album, next))}</ul>
            </section>
          ) : null}

          {artist.tracks.length > 0 ? (
            <section mix={section}>
              <h2 mix={sectionTitle}>Tracks</h2>
              <ul mix={trackList}>
                {artist.tracks.map((track) => {
                  let startAt = playTracks.findIndex((candidate) => candidate.id === track.id)
                  return trackRow({
                    key: track.id,
                    lead: artworkPlate(track.album || track.title, track.hasArtwork ? track.id : null, 'sm'),
                    title: track.title,
                    sub: track.album,
                    durationMs: track.durationMs,
                    play: playContainerButton('Play', playTracks, startAt < 0 ? 0 : startAt, { next }),
                    trackId: track.id,
                    next,
                    playlists: chrome?.playlists,
                  })
                })}
              </ul>
            </section>
          ) : null}
        </main>
      </AppChrome>
    )
  }
}

let firstSection = css({
  marginTop: 0,
})
