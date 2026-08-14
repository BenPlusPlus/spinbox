import { clientEntry, on, type Handle } from 'remix/ui'

import { trackActions, type PlaylistChoice } from '../ui/library-play.tsx'

export const TrackMenu = clientEntry(
  import.meta.url,
  function TrackMenu(handle: Handle<{ trackId: string; next?: string; playlists?: PlaylistChoice[] }>) {
    let hold: number | null = null

    function openMenu(host: EventTarget | null) {
      if (!(host instanceof HTMLElement)) {
        return
      }
      let details = host.querySelector('details')
      if (details) {
        details.open = true
      }
    }

    function clearHold() {
      if (hold != null) {
        window.clearTimeout(hold)
        hold = null
      }
    }

    return () => (
      <div
        mix={[
          on('contextmenu', (event) => {
            event.preventDefault()
            openMenu(event.currentTarget)
          }),
          on('pointerdown', (event) => {
            if ((event as PointerEvent).pointerType !== 'touch') {
              return
            }
            clearHold()
            hold = window.setTimeout(() => {
              openMenu(event.currentTarget)
            }, 450)
          }),
          on('pointerup', () => {
            clearHold()
          }),
          on('pointercancel', () => {
            clearHold()
          }),
          on('pointerleave', () => {
            clearHold()
          }),
        ]}
      >
        {trackActions(handle.props.trackId, handle.props.next, handle.props.playlists)}
      </div>
    )
  },
)
