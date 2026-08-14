import type { Handle } from 'remix/ui'
import { css } from 'remix/ui'

import type { PlaylistSummary } from '../modules/playlists/index.ts'
import { routes } from '../routes.ts'
import { AppChrome, type ChromeState } from './app-chrome.tsx'

export function SearchPage(
  handle: Handle<{
    query?: string
    playlists?: PlaylistSummary[]
    chrome?: ChromeState
  }>,
) {
  return () => {
    let { query = '', playlists = [], chrome } = handle.props

    return (
      <AppChrome title="Search · Spinbox" current="search" chrome={chrome}>
        <main>
          <h1 mix={heading}>Search</h1>
          <form method="GET" action={routes.search.href()} mix={searchForm} role="search">
            <label mix={field}>
              Search the Library
              <input
                mix={input}
                type="search"
                name="q"
                value={query}
                placeholder="Tracks, Artists, Albums, Playlists"
                autoComplete="off"
              />
            </label>
            <button mix={submit} type="submit">
              Search
            </button>
          </form>
          {query ? (
            playlists.length > 0 ? (
              <section>
                <h2 mix={subheading}>Your playlists</h2>
                <ul mix={list}>
                  {playlists.map((playlist) => (
                    <li mix={item} key={playlist.id}>
                      <a mix={link} href={routes.playlist.index.href({ id: playlist.id })}>
                        {playlist.name}
                      </a>
                    </li>
                  ))}
                </ul>
              </section>
            ) : (
              <p mix={copy}>No grouped results yet for “{query}”.</p>
            )
          ) : (
            <p mix={copy}>Search Tracks, Artists, Albums, and your Playlists.</p>
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

let subheading = css({
  margin: '1.5rem 0 0.6rem',
  fontSize: '1.15rem',
})

let copy = css({
  margin: '1.25rem 0 0',
  maxWidth: '36rem',
  lineHeight: 1.5,
  color: '#4a4038',
})

let searchForm = css({
  display: 'grid',
  gap: '0.75rem',
  maxWidth: '28rem',
  '@media (min-width: 56rem)': {
    gridTemplateColumns: '1fr auto',
    alignItems: 'end',
  },
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
  padding: '0.45rem 0',
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
