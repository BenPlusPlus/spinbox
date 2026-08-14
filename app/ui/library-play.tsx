import type { RemixNode } from 'remix/ui'
import { css } from 'remix/ui'

import type { Track } from '../modules/library/index.ts'
import { routes } from '../routes.ts'

export type PlaylistChoice = {
  id: string
  name: string
}

export function lonePlayButton(trackId: string, next?: string): RemixNode {
  return (
    <form method="POST" action={routes.session.href()}>
      <input type="hidden" name="intent" value="play" />
      <input type="hidden" name="trackId" value={trackId} />
      {next ? <input type="hidden" name="next" value={next} /> : null}
      <button mix={button} type="submit">
        Play
      </button>
    </form>
  )
}

export function trackActions(
  trackId: string,
  next?: string,
  playlists: PlaylistChoice[] = [],
): RemixNode {
  return (
    <details mix={actionsMenu}>
      <summary mix={actionsSummary} aria-label="Track actions">
        ⋯
      </summary>
      <div mix={actionsList}>
        {queueAction('play-next', 'Play next', trackId, next)}
        {queueAction('add-to-queue', 'Add to queue', trackId, next)}
        <p mix={playlistHeading}>Add to playlist</p>
        {playlists.length === 0 ? (
          <p mix={playlistEmpty}>Create a Playlist first</p>
        ) : (
          playlists.map((playlist) => (
            <form
              method="POST"
              action={routes.playlist.action.href({ id: playlist.id })}
              key={playlist.id}
            >
              <input type="hidden" name="intent" value="add" />
              <input type="hidden" name="trackId" value={trackId} />
              {next ? <input type="hidden" name="next" value={next} /> : null}
              <button mix={button} type="submit">
                {playlist.name}
              </button>
            </form>
          ))
        )}
      </div>
    </details>
  )
}

function queueAction(intent: string, label: string, trackId: string, next?: string): RemixNode {
  return (
    <form method="POST" action={routes.session.href()}>
      <input type="hidden" name="intent" value={intent} />
      <input type="hidden" name="trackId" value={trackId} />
      {next ? <input type="hidden" name="next" value={next} /> : null}
      <button mix={button} type="submit">
        {label}
      </button>
    </form>
  )
}

export function playContainerButton(
  label: string,
  tracks: Track[],
  startAt: number,
  options: { shuffle?: boolean; next?: string } = {},
): RemixNode {
  return (
    <form method="POST" action={routes.session.href()}>
      <input type="hidden" name="intent" value="play" />
      {tracks.map((track, index) => (
        <input type="hidden" name="trackId" value={track.id} key={`${index}-${track.id}`} />
      ))}
      <input type="hidden" name="startAt" value={String(startAt)} />
      {options.shuffle ? <input type="hidden" name="shuffle" value="1" /> : null}
      {options.next ? <input type="hidden" name="next" value={options.next} /> : null}
      <button mix={button} type="submit">
        {label}
      </button>
    </form>
  )
}

export function artworkPlaceholder(label: string): RemixNode {
  let initial = label.trim().slice(0, 1).toUpperCase() || '♪'
  return (
    <span mix={placeholder} aria-hidden="true">
      {initial}
    </span>
  )
}

export let playButton = css({
  padding: '0.35rem 0.6rem',
  border: '1px solid #1a1410',
  borderRadius: '2px',
  background: 'transparent',
  fontFamily: '"Source Sans 3", system-ui, sans-serif',
  fontSize: '0.85rem',
  cursor: 'pointer',
})

let button = playButton

let actionsMenu = css({
  position: 'relative',
})

let actionsSummary = css({
  listStyle: 'none',
  cursor: 'pointer',
  padding: '0.2rem 0.45rem',
  fontWeight: 700,
  letterSpacing: '0.08em',
  color: '#6b5646',
  '&::-webkit-details-marker': {
    display: 'none',
  },
})

let actionsList = css({
  position: 'absolute',
  right: 0,
  zIndex: 2,
  display: 'grid',
  gap: '0.25rem',
  minWidth: '9rem',
  padding: '0.45rem',
  background: '#fffdf7',
  border: '1px solid #e0d3bf',
  borderRadius: '2px',
  boxShadow: '0 8px 24px rgba(28, 18, 12, 0.12)',
})

let playlistHeading = css({
  margin: '0.45rem 0 0',
  fontSize: '0.72rem',
  fontWeight: 700,
  letterSpacing: '0.06em',
  textTransform: 'uppercase',
  color: '#6b5646',
})

let playlistEmpty = css({
  margin: 0,
  fontSize: '0.85rem',
  color: '#6b5646',
})

let placeholder = css({
  display: 'grid',
  placeItems: 'center',
  width: '3.4rem',
  height: '3.4rem',
  flex: '0 0 3.4rem',
  background: 'linear-gradient(145deg, #3a2418 0%, #1c120c 70%)',
  color: '#c4783a',
  fontFamily: 'Fraunces, Georgia, serif',
  fontSize: '1.35rem',
  fontWeight: 650,
  borderRadius: '2px',
  boxShadow: 'inset 0 0 0 1px rgba(243, 234, 216, 0.08)',
})
