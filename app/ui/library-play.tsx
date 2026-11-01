import type { RemixNode } from 'remix/component'
import { css } from 'remix/component'

import type { Track } from '../modules/library/index.ts'
import { routes } from '../routes.ts'
import { icon } from './icons.tsx'
import { btnPrimary, btnSecondary, color, font, iconButton, sleeveFor } from './theme.ts'

export type PlaylistChoice = {
  id: string
  name: string
}

type PlayVariant = 'primary' | 'secondary' | 'icon' | 'plate'

export function lonePlayButton(trackId: string, next?: string): RemixNode {
  return (
    <form method="POST" action={routes.session.href()} mix={inlineForm}>
      <input type="hidden" name="intent" value="play" />
      <input type="hidden" name="trackId" value={trackId} />
      {next ? <input type="hidden" name="next" value={next} /> : null}
      <button mix={[iconButton, rowPlay]} type="submit" title="Play">
        {icon('play')}Play
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
      <summary mix={[iconButton, actionsSummary]} aria-label="Track actions" title="More">
        {icon('more')}
      </summary>
      <div mix={actionsList}>
        {queueAction('play-next', 'Play next', trackId, next)}
        {queueAction('add-to-queue', 'Add to queue', trackId, next)}
        <p mix={menuHeading}>Add to playlist</p>
        {playlists.length === 0 ? (
          <p mix={menuEmpty}>
            No Playlists yet. <a href={routes.playlists.index.href()}>Create one</a>
          </p>
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
              <button mix={menuItem} type="submit">
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
      <button mix={menuItem} type="submit">
        {label}
      </button>
    </form>
  )
}

export function playContainerButton(
  label: string,
  tracks: Track[],
  startAt: number,
  options: { shuffle?: boolean; next?: string; variant?: PlayVariant } = {},
): RemixNode {
  let variant =
    options.variant ?? (label === 'Play' ? 'icon' : options.shuffle ? 'secondary' : 'primary')
  let mix =
    variant === 'icon'
      ? [iconButton, rowPlay]
      : variant === 'plate'
        ? [iconButton, platePlay]
        : variant === 'secondary'
          ? btnSecondary
          : btnPrimary
  let iconOnly = variant === 'icon' || variant === 'plate'
  return (
    <form method="POST" action={routes.session.href()} mix={inlineForm}>
      <input type="hidden" name="intent" value="play" />
      {tracks.map((track, index) => (
        <input type="hidden" name="trackId" value={track.id} key={`${index}-${track.id}`} />
      ))}
      <input type="hidden" name="startAt" value={String(startAt)} />
      {options.shuffle ? <input type="hidden" name="shuffle" value="1" /> : null}
      {options.next ? <input type="hidden" name="next" value={options.next} /> : null}
      <button mix={mix} type="submit" title={iconOnly ? label : undefined}>
        {icon(options.shuffle ? 'shuffle' : 'play')}
        {label}
      </button>
    </form>
  )
}

export function artworkHref(trackId: string | null | undefined): string | null {
  return trackId ? routes.mediaArtwork.href({ trackId }) : null
}

export { sleeveFor }

export function artworkPlaceholder(label: string): RemixNode {
  return artworkPlate(label, null, 'md')
}

/**
 * Square artwork plate: the indexed cover when one exists, otherwise a printed
 * typographic sleeve so the grid never shows a broken image.
 */
export function artworkPlate(
  title: string,
  artworkTrackId?: string | null,
  size: 'sm' | 'md' | 'fill' = 'fill',
): RemixNode {
  let href = artworkHref(artworkTrackId)
  let sleeve = sleeveFor(title)
  return (
    <span
      mix={[
        plate,
        size === 'sm' ? plateSmall : size === 'md' ? plateMedium : null,
        css({ background: sleeve.background, color: sleeve.color }),
      ]}
      aria-hidden="true"
    >
      {size === 'sm' ? null : <span mix={sleeveTitle}>{title}</span>}
      {href ? <img mix={plateImage} src={href} alt="" loading="lazy" decoding="async" /> : null}
    </span>
  )
}

export let playButton = btnSecondary

let inlineForm = css({
  display: 'contents',
})

let rowPlay = css({
  color: color.ink,
  '& svg': {
    width: '1.1rem',
    height: '1.1rem',
  },
  '&:hover:not(:disabled)': {
    background: color.ink,
    color: color.paper,
  },
})

let platePlay = css({
  width: '3rem',
  height: '3rem',
  borderRadius: '50%',
  background: color.paper,
  color: color.ink,
  boxShadow: `0 0 0 1.5px ${color.ink}`,
  '& svg': {
    width: '1.25rem',
    height: '1.25rem',
  },
  '&:hover:not(:disabled)': {
    background: color.yellow,
  },
})

let actionsMenu = css({
  position: 'relative',
  '&[open] > summary': {
    background: color.ink,
    color: color.paper,
  },
})

let actionsSummary = css({
  listStyle: 'none',
  color: color.mute,
  '&::-webkit-details-marker': {
    display: 'none',
  },
  '&::marker': {
    content: '""',
  },
})

let actionsList = css({
  position: 'absolute',
  top: 'calc(100% + 4px)',
  right: 0,
  zIndex: 30,
  display: 'grid',
  minWidth: '13rem',
  padding: '0.35rem 0',
  background: color.sheet,
  border: `1.5px solid ${color.ink}`,
  boxShadow: '0 12px 28px -8px rgba(17, 19, 24, 0.35)',
  color: color.ink,
})

let menuItem = css({
  display: 'block',
  width: '100%',
  minHeight: '2.5rem',
  padding: '0.5rem 1rem',
  border: 0,
  background: 'transparent',
  textAlign: 'left',
  fontWeight: 500,
  fontSize: '0.9375rem',
  cursor: 'pointer',
  '&:hover': {
    background: color.yellow,
  },
})

let menuHeading = css({
  margin: '0.35rem 0 0',
  padding: '0.55rem 1rem 0.25rem',
  borderTop: `1px solid ${color.rule}`,
  fontStretch: font.semi,
  fontWeight: 700,
  fontSize: '0.75rem',
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  color: color.mute,
})

let menuEmpty = css({
  margin: 0,
  padding: '0.35rem 1rem 0.5rem',
  fontSize: '0.875rem',
  color: color.mute,
})

let plate = css({
  position: 'relative',
  display: 'grid',
  alignItems: 'end',
  width: '100%',
  aspectRatio: '1',
  overflow: 'hidden',
  containerType: 'inline-size',
})

let plateSmall = css({
  width: '2.75rem',
  height: '2.75rem',
  flex: 'none',
})

let plateMedium = css({
  width: '4.5rem',
  flex: 'none',
})

let sleeveTitle = css({
  display: '-webkit-box',
  WebkitLineClamp: '4',
  WebkitBoxOrient: 'vertical',
  overflow: 'hidden',
  padding: '8cqi',
  fontStretch: font.condensed,
  fontWeight: 800,
  fontSize: 'max(0.7rem, 11cqi)',
  lineHeight: 0.95,
  textTransform: 'uppercase',
  overflowWrap: 'anywhere',
})

let plateImage = css({
  position: 'absolute',
  inset: 0,
  width: '100%',
  height: '100%',
  objectFit: 'cover',
})
