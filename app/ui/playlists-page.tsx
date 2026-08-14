import type { Handle } from 'remix/ui'
import { css } from 'remix/ui'

import type { PlaylistSummary } from '../modules/playlists/index.ts'
import { routes } from '../routes.ts'
import { AppChrome, type ChromeState } from './app-chrome.tsx'

export function PlaylistsPage(
  handle: Handle<{
    playlists: PlaylistSummary[]
    chrome?: ChromeState
    error?: string
  }>,
) {
  return () => {
    let { playlists, chrome, error } = handle.props

    return (
      <AppChrome title="Playlists · Spinbox" current="playlists" chrome={chrome}>
        <main>
          <h1 mix={heading}>Playlists</h1>
          <p mix={copy}>Your Playlists. A Playlist is not the Play queue.</p>
          {error ? <p mix={errorBox}>{error}</p> : null}

          <form method="POST" action={routes.playlists.action.href()} mix={createForm}>
            <label mix={field}>
              New Playlist
              <input mix={input} type="text" name="name" required maxLength={80} />
            </label>
            <button mix={submit} type="submit">
              Create Playlist
            </button>
          </form>

          {playlists.length === 0 ? (
            <p mix={copy}>You have no Playlists yet. Create one to collect Tracks.</p>
          ) : (
            <ul mix={list}>
              {playlists.map((playlist) => (
                <li mix={item} key={playlist.id}>
                  <a mix={link} href={routes.playlist.index.href({ id: playlist.id })}>
                    {playlist.name}
                  </a>
                  <span mix={meta}>
                    {playlist.trackCount} {playlist.trackCount === 1 ? 'Track' : 'Tracks'}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </main>
      </AppChrome>
    )
  }
}

let heading = css({
  margin: '0 0 0.5rem',
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

let createForm = css({
  display: 'grid',
  gap: '0.65rem',
  maxWidth: '22rem',
  margin: '0 0 1.75rem',
})

let field = css({
  display: 'grid',
  gap: '0.35rem',
  fontFamily: '"Source Sans 3", sans-serif',
  fontSize: '0.95rem',
})

let input = css({
  padding: '0.65rem 0.7rem',
  border: '1px solid #c4b8a8',
  borderRadius: '2px',
  background: '#fffdf8',
  font: 'inherit',
})

let submit = css({
  padding: '0.7rem 0.9rem',
  border: 0,
  borderRadius: '2px',
  background: '#1c120c',
  color: '#f3ead8',
  fontFamily: '"Source Sans 3", sans-serif',
  fontWeight: 600,
  cursor: 'pointer',
})

let list = css({
  margin: 0,
  padding: 0,
  listStyle: 'none',
  maxWidth: '36rem',
})

let item = css({
  display: 'flex',
  flexWrap: 'wrap',
  alignItems: 'baseline',
  gap: '0.5rem 0.85rem',
  padding: '0.65rem 0',
  borderBottom: '1px solid #e0d6c8',
})

let link = css({
  color: '#1c120c',
  fontWeight: 600,
  textDecoration: 'none',
  '&:hover': {
    textDecoration: 'underline',
  },
})

let meta = css({
  color: '#6b5646',
  fontSize: '0.9rem',
})
