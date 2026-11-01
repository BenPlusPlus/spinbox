import type { Handle, RemixNode } from 'remix/component'
import { css } from 'remix/component'

import type { Playlist, PlaylistEntry } from '../modules/playlists/index.ts'
import { routes } from '../routes.ts'
import { AppChrome, type ChromeState } from './app-chrome.tsx'
import { icon, type IconName } from './icons.tsx'
import { playContainerButton } from './library-play.tsx'
import {
  alertMessage,
  backLink,
  notFound,
  pageHead,
  plural,
  runningTime,
  trackList,
  trackRow,
} from './page-kit.tsx'
import {
  btnDanger,
  btnSecondary,
  caps,
  color,
  emptyNote,
  field,
  iconButton,
  input,
  numCell,
  section,
  sectionTitle,
  wide,
} from './theme.ts'

export function PlaylistDetailPage(
  handle: Handle<{
    playlist: Playlist | null
    chrome?: ChromeState
    error?: string
  }>,
) {
  return () => {
    let { playlist, chrome, error } = handle.props
    if (playlist == null) {
      return (
        <AppChrome title="Playlist · Spinbox" current="playlists" chrome={chrome}>
          {notFound(
            'Playlist not found',
            'That Playlist was not found. It may have been deleted.',
            routes.playlists.index.href(),
            'Back to Playlists',
          )}
        </AppChrome>
      )
    }

    let next = routes.playlist.index.href({ id: playlist.id })
    let playable = playlist.entries.flatMap((entry) => (entry.track ? [entry.track] : []))
    let missingCount = playlist.entries.length - playable.length
    let length = runningTime(playable)

    return (
      <AppChrome title={`${playlist.name} · Spinbox`} current="playlists" chrome={chrome}>
        <main>
          {backLink(routes.playlists.index.href(), 'Playlists')}
          {pageHead({
            title: playlist.name,
            lede: [
              plural(playlist.entries.length, 'Track'),
              length || null,
              missingCount > 0 ? `${missingCount} missing` : null,
            ]
              .filter(Boolean)
              .join(' · '),
            actions:
              playable.length > 0 ? (
                <>
                  {playContainerButton('Play all', playable, 0, { next })}
                  {playContainerButton('Shuffle', playable, 0, { shuffle: true, next })}
                </>
              ) : undefined,
          })}
          {alertMessage(error)}

          {playlist.entries.length === 0 ? (
            <p mix={emptyNote}>
              This Playlist is empty. Add a Track from its ⋯ Track actions menu anywhere in the Library.
            </p>
          ) : (
            <ol mix={trackList}>
              {playlist.entries.map((entry, index) =>
                trackRow({
                  key: `${entry.position}-${entry.path}`,
                  lead: <span mix={numCell}>{index + 1}</span>,
                  title: (
                    <>
                      {entry.missing ? <span mix={[caps, missingTag]}>Missing track</span> : null}
                      {entry.title}
                    </>
                  ),
                  sub: `${entry.artist} · ${entry.album}`,
                  durationMs: entry.track?.durationMs ?? null,
                  muted: entry.missing,
                  play: entry.track
                    ? playContainerButton('Play', playable, playableStartAt(playlist.entries, index), { next })
                    : undefined,
                  trailing: (
                    <span mix={reorder}>
                      {entryAction(
                        playlist.id,
                        'reorder',
                        'Move up',
                        'up',
                        { from: String(entry.position), to: String(entry.position - 1) },
                        index === 0,
                      )}
                      {entryAction(
                        playlist.id,
                        'reorder',
                        'Move down',
                        'down',
                        { from: String(entry.position), to: String(entry.position + 1) },
                        index === playlist.entries.length - 1,
                      )}
                      {entryAction(playlist.id, 'remove', 'Remove', 'remove', {
                        position: String(entry.position),
                      })}
                    </span>
                  ),
                }),
              )}
            </ol>
          )}

          <section mix={[section, manage]}>
            <h2 mix={sectionTitle}>Manage Playlist</h2>
            <div mix={manageGrid}>
              <form method="POST" action={routes.playlist.action.href({ id: playlist.id })} mix={renameForm}>
                <input type="hidden" name="intent" value="rename" />
                <label mix={field}>
                  Rename
                  <input mix={input} type="text" name="name" value={playlist.name} required maxLength={80} />
                </label>
                <button mix={btnSecondary} type="submit">
                  Rename
                </button>
              </form>
              <form method="POST" action={routes.playlist.action.href({ id: playlist.id })} mix={deleteForm}>
                <input type="hidden" name="intent" value="delete" />
                <p mix={deleteCopy}>Deleting removes the Playlist for good. The Tracks stay in the Library.</p>
                <button mix={btnDanger} type="submit">
                  Delete Playlist
                </button>
              </form>
            </div>
          </section>
        </main>
      </AppChrome>
    )
  }
}

function playableStartAt(entries: PlaylistEntry[], index: number): number {
  return entries.slice(0, index).filter((entry) => entry.track != null).length
}

function entryAction(
  playlistId: string,
  intent: string,
  label: string,
  glyph: IconName,
  fields: Record<string, string>,
  disabled = false,
): RemixNode {
  return (
    <form method="POST" action={routes.playlist.action.href({ id: playlistId })} mix={inlineForm}>
      <input type="hidden" name="intent" value={intent} />
      {Object.entries(fields).map(([name, value]) => (
        <input type="hidden" name={name} value={value} key={name} />
      ))}
      <button mix={[iconButton, smallIcon]} type="submit" disabled={disabled} title={label}>
        {icon(glyph)}
        {label}
      </button>
    </form>
  )
}

let inlineForm = css({
  display: 'contents',
})

let reorder = css({
  display: 'flex',
  alignItems: 'center',
  marginLeft: '0.25rem',
  paddingLeft: '0.25rem',
  borderLeft: `1px solid ${color.rule}`,
})

let smallIcon = css({
  width: '2.25rem',
  color: color.mute,
  '& svg': {
    width: '1.1rem',
    height: '1.1rem',
  },
  '&:hover:not(:disabled)': {
    color: color.ink,
  },
})

let missingTag = css({
  display: 'inline-block',
  marginRight: '0.5rem',
  padding: '0.15rem 0.35rem',
  border: `1px solid ${color.redInk}`,
  color: color.redInk,
  fontSize: '0.6875rem',
  verticalAlign: '0.1em',
})

let manage = css({
  marginTop: '4rem',
})

let manageGrid = css({
  display: 'grid',
  gap: '2rem',
  [wide]: {
    gridTemplateColumns: 'minmax(0, 24rem) minmax(0, 22rem)',
    justifyContent: 'space-between',
    alignItems: 'end',
  },
})

let renameForm = css({
  display: 'grid',
  gridTemplateColumns: 'minmax(0, 1fr) auto',
  gap: '0.5rem',
  alignItems: 'end',
})

let deleteForm = css({
  display: 'grid',
  gap: '0.75rem',
  justifyItems: 'start',
})

let deleteCopy = css({
  margin: 0,
  color: color.mute,
  fontSize: '0.875rem',
  lineHeight: 1.45,
})
