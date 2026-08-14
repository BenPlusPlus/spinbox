import type { RemixNode } from 'remix/ui'
import { css } from 'remix/ui'

import type { Track } from '../modules/library/index.ts'
import { routes } from '../routes.ts'

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

export function playContainerButton(
  label: string,
  tracks: Track[],
  startAt: number,
  options: { shuffle?: boolean; next?: string } = {},
): RemixNode {
  return (
    <form method="POST" action={routes.session.href()}>
      <input type="hidden" name="intent" value="play" />
      {tracks.map((track) => (
        <input type="hidden" name="trackId" value={track.id} key={track.id} />
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
