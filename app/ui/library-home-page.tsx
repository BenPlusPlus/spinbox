import type { Handle } from 'remix/component'
import { css } from 'remix/component'

import { TrackMenu } from '../assets/track-menu.tsx'
import type { HouseholdMember } from '../modules/auth/index.ts'
import type { AlbumGroup, ArtistGroup, Track } from '../modules/library/index.ts'
import type { ListenResume, RecentlyPlayedTrack } from '../modules/playback/index.ts'
import { routes } from '../routes.ts'
import { AppChrome, type ChromeState } from './app-chrome.tsx'
import { icon } from './icons.tsx'
import { artworkPlate, lonePlayButton } from './library-play.tsx'
import {
  albumGrid,
  albumTile,
  alertMessage,
  artistList,
  artistRow,
  pageHead,
  plural,
  trackList,
  trackRow,
} from './page-kit.tsx'
import {
  btnPrimary,
  caps,
  color,
  emptyNote,
  font,
  section,
  sectionTitle,
  visuallyHidden,
  wide,
} from './theme.ts'

export type LibraryFacet = 'artists' | 'albums' | 'tracks'

export function LibraryHomePage(
  handle: Handle<{
    member: HouseholdMember
    tracks: Track[]
    albums: AlbumGroup[]
    artists: ArtistGroup[]
    recentlyPlayed: (Track & Partial<Pick<RecentlyPlayedTrack, 'playedAt'>>)[]
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
    let now = Date.now()
    let resumeTrack = resume.lastActiveTrack

    return (
      <AppChrome title="Library · Spinbox" current="library" chrome={chrome}>
        <main>
          {pageHead({
            title: 'Library',
            lede:
              tracks.length > 0
                ? `Welcome, ${greeting}. ${plural(albums.length, 'Album')} · ${plural(artists.length, 'Artist')} · ${plural(tracks.length, 'Track')} on the shelf.`
                : `Welcome, ${greeting}. Everything the household has on the shelf, ready to play into your Listening session.`,
          })}
          {alertMessage(error)}

          {tracks.length === 0 ? (
            <section mix={emptyPanel}>
              <p mix={emptyHead}>The shelf is empty</p>
              <p mix={emptyBody}>
                The Library index has no Tracks yet.{' '}
                {member.role === 'admin'
                  ? 'Run a Scan run to read the music folder and fill it.'
                  : 'The Library is empty — ask an Admin to run a Scan run.'}
              </p>
              {member.role === 'admin' ? (
                <form method="POST" action={routes.scanNow.href()}>
                  <input type="hidden" name="next" value={routes.home.href()} />
                  <button mix={btnPrimary} type="submit">
                    {icon('record')}
                    Scan now
                  </button>
                </form>
              ) : null}
            </section>
          ) : null}

          <div mix={band}>
            <section>
              <h2 mix={sectionTitle}>Continue</h2>
              {resumeTrack ? (
                <form method="POST" action={routes.session.href()} mix={continueCard}>
                  <input type="hidden" name="intent" value="continue" />
                  <span mix={continueArt}>
                    {artworkPlate(resumeTrack.album || resumeTrack.title, resumeTrack.hasArtwork ? resumeTrack.id : null)}
                  </span>
                  <span mix={continueText}>
                    <strong mix={continueTitle}>{resumeTrack.title}</strong>
                    <span mix={continueSub}>
                      {resumeTrack.artist} · {resumeTrack.album}
                    </span>
                  </span>
                  <button mix={[btnPrimary, continueButton]} type="submit">
                    {icon('continue')}
                    Continue
                  </button>
                </form>
              ) : (
                <p mix={emptyNote}>Nothing to pick up yet. Play something and it will wait here for you.</p>
              )}
            </section>

            <section>
              <h2 mix={sectionTitle}>Recently played</h2>
              {recentlyPlayed.length > 0 ? (
                <ol mix={recentStrip}>
                  {recentlyPlayed.map((track) => (
                    <li mix={recentTile} key={track.id}>
                      <span mix={recentArt}>
                        {artworkPlate(track.album || track.title, track.hasArtwork ? track.id : null)}
                      </span>
                      <span mix={recentText}>
                        <span mix={recentTitle}>{track.title}</span>
                        <span mix={recentSub}>{track.artist}</span>
                        {track.playedAt ? (
                          <span mix={[caps, recentWhen]}>{playedLabel(track.playedAt, now)}</span>
                        ) : null}
                      </span>
                      <span mix={recentActions}>
                        {lonePlayButton(track.id)}
                        <TrackMenu trackId={track.id} playlists={chrome?.playlists} />
                      </span>
                    </li>
                  ))}
                </ol>
              ) : (
                <p mix={emptyNote}>No Recently played Tracks yet.</p>
              )}
            </section>
          </div>

          <section mix={section}>
            <h2 mix={visuallyHidden}>Browse</h2>
            <nav mix={facets} aria-label="Library facets">
              {facetLink('artists', facet, routes.libraryArtists.href(), 'Artists', artists.length)}
              {facetLink('albums', facet, routes.libraryAlbums.href(), 'Albums', albums.length)}
              {facetLink('tracks', facet, routes.libraryTracks.href(), 'Tracks', tracks.length)}
            </nav>

            {facet === 'artists' ? (
              <ul mix={artistList}>{artists.map((artist) => artistRow(artist))}</ul>
            ) : null}

            {facet === 'albums' ? (
              <ul mix={albumGrid}>{albums.map((album) => albumTile(album))}</ul>
            ) : null}

            {facet === 'tracks' ? (
              <ul mix={trackList}>
                {tracks.map((track) =>
                  trackRow({
                    key: track.id,
                    lead: artworkPlate(track.album || track.title, track.hasArtwork ? track.id : null, 'sm'),
                    title: track.title,
                    sub: `${track.artist} · ${track.album}`,
                    durationMs: track.durationMs,
                    play: lonePlayButton(track.id),
                    trackId: track.id,
                    playlists: chrome?.playlists,
                  }),
                )}
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
  count: number,
) {
  let active = destination === current
  return (
    <a
      href={href}
      mix={active ? [facetItem, facetItemCurrent] : facetItem}
      aria-current={active ? 'page' : undefined}
    >
      {label}
      <span mix={facetCount}>{count}</span>
    </a>
  )
}

export function playedLabel(playedAt: string, now: number): string {
  let stamp = /[zZ]|[+-]\d\d:?\d\d$/.test(playedAt) ? playedAt : `${playedAt.replace(' ', 'T')}Z`
  let at = Date.parse(stamp)
  if (Number.isNaN(at)) {
    return ''
  }
  let minutes = Math.floor((now - at) / 60000)
  if (minutes < 1) {
    return 'Just now'
  }
  if (minutes < 60) {
    return `${minutes} min ago`
  }
  let hours = Math.floor(minutes / 60)
  if (hours < 24) {
    return `${hours} hr ago`
  }
  let days = Math.floor(hours / 24)
  if (days === 1) {
    return 'Yesterday'
  }
  if (days < 7) {
    return `${days} days ago`
  }
  return 'Over a week ago'
}

let emptyPanel = css({
  display: 'grid',
  justifyItems: 'start',
  gap: '0.75rem',
  margin: '0 0 3rem',
  padding: '1.5rem',
  maxWidth: '40rem',
  background: color.sheet,
  border: `1.5px solid ${color.ink}`,
})

let emptyHead = css({
  margin: 0,
  fontStretch: font.condensed,
  fontWeight: 800,
  fontSize: '1.75rem',
  lineHeight: 1,
  textTransform: 'uppercase',
})

let emptyBody = css({
  margin: 0,
  color: color.mute,
  lineHeight: 1.5,
})

let band = css({
  display: 'grid',
  gap: '3rem',
  [wide]: {
    gridTemplateColumns: 'minmax(18rem, 25rem) minmax(0, 1fr)',
    gap: '2.5rem',
  },
})

let continueCard = css({
  display: 'grid',
  gridTemplateColumns: '5.5rem minmax(0, 1fr)',
  gap: '1rem',
  alignItems: 'center',
  padding: '1rem',
  background: color.sheet,
  border: `1.5px solid ${color.ink}`,
})

let continueArt = css({
  display: 'block',
  gridRow: 'span 2',
  alignSelf: 'start',
})

let continueText = css({
  display: 'grid',
  gap: '0.15rem',
  minWidth: 0,
})

let continueTitle = css({
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  fontStretch: font.condensed,
  fontWeight: 800,
  fontSize: '1.75rem',
  lineHeight: 1,
  textTransform: 'uppercase',
  paddingTop: '0.15rem',
})

let continueSub = css({
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  color: color.mute,
  fontSize: '0.875rem',
})

let continueButton = css({
  justifySelf: 'start',
})

let recentStrip = css({
  display: 'grid',
  gridAutoFlow: 'column',
  gridAutoColumns: '9.5rem',
  gap: '1rem',
  margin: 0,
  padding: '0 0 0.75rem',
  listStyle: 'none',
  overflowX: 'auto',
  scrollSnapType: 'x proximity',
  overscrollBehaviorX: 'contain',
})

let recentTile = css({
  display: 'grid',
  alignContent: 'start',
  gap: '0.5rem',
  minWidth: 0,
  scrollSnapAlign: 'start',
})

let recentArt = css({
  display: 'block',
})

let recentText = css({
  display: 'grid',
  minWidth: 0,
  lineHeight: 1.3,
})

let recentTitle = css({
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  fontWeight: 650,
})

let recentSub = css({
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  color: color.mute,
  fontSize: '0.875rem',
})

let recentWhen = css({
  marginTop: '0.2rem',
  color: color.mute,
  fontSize: '0.6875rem',
})

let recentActions = css({
  display: 'flex',
  alignItems: 'center',
  marginLeft: '-0.75rem',
})

let facets = css({
  display: 'flex',
  gap: '1.75rem',
  margin: '0 0 1.75rem',
  borderBottom: `2px solid ${color.ink}`,
  overflowX: 'auto',
})

let facetItem = css({
  display: 'inline-flex',
  alignItems: 'baseline',
  gap: '0.4rem',
  padding: '0.4rem 0 0.55rem',
  marginBottom: '-2px',
  borderBottom: '5px solid transparent',
  color: color.mute,
  textDecoration: 'none',
  fontStretch: font.condensed,
  fontWeight: 800,
  fontSize: 'clamp(1.6rem, 1.2vw + 1.2rem, 2.25rem)',
  lineHeight: 1,
  textTransform: 'uppercase',
  whiteSpace: 'nowrap',
  '&:hover': {
    color: color.ink,
  },
})

let facetItemCurrent = css({
  color: color.ink,
  borderBottomColor: color.ink,
})

let facetCount = css({
  fontStretch: font.semi,
  fontWeight: 700,
  fontSize: '0.8125rem',
  letterSpacing: '0.04em',
  fontVariantNumeric: 'tabular-nums',
  color: color.mute,
})
