import type { Handle } from 'remix/ui'
import { css } from 'remix/ui'

import { AppChrome, type ChromeState } from './app-chrome.tsx'

export function PlaylistsPage(handle: Handle<{ chrome?: ChromeState }>) {
  return () => {
    let { chrome } = handle.props

    return (
      <AppChrome title="Playlists · Spinbox" current="playlists" chrome={chrome}>
        <main>
          <h1 mix={heading}>Playlists</h1>
          <p mix={copy}>
            Your Playlists will live here. A Playlist is not the Play queue. Owner-private lists
            land in a later slice.
          </p>
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
