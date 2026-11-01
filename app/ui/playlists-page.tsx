import type { Handle } from 'remix/component'
import { css } from 'remix/component'

import type { PlaylistSummary } from '../modules/playlists/index.ts'
import { routes } from '../routes.ts'
import { AppChrome, type ChromeState } from './app-chrome.tsx'
import { icon } from './icons.tsx'
import { alertMessage, pageHead, plural } from './page-kit.tsx'
import {
  btnPrimary,
  color,
  emptyNote,
  field,
  input,
  listing,
  listingRow,
  numCell,
  rowTitle,
  sectionTitle,
  titleLink,
  wide,
} from './theme.ts'

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
          {pageHead({
            title: 'Playlists',
            lede: 'Your saved running orders. A Playlist is kept for later; the Play queue is what is on air now.',
          })}
          {alertMessage(error)}

          <div mix={layout}>
            <section>
              <h2 mix={sectionTitle}>
                Your playlists
                <span mix={numCell}>{playlists.length}</span>
              </h2>
              {playlists.length === 0 ? (
                <p mix={emptyNote}>You have no Playlists yet. Create one to collect Tracks.</p>
              ) : (
                <ul mix={listing}>
                  {playlists.map((playlist) => (
                    <li mix={[listingRow, row]} key={playlist.id}>
                      <span mix={badge}>{icon('playlist')}</span>
                      <a mix={[titleLink, rowTitle, rowLink]} href={routes.playlist.index.href({ id: playlist.id })}>
                        {playlist.name}
                      </a>
                      <span mix={numCell}>{plural(playlist.trackCount, 'Track')}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section>
              <h2 mix={sectionTitle}>New Playlist</h2>
              <form method="POST" action={routes.playlists.action.href()} mix={createForm}>
                <label mix={field}>
                  Name
                  <input mix={input} type="text" name="name" required maxLength={80} placeholder="Sunday morning" />
                </label>
                <button mix={btnPrimary} type="submit">
                  {icon('plus')}
                  Create Playlist
                </button>
              </form>
            </section>
          </div>
        </main>
      </AppChrome>
    )
  }
}

let layout = css({
  display: 'grid',
  gap: '3rem',
  [wide]: {
    gridTemplateColumns: 'minmax(0, 1fr) 20rem',
    alignItems: 'start',
  },
})

let createForm = css({
  display: 'grid',
  gap: '0.85rem',
  justifyItems: 'start',
  '& label': {
    width: '100%',
  },
})

let row = css({
  gridTemplateColumns: '2.75rem minmax(0, 1fr) auto',
  gap: '0 0.9rem',
  paddingRight: '0.75rem',
  position: 'relative',
})

let rowLink = css({
  '&::after': {
    content: '""',
    position: 'absolute',
    inset: 0,
  },
})

let badge = css({
  display: 'grid',
  placeItems: 'center',
  width: '2.75rem',
  height: '2.75rem',
  background: color.night,
  color: color.paper,
  '& svg': {
    width: '1.2rem',
    height: '1.2rem',
  },
})
