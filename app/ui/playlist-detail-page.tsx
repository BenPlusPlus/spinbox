import type { Handle, RemixNode } from 'remix/ui'
import { css } from 'remix/ui'

import type { Playlist, PlaylistEntry } from '../modules/playlists/index.ts'
import { routes } from '../routes.ts'
import { AppChrome, type ChromeState } from './app-chrome.tsx'
import { playButton, playContainerButton } from './library-play.tsx'

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
          <main>
            <p mix={copy}>That Playlist was not found.</p>
            <a mix={back} href={routes.playlists.index.href()}>
              Back to Playlists
            </a>
          </main>
        </AppChrome>
      )
    }

    let next = routes.playlist.index.href({ id: playlist.id })
    let playable = playlist.entries.flatMap((entry) => (entry.track ? [entry.track] : []))

    return (
      <AppChrome title={`${playlist.name} · Spinbox`} current="playlists" chrome={chrome}>
        <main>
          <p mix={crumb}>
            <a href={routes.playlists.index.href()}>Playlists</a>
          </p>
          <h1 mix={heading}>{playlist.name}</h1>
          {error ? <p mix={errorBox}>{error}</p> : null}

          <div mix={toolbar}>
            <form method="POST" action={routes.playlist.action.href({ id: playlist.id })} mix={renameForm}>
              <input type="hidden" name="intent" value="rename" />
              <label mix={field}>
                Rename
                <input
                  mix={input}
                  type="text"
                  name="name"
                  value={playlist.name}
                  required
                  maxLength={80}
                />
              </label>
              <button mix={playButton} type="submit">
                Rename
              </button>
            </form>
            <form method="POST" action={routes.playlist.action.href({ id: playlist.id })}>
              <input type="hidden" name="intent" value="delete" />
              <button mix={danger} type="submit">
                Delete Playlist
              </button>
            </form>
          </div>

          {playable.length > 0 ? (
            <div mix={actions}>
              {playContainerButton('Play all', playable, 0, { next })}
              {playContainerButton('Shuffle', playable, 0, { shuffle: true, next })}
            </div>
          ) : null}

          {playlist.entries.length === 0 ? (
            <p mix={copy}>This Playlist is empty. Add a Track from ⋯ elsewhere.</p>
          ) : (
            <ol mix={list}>
              {playlist.entries.map((entry, index) => (
                <li mix={item} key={`${entry.position}-${entry.path}`}>
                  <span mix={indexCell}>{index + 1}</span>
                  <span mix={title}>
                    {entry.title}
                    {entry.missing ? <span mix={missing}> Missing track</span> : null}
                  </span>
                  <span mix={meta}>
                    {entry.artist} · {entry.album}
                  </span>
                  {entry.track
                    ? playContainerButton('Play', playable, playableStartAt(playlist.entries, index), {
                        next,
                      })
                    : null}
                  {entryAction(
                    playlist.id,
                    'reorder',
                    'Move up',
                    { from: String(entry.position), to: String(entry.position - 1) },
                    index === 0,
                  )}
                  {entryAction(
                    playlist.id,
                    'reorder',
                    'Move down',
                    { from: String(entry.position), to: String(entry.position + 1) },
                    index === playlist.entries.length - 1,
                  )}
                  {entryAction(playlist.id, 'remove', 'Remove', { position: String(entry.position) })}
                </li>
              ))}
            </ol>
          )}
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
  fields: Record<string, string>,
  disabled = false,
): RemixNode {
  return (
    <form method="POST" action={routes.playlist.action.href({ id: playlistId })}>
      <input type="hidden" name="intent" value={intent} />
      {Object.entries(fields).map(([name, value]) => (
        <input type="hidden" name={name} value={value} key={name} />
      ))}
      <button mix={playButton} type="submit" disabled={disabled}>
        {label}
      </button>
    </form>
  )
}

let crumb = css({
  margin: '0 0 1.25rem',
  fontSize: '0.85rem',
  '& a': {
    color: '#6b5646',
  },
})

let heading = css({
  margin: '0 0 0.75rem',
  fontSize: '2rem',
  fontFamily: 'Fraunces, Georgia, serif',
})

let copy = css({
  margin: '0 0 1.25rem',
  maxWidth: '36rem',
  lineHeight: 1.5,
  color: '#4a4038',
})

let errorBox = css({
  margin: '0 0 1rem',
  maxWidth: '36rem',
  color: '#8a2a2a',
})

let back = css({
  color: '#1c120c',
})

let toolbar = css({
  display: 'flex',
  flexWrap: 'wrap',
  gap: '0.75rem 1rem',
  alignItems: 'end',
  margin: '0 0 1.25rem',
})

let renameForm = css({
  display: 'flex',
  flexWrap: 'wrap',
  gap: '0.5rem',
  alignItems: 'end',
})

let field = css({
  display: 'grid',
  gap: '0.35rem',
  fontFamily: '"Source Sans 3", sans-serif',
  fontSize: '0.95rem',
})

let input = css({
  padding: '0.5rem 0.65rem',
  border: '1px solid #c4b8a8',
  borderRadius: '2px',
  background: '#fffdf8',
  font: 'inherit',
})

let actions = css({
  display: 'flex',
  flexWrap: 'wrap',
  gap: '0.45rem',
  margin: '0 0 1.25rem',
})

let list = css({
  margin: 0,
  padding: 0,
  listStyle: 'none',
  maxWidth: '44rem',
})

let item = css({
  display: 'flex',
  flexWrap: 'wrap',
  alignItems: 'baseline',
  gap: '0.45rem 0.65rem',
  padding: '0.55rem 0',
  borderBottom: '1px solid #e0d6c8',
})

let indexCell = css({
  width: '1.6rem',
  color: '#6b5646',
  fontVariantNumeric: 'tabular-nums',
})

let title = css({
  flex: '1 1 10rem',
})

let meta = css({
  color: '#6b5646',
  fontSize: '0.9rem',
})

let missing = css({
  marginLeft: '0.4rem',
  color: '#8a2a2a',
  fontSize: '0.85rem',
  fontWeight: 600,
})

let danger = css({
  padding: '0.35rem 0.6rem',
  border: '1px solid #6b2414',
  borderRadius: '2px',
  background: 'transparent',
  color: '#6b2414',
  fontFamily: '"Source Sans 3", system-ui, sans-serif',
  fontSize: '0.85rem',
  cursor: 'pointer',
})
