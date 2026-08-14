import type { Handle, RemixNode } from 'remix/ui'
import { css } from 'remix/ui'

import type { HouseholdMember } from '../modules/auth/index.ts'
import type { Track } from '../modules/library/index.ts'
import type { ListenResume, ListeningSession } from '../modules/playback/index.ts'
import { routes } from '../routes.ts'
import { AppChrome, type ChromeState } from './app-chrome.tsx'

let empty = css({
  margin: '0 0 2rem',
  padding: '1.1rem 1.15rem',
  maxWidth: '28rem',
  background: '#fffdf7',
  border: '1px solid #e0d3bf',
  borderRadius: '2px',
})

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

let list = css({
  margin: '0 0 1rem',
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

let actions = css({
  display: 'flex',
  flexWrap: 'wrap',
  gap: '0.35rem',
})

let button = css({
  padding: '0.35rem 0.6rem',
  border: '1px solid #1a1410',
  borderRadius: '2px',
  background: 'transparent',
  fontFamily: 'system-ui, sans-serif',
  fontSize: '0.85rem',
  cursor: 'pointer',
})

export function LibraryHomePage(
  handle: Handle<{
    member: HouseholdMember
    session: ListeningSession
    tracks: Track[]
    recentlyPlayed: Track[]
    resume: ListenResume
    chrome?: ChromeState
    error?: string
  }>,
) {
  return () => {
    let { member, session, tracks, recentlyPlayed, resume, chrome, error } = handle.props
    let greeting = member.displayName ?? member.email
    let albums = groupTracks(tracks, (track) => `${track.albumArtist}\0${track.album}`, (track) => ({
      heading: `${track.album} — ${track.albumArtist}`,
    }))
    let artists = groupTracks(tracks, (track) => track.artist, (track) => ({
      heading: track.artist,
    }))

    return (
      <AppChrome title="Library · Spinbox" current="library" chrome={chrome}>
        <main>
          <h1 mix={heading}>Library</h1>
          <p mix={copy}>
            Welcome, {greeting}. Play a Track into your Listening session. The Play queue is not a
            Playlist.
          </p>
          {error ? <p mix={errorBox}>{error}</p> : null}

          {tracks.length === 0 ? (
            <section mix={empty}>
              <p mix={copy}>The Library index is empty. Nothing to browse yet.</p>
              {member.role === 'admin' ? (
                <form method="POST" action={routes.scanNow.href()}>
                  <input type="hidden" name="next" value={routes.home.href()} />
                  <button mix={button} type="submit">
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
                <button mix={button} type="submit">
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
              <ol mix={list}>
                {recentlyPlayed.map((track) => (
                  <li mix={item} key={track.id}>
                    <span mix={title}>
                      {track.title} — {track.artist}
                    </span>
                    {lonePlayButton(track.id)}
                    {queueButtons(track.id)}
                  </li>
                ))}
              </ol>
            ) : (
              <p mix={copy}>No Recently played Tracks yet.</p>
            )}
          </section>

          {tracks.length === 0 ? null : (
            <>
              <h2 mix={subheading}>Play queue</h2>
              {session.queue.length === 0 ? (
                <p mix={copy}>Nothing in the Play queue.</p>
              ) : (
                <ol mix={list}>
                  {session.queue.map((track) => (
                    <li mix={item} key={track.id}>
                      <span mix={title}>
                        {track.title} — {track.artist}
                      </span>
                    </li>
                  ))}
                </ol>
              )}

              <h2 mix={subheading}>Albums</h2>
              <ul mix={list}>
                {albums.map((album) => (
                  <li key={album.key}>
                    <div mix={item}>
                      <span mix={title}>{album.heading}</span>
                      {playContainerButton('Play album', album.tracks, 0)}
                    </div>
                    <ul mix={list}>
                      {album.tracks.map((track, index) => (
                        <li mix={item} key={track.id}>
                          <span mix={title}>{track.title}</span>
                          {playContainerButton('Play', album.tracks, index)}
                          {queueButtons(track.id)}
                        </li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ul>

              <h2 mix={subheading}>Artists</h2>
              <ul mix={list}>
                {artists.map((artist) => (
                  <li mix={item} key={artist.key}>
                    <span mix={title}>{artist.heading}</span>
                    {playContainerButton('Play artist', artist.tracks, 0)}
                  </li>
                ))}
              </ul>

              <h2 mix={subheading}>Tracks</h2>
              <ul mix={list}>
                {tracks.map((track) => (
                  <li mix={item} key={track.id}>
                    <span mix={title}>
                      {track.title} — {track.artist}
                    </span>
                    {lonePlayButton(track.id)}
                    {queueButtons(track.id)}
                  </li>
                ))}
              </ul>
            </>
          )}

        </main>
      </AppChrome>
    )
  }
}

function lonePlayButton(trackId: string): RemixNode {
  return (
    <form method="POST" action={routes.session.href()}>
      <input type="hidden" name="intent" value="play" />
      <input type="hidden" name="trackId" value={trackId} />
      <button mix={button} type="submit">
        Play
      </button>
    </form>
  )
}

function playContainerButton(label: string, tracks: Track[], startAt: number): RemixNode {
  return (
    <form method="POST" action={routes.session.href()}>
      <input type="hidden" name="intent" value="play" />
      {tracks.map((track) => (
        <input type="hidden" name="trackId" value={track.id} key={track.id} />
      ))}
      <input type="hidden" name="startAt" value={String(startAt)} />
      <button mix={button} type="submit">
        {label}
      </button>
    </form>
  )
}

function queueButtons(trackId: string): RemixNode {
  return (
    <span mix={actions}>
      <form method="POST" action={routes.session.href()}>
        <input type="hidden" name="intent" value="play-next" />
        <input type="hidden" name="trackId" value={trackId} />
        <button mix={button} type="submit">
          Play next
        </button>
      </form>
      <form method="POST" action={routes.session.href()}>
        <input type="hidden" name="intent" value="add-to-queue" />
        <input type="hidden" name="trackId" value={trackId} />
        <button mix={button} type="submit">
          Add to queue
        </button>
      </form>
    </span>
  )
}

function groupTracks(
  tracks: Track[],
  keyOf: (track: Track) => string,
  headingOf: (track: Track) => { heading: string },
) {
  let groups = new Map<string, { key: string; heading: string; tracks: Track[] }>()
  for (let track of tracks) {
    let key = keyOf(track)
    let group = groups.get(key)
    if (!group) {
      group = { key, heading: headingOf(track).heading, tracks: [] }
      groups.set(key, group)
    }
    group.tracks.push(track)
  }
  for (let group of groups.values()) {
    group.tracks.sort(compareAlbumTracks)
  }
  return [...groups.values()]
}

function compareAlbumTracks(left: Track, right: Track) {
  let disc = (left.discNumber ?? 0) - (right.discNumber ?? 0)
  if (disc !== 0) {
    return disc
  }
  let number = (left.trackNumber ?? 0) - (right.trackNumber ?? 0)
  if (number !== 0) {
    return number
  }
  return left.path.localeCompare(right.path)
}
