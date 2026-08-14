import type { Handle } from 'remix/ui'

import { PlayerIsland, playerProps, type PlayerSnapshot } from '../assets/player.tsx'
import { AppChrome, type ChromeState } from './app-chrome.tsx'

export function NowPlayingPage(
  handle: Handle<{
    chrome?: ChromeState
    snapshot: PlayerSnapshot
  }>,
) {
  return () => {
    let { chrome, snapshot } = handle.props
    return (
      <AppChrome title="Now playing · Spinbox" current="now-playing" chrome={chrome}>
        <PlayerIsland {...playerProps(snapshot, 'full')} />
      </AppChrome>
    )
  }
}
