import { clientEntry, css, on, ref, type Handle, type RemixNode } from 'remix/component'

import { routes } from '../routes.ts'
import { icon, type IconName } from '../ui/icons.tsx'
import { btnSecondary, btnSmall, color, font, iconButton, sleeveFor, wide } from '../ui/theme.ts'

export type PlayerTrack = {
  id: string
  title: string
  artist: string
  album: string
  durationMs: number | null
  artworkHref?: string | null
}

export type PlayerRepeat = 'off' | 'all' | 'one'

export type PlayerSnapshot = {
  currentTrack: PlayerTrack | null
  queue: PlayerTrack[]
  playing: boolean
  shuffle: boolean
  repeat: PlayerRepeat
  playheadMs: number
  mediaHref: string | null
}

export type PlayerProps = PlayerSnapshot & {
  mode: 'full' | 'dock'
  sessionHref: string
  nowPlayingHref: string
  libraryHref: string
}

const UNPLAYABLE = "Can't play this Track"
const SWAP_MS = 420

export const PlayerIsland = clientEntry(
  import.meta.url,
  function PlayerIsland(handle: Handle<PlayerProps>) {
    let view = snapshotFromProps(handle.props)
    let error: string | null = null
    let swapping = false
    let retried = false
    let audio: HTMLAudioElement | null = null
    let persistAt = 0

    let clockReady = false

    handle.queueTask(() => {
      syncAudio(true)
      // Projected clock times depend on the listener's timezone, so they only render after mount.
      if (typeof window !== 'undefined' && !clockReady) {
        clockReady = true
        void handle.update()
      }
    })

    return () => {
      let props = handle.props
      if (props.mode === 'dock' && view.currentTrack == null) {
        return null
      }

      return (
        <div
          mix={[
            props.mode === 'full' ? fullRoot : dockRoot,
            on('submit', (event) => {
              void interceptSubmit(event as SubmitEvent)
            }),
          ]}
        >
          {audioEl()}
          {props.mode === 'full' ? fullSurface() : dockSurface()}
        </div>
      )
    }

    function audioEl(): RemixNode {
      if (view.currentTrack == null || view.mediaHref == null) {
        return null
      }
      return (
        <audio
          key={view.currentTrack.id}
          mix={[
            hiddenAudio,
            ref((node) => {
              audio = node as HTMLAudioElement
            }),
            on('error', () => {
              void onAudioError()
            }),
            on('ended', () => {
              void onEnded()
            }),
            on('timeupdate', () => {
              onTimeUpdate()
            }),
            on('playing', () => {
              if (error) {
                error = null
                void handle.update()
              }
            }),
          ]}
          src={streamHref(view.mediaHref) ?? undefined}
          preload="metadata"
        ></audio>
      )
    }

    function fullSurface(): RemixNode {
      let track = view.currentTrack
      if (track == null) {
        return (
          <main mix={[idleFull, nightTone]} data-surface="night">
            <div mix={deckBar}>
              <span mix={onAir}>Off air</span>
            </div>
            <div mix={idleInner}>
              <h1 mix={idleTitle}>Nothing playing</h1>
              <p mix={idleCopy}>
                Choose an Album, Playlist or Track in the Library and it will start spinning here.
              </p>
              <a mix={idleLink} href={handle.props.libraryHref}>
                {icon('back')}
                Back to Library
              </a>
            </div>
          </main>
        )
      }

      let schedule = projectedStarts(track)
      return (
        <main mix={fullMain}>
          <section mix={classic} aria-label="Classic deck">
            <div mix={[deck, nightTone]} data-surface="night">
              <div mix={deckBar}>
                {onAirTag()}
                <span mix={deckNote}>{track.album}</span>
              </div>
              <div mix={deckTable}>{turntable(track, classicPlinth)}</div>
            </div>
            <div mix={[programme, paperTone]}>
              {errorBanner()}
              <div mix={nowBlock}>
                <h1 mix={nowTitle}>{track.title}</h1>
                <p mix={nowByline}>
                  <strong>{track.artist}</strong>
                  <span aria-hidden="true"> · </span>
                  {track.album}
                </p>
                {seekBar(track, schedule)}
                {fullTransport()}
              </div>
              <section mix={listingBlock} aria-label="Tonight's listing">
                {listingContent(track, schedule)}
              </section>
            </div>
          </section>

          <section mix={[phone, nightTone]} aria-label="Phone stack" data-surface="night">
            <div mix={deckBar}>
              {onAirTag()}
              <span mix={deckNote}>{track.album}</span>
            </div>
            {turntable(track, phonePlinth)}
            <div>
              <h1 mix={phoneTitle}>{track.title}</h1>
              <p mix={phoneByline}>
                {track.artist}
                <span aria-hidden="true"> · </span>
                {track.album}
              </p>
            </div>
            {errorBanner()}
            {seekBar(track, schedule)}
            {fullTransport()}
            <section mix={[phoneListing, paperTone]} aria-label="Tonight's listing">
              {listingContent(track, schedule)}
            </section>
          </section>
        </main>
      )
    }

    function dockSurface(): RemixNode {
      let track = view.currentTrack
      if (track == null) {
        return null
      }
      let schedule = projectedStarts(track)
      let live = view.playing && !error
      return (
        <aside mix={[dock, nightTone]} aria-label="Mini-dock" data-surface="night">
          <a
            mix={dockMeta}
            href={handle.props.nowPlayingHref}
            aria-label={`Now playing · ${track.title} — ${track.artist}${view.playing ? '' : ' (paused)'}`}
          >
            {miniRecord(track)}
            <span mix={dockText}>
              <span mix={[dockState, live ? dockStateLive : null]}>
                {error ? "Can't play" : view.playing ? 'On air' : 'Paused'}
              </span>
              <span mix={dockTitle} data-dock-title>{track.title}</span>
              <span mix={dockArtist}>{track.artist}</span>
            </span>
          </a>
          <div mix={dockTransport}>
            {sessionButton('skip-previous', 'Previous')}
            {sessionButton(
              'update',
              view.playing ? 'Pause' : 'Play',
              view.playing ? { playing: '0' } : { playing: '1' },
            )}
            {sessionButton('skip-next', 'Next')}
            {queueSheet(track, schedule)}
          </div>
        </aside>
      )
    }

    function queueSheet(track: PlayerTrack, schedule: (number | null)[] | null): RemixNode {
      return (
        <details mix={dockSheet}>
          <summary mix={[iconButton, dockSheetSummary]} title="Play queue">
            {icon('queue')}
            <span mix={srOnly}>Play queue</span>
            {view.queue.length > 0 ? <span mix={queueBadge}>{view.queue.length}</span> : null}
          </summary>
          <section mix={[dockSheetPanel, paperTone]} aria-label="Play queue">
            {listingContent(track, schedule)}
          </section>
        </details>
      )
    }

    function listingContent(track: PlayerTrack, schedule: (number | null)[] | null): RemixNode {
      return (
        <>
          <h2 mix={listingHead}>
            <span>Tonight's listing</span>
            <span mix={listingCount}>{queueCount()}</span>
          </h2>
          <ol mix={listingRows}>
            <li mix={[listingRow, listingRowCurrent]} aria-current="true">
              <span mix={rowClock}>{schedule?.[0] != null ? clock(schedule[0]) : ''}</span>
              <span mix={rowMain}>
                <span mix={rowTitleText}>{track.title}</span>
                <span mix={rowArtistText}>{track.artist}</span>
              </span>
              <span mix={rowDuration}>{track.durationMs != null ? formatMs(track.durationMs) : ''}</span>
              <span mix={rowActions}>
                <span mix={rowNowTag}>{view.playing ? 'On air' : 'Paused'}</span>
              </span>
            </li>
            {view.queue.map((item, index) => (
              <li mix={listingRow} key={`${item.id}-${index}`}>
                <span mix={rowClock}>
                  {schedule?.[index + 1] != null ? clock(schedule[index + 1]!) : ''}
                </span>
                <span mix={rowMain}>
                  <span mix={rowTitleText}>{item.title}</span>
                  <span mix={rowArtistText}>{item.artist}</span>
                </span>
                <span mix={rowDuration}>
                  {item.durationMs != null ? formatMs(item.durationMs) : ''}
                </span>
                <span mix={rowActions}>
                  {index > 0
                    ? sessionButton('reorder-queue', 'Move up', {
                        from: String(index),
                        to: String(index - 1),
                      })
                    : <span mix={rowActionGap}></span>}
                  {index < view.queue.length - 1
                    ? sessionButton('reorder-queue', 'Move down', {
                        from: String(index),
                        to: String(index + 1),
                      })
                    : <span mix={rowActionGap}></span>}
                  {sessionButton('remove-from-queue', 'Remove', { position: String(index) })}
                </span>
              </li>
            ))}
          </ol>
          {view.queue.length === 0 ? (
            <p mix={listingEmpty}>
              Nothing scheduled after this Track. Use Play next or Add to queue in the Library to keep
              the evening going.
            </p>
          ) : null}
          <div mix={listingFoot}>
            {view.queue.length > 0 ? sessionButton('clear-upcoming', 'Clear upcoming') : null}
            {sessionButton('clear-all', 'Clear all')}
          </div>
        </>
      )
    }

    function turntable(track: PlayerTrack, size: ReturnType<typeof css>): RemixNode {
      let armDown = view.playing && !swapping && !error
      return (
        <div mix={[plinth, size]} data-plinth aria-hidden="true">
          <div mix={[vinylFlip, swapping ? vinylEdge : null]}>
            <div mix={[vinyl, armDown ? vinylSpinning : null]} data-vinyl>
              {recordLabel(track, labelLarge)}
            </div>
            <div mix={vinylSheen}></div>
          </div>
          <div mix={tonearmLayer} data-tonearm>
            <svg viewBox="0 0 100 100" mix={tonearmSvg}>
              <circle cx="88" cy="14" r="7" fill={color.night} stroke={color.nightLine} stroke-width="1" />
              <g mix={[arm, armDown ? armPlaying : null]}>
                <rect x="85.5" y="2.5" width="5" height="7.5" fill={color.nightMute} />
                <path
                  d="M88 14 V54 L84.5 61"
                  fill="none"
                  stroke={color.paper}
                  stroke-width="1.3"
                  stroke-linecap="square"
                  stroke-linejoin="miter"
                />
                <rect
                  x="81.5"
                  y="59.5"
                  width="6"
                  height="4"
                  transform="rotate(-30 84.5 61.5)"
                  fill={color.paper}
                />
              </g>
              <circle cx="88" cy="14" r="2.2" fill={color.paper} />
            </svg>
          </div>
          <span mix={[plinthLamp, armDown ? plinthLampOn : null]}></span>
          <span mix={plinthSpeed}>33⅓</span>
        </div>
      )
    }

    function recordLabel(track: PlayerTrack, size: ReturnType<typeof css>): RemixNode {
      let sleeve = sleeveFor(track.album || track.title)
      return (
        <span mix={[labelBase, size, css({ background: sleeve.background, color: sleeve.color })]}>
          {track.artworkHref ? (
            <img mix={labelArt} src={track.artworkHref} alt="" decoding="async" />
          ) : size === labelLarge ? (
            <span mix={labelText}>
              <span mix={labelTitle}>{track.title}</span>
              <span mix={labelArtist}>{track.artist}</span>
            </span>
          ) : null}
          <span mix={spindle}></span>
        </span>
      )
    }

    function miniRecord(track: PlayerTrack): RemixNode {
      return (
        <span mix={[miniDisc, view.playing && !swapping && !error ? vinylSpinning : null]} aria-hidden="true">
          {recordLabel(track, labelSmall)}
        </span>
      )
    }

    function onAirTag(): RemixNode {
      let live = view.playing && !error && !swapping
      return (
        <span mix={[onAir, live ? onAirLive : null]}>
          {error ? 'Off air' : view.playing ? 'On air' : 'Paused'}
        </span>
      )
    }

    function queueCount(): string {
      let count = view.queue.length
      return count === 0 ? 'Up next · nothing queued' : `Up next · ${count} ${count === 1 ? 'Track' : 'Tracks'}`
    }

    function projectedStarts(track: PlayerTrack): (number | null)[] | null {
      if (!clockReady) {
        return null
      }
      let cursor: number | null = Date.now() - view.playheadMs
      let starts: (number | null)[] = [cursor]
      let durations = [track.durationMs, ...view.queue.map((item) => item.durationMs)]
      for (let index = 0; index < view.queue.length; index++) {
        let duration = durations[index]
        cursor = cursor != null && duration != null ? cursor + duration : null
        starts.push(cursor)
      }
      return starts
    }

    function fullTransport(): RemixNode {
      return (
        <div mix={transport}>
          {sessionButton(
            'update',
            'Shuffle',
            { shuffle: view.shuffle ? '0' : '1' },
            view.shuffle,
          )}
          {sessionButton('skip-previous', 'Previous')}
          {sessionButton(
            'update',
            view.playing ? 'Pause' : 'Play',
            view.playing ? { playing: '0' } : { playing: '1' },
          )}
          {sessionButton('skip-next', 'Next')}
          {sessionButton(
            'update',
            'Repeat',
            { repeat: nextRepeat(view.repeat) },
            view.repeat !== 'off',
          )}
        </div>
      )
    }

    function seekBar(track: PlayerTrack, schedule: (number | null)[] | null): RemixNode {
      let max = Math.max(track.durationMs ?? 0, view.playheadMs, 1)
      let value = Math.min(view.playheadMs, max)
      let pct = ((value / max) * 100).toFixed(2)
      let start = schedule?.[0] ?? null
      let ends = start != null && track.durationMs != null ? start + track.durationMs : null
      return (
        <div mix={seekWrap}>
          <input
            mix={[
              seek,
              on('input', (event) => {
                let next = Number((event.target as HTMLInputElement).value)
                view.playheadMs = next
                if (audio) {
                  audio.currentTime = next / 1000
                }
                void handle.update()
              }),
              on('change', (event) => {
                let next = Number((event.target as HTMLInputElement).value)
                void postIntent({ intent: 'update', playheadMs: String(next) })
              }),
            ]}
            style={`--pct:${pct}%`}
            type="range"
            min="0"
            max={String(max)}
            value={String(value)}
            aria-label="Seek"
            aria-valuetext={`${formatMs(value)} of ${formatMs(track.durationMs ?? max)}`}
          />
          <div mix={seekTimes}>
            <span>{formatMs(view.playheadMs)}</span>
            <span mix={seekClock}>
              {start != null && ends != null ? `${clock(start)} → ${clock(ends)}` : ''}
            </span>
            <span>{formatMs(track.durationMs ?? max)}</span>
          </div>
        </div>
      )
    }

    function sessionButton(
      intent: string,
      label: string,
      fields: Record<string, string> = {},
      pressed?: boolean,
    ): RemixNode {
      let glyph = glyphFor(label, view.repeat)
      let kind = label === 'Play' || label === 'Pause' ? 'play' : glyph ? 'icon' : 'text'
      let small = label === 'Move up' || label === 'Move down' || label === 'Remove'
      return (
        <form method="POST" action={handle.props.sessionHref} mix={inlineForm}>
          <input type="hidden" name="intent" value={intent} />
          <input type="hidden" name="next" value={returnTo()} />
          {Object.entries(fields).map(([name, value]) => (
            <input type="hidden" name={name} value={value} key={name} />
          ))}
          <button
            mix={
              kind === 'play'
                ? [iconButton, playButton]
                : kind === 'icon'
                  ? [iconButton, toneButton, small ? smallButton : null]
                  : [btnSecondary, btnSmall]
            }
            type="submit"
            aria-label={kind === 'text' ? undefined : label}
            aria-pressed={pressed}
            title={
              kind === 'text' ? undefined : label === 'Repeat' ? `Repeat: ${view.repeat}` : label
            }
          >
            {glyph ? icon(glyph) : null}
            {label}
          </button>
        </form>
      )
    }

    function errorBanner(): RemixNode {
      if (!error) {
        return null
      }
      return (
        <div mix={errorBox} role="alert">
          {icon('alert')}
          <p mix={errorText}>
            <strong>{error}</strong>
            <span>
              The file may be missing or in a format this browser can't decode. Skip to the next
              Track or choose another.
            </span>
          </p>
        </div>
      )
    }

    function returnTo(): string {
      return handle.props.mode === 'full' ? handle.props.nowPlayingHref : handle.props.libraryHref
    }

    async function interceptSubmit(event: SubmitEvent) {
      let form = event.target
      if (!(form instanceof HTMLFormElement)) {
        return
      }
      if (form.method.toLowerCase() !== 'post') {
        return
      }
      event.preventDefault()
      let data = new FormData(form)
      let fields: Record<string, string> = {}
      for (let [name, value] of data.entries()) {
        if (typeof value === 'string') {
          fields[name] = value
        }
      }
      if (fields.intent === 'update' && fields.playing === '0') {
        view.playing = false
        if (audio) {
          view.playheadMs = Math.floor(audio.currentTime * 1000)
          fields.playheadMs = String(view.playheadMs)
        }
        audio?.pause()
        void handle.update()
      } else if (fields.intent === 'update' && fields.playing === '1') {
        view.playing = true
        if (audio) {
          view.playheadMs = Math.floor(audio.currentTime * 1000)
          fields.playheadMs = String(view.playheadMs)
        }
        void audio?.play().catch(() => {
          // Autoplay block is not an unplayable Track; media `error` handles non-2xx.
        })
        void handle.update()
      }
      await postIntent(fields)
    }

    async function postIntent(fields: Record<string, string>) {
      let response = await fetch(handle.props.sessionHref, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Accept: 'application/json',
        },
        body: new URLSearchParams(fields),
      })
      if (!response.ok) {
        void handle.update()
        return
      }
      let next = (await response.json()) as PlayerSnapshot
      applySnapshot(next)
    }

    function applySnapshot(next: PlayerSnapshot) {
      let action = sameTrackAudioAction(
        {
          trackId: view.currentTrack?.id ?? null,
          playing: view.playing,
          playheadMs: view.playheadMs,
        },
        {
          trackId: next.currentTrack?.id ?? null,
          playing: next.playing,
          playheadMs: next.playheadMs,
        },
      )
      if (action === 'load') {
        swapping = true
        error = null
        retried = false
        void handle.update()
        window.setTimeout(() => {
          view = { ...next }
          void handle.update()
          window.setTimeout(() => {
            swapping = false
            syncAudio(true)
            void handle.update()
          }, SWAP_MS)
        }, SWAP_MS)
        return
      }
      let localMs = audio ? Math.floor(audio.currentTime * 1000) : view.playheadMs
      view = { ...next, playheadMs: mergePlayhead(localMs, next.playheadMs, action) }
      if (action === 'transport') {
        syncAudio(false)
      }
      void handle.update()
    }

    function syncAudio(force: boolean) {
      if (audio == null || view.mediaHref == null) {
        return
      }
      let nextSrc = streamHref(view.mediaHref)
      let currentSrc = streamHref(audio.getAttribute('src'))
      if (nextSrc && (force || currentSrc !== nextSrc)) {
        audio.src = nextSrc
      }
      let target = view.playheadMs / 1000
      if (Math.abs(audio.currentTime - target) > 1.25) {
        try {
          audio.currentTime = target
        } catch {
          // media fragment / metadata may not be ready yet
        }
      }
      if (view.playing) {
        void audio.play().catch(() => {
          // Autoplay block is not an unplayable Track; media `error` handles non-2xx.
        })
      } else {
        audio.pause()
      }
    }

    async function onAudioError() {
      if (!retried && audio && audio.currentTime > 0.25) {
        retried = true
        let time = audio.currentTime
        audio.load()
        try {
          audio.currentTime = time
        } catch {
          // ignore
        }
        try {
          await audio.play()
          return
        } catch {
          // fall through to unplayable
        }
      }
      error = UNPLAYABLE
      void handle.update()
    }

    async function onEnded() {
      if (error) {
        return
      }
      if (view.repeat === 'one') {
        if (audio) {
          audio.currentTime = 0
          void audio.play()
        }
        await postIntent({ intent: 'update', playheadMs: '0', playing: '1' })
        return
      }
      await postIntent({ intent: 'skip-next' })
    }

    function onTimeUpdate() {
      if (audio == null || swapping) {
        return
      }
      view.playheadMs = Math.floor(audio.currentTime * 1000)
      void handle.update()
      let now = Date.now()
      if (now - persistAt > 5000) {
        persistAt = now
        void postIntent({
          intent: 'update',
          playheadMs: String(view.playheadMs),
          playing: view.playing ? '1' : '0',
        })
      }
    }
  },
)

export function playerProps(
  snapshot: PlayerSnapshot,
  mode: 'full' | 'dock',
): PlayerProps {
  return {
    ...snapshot,
    mode,
    sessionHref: routes.session.href(),
    nowPlayingHref: routes.nowPlaying.href(),
    libraryHref: routes.home.href(),
  }
}

export function snapshotFromSession(input: {
  currentTrack: PlayerTrack | null
  queue: PlayerTrack[]
  playing: boolean
  shuffle: boolean
  repeat: PlayerRepeat
  playheadMs: number
  mediaHref: string | null
}): PlayerSnapshot {
  return {
    currentTrack: input.currentTrack,
    queue: input.queue,
    playing: input.playing,
    shuffle: input.shuffle,
    repeat: input.repeat,
    playheadMs: input.playheadMs,
    mediaHref: input.mediaHref,
  }
}

function snapshotFromProps(props: PlayerProps): PlayerSnapshot {
  return {
    currentTrack: props.currentTrack,
    queue: props.queue,
    playing: props.playing,
    shuffle: props.shuffle,
    repeat: props.repeat,
    playheadMs: props.playheadMs,
    mediaHref: props.mediaHref,
  }
}

function nextRepeat(repeat: PlayerRepeat): PlayerRepeat {
  if (repeat === 'off') {
    return 'all'
  }
  if (repeat === 'all') {
    return 'one'
  }
  return 'off'
}

export function streamHref(href: string | null | undefined): string | null {
  if (href == null || href === '') {
    return null
  }
  let hash = href.indexOf('#')
  return hash === -1 ? href : href.slice(0, hash)
}

export function mergePlayhead(
  localMs: number,
  serverMs: number,
  action: 'load' | 'transport' | 'none',
): number {
  if (action === 'load') {
    return serverMs
  }
  return Math.max(localMs, serverMs)
}

export function sameTrackAudioAction(
  previous: { trackId: string | null; playing: boolean; playheadMs: number },
  next: { trackId: string | null; playing: boolean; playheadMs: number },
): 'load' | 'transport' | 'none' {
  if (previous.trackId !== next.trackId) {
    return 'load'
  }
  if (previous.playing !== next.playing || Math.abs(previous.playheadMs - next.playheadMs) > 1250) {
    return 'transport'
  }
  return 'none'
}

export function formatMs(ms: number): string {
  let sec = Math.max(0, Math.floor(ms / 1000))
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`
}

function glyphFor(label: string, repeat: PlayerRepeat): IconName | null {
  switch (label) {
    case 'Play':
      return 'play'
    case 'Pause':
      return 'pause'
    case 'Previous':
      return 'prev'
    case 'Next':
      return 'next'
    case 'Shuffle':
      return 'shuffle'
    case 'Repeat':
      return repeat === 'one' ? 'repeat-one' : 'repeat'
    case 'Move up':
      return 'up'
    case 'Move down':
      return 'down'
    case 'Remove':
      return 'remove'
    default:
      return null
  }
}

let clockFormat: Intl.DateTimeFormat | null = null

function clock(epochMs: number): string {
  clockFormat ??= new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' })
  return clockFormat.format(epochMs)
}

const ease = 'cubic-bezier(0.22, 1, 0.36, 1)'

let hiddenAudio = css({
  position: 'absolute',
  width: '1px',
  height: '1px',
  overflow: 'hidden',
  clip: 'rect(0, 0, 0, 0)',
})

let srOnly = css({
  position: 'absolute',
  width: '1px',
  height: '1px',
  overflow: 'hidden',
  clip: 'rect(0, 0, 0, 0)',
  whiteSpace: 'nowrap',
})

let inlineForm = css({
  display: 'contents',
})

// Surface tones feed the shared transport, seek and listing styles.
let paperTone = css({
  '--tx-fg': color.ink,
  '--tx-bg': color.paper,
  '--tx-mute': color.mute,
  '--tx-rest': color.rule,
} as Record<string, string>)

let nightTone = css({
  '--tx-fg': color.paper,
  '--tx-bg': color.night,
  '--tx-mute': color.nightMute,
  '--tx-rest': color.nightLine,
} as Record<string, string>)

let fullRoot = css({
  color: color.ink,
})

let dockRoot = css({
  color: color.paper,
})

let fullMain = css({
  background: color.night,
})

let idleFull = css({
  display: 'grid',
  gridTemplateRows: 'auto minmax(0, 1fr)',
  alignItems: 'center',
  minHeight: 'calc(100dvh - 3.75rem)',
  padding: '1rem 1.25rem 3rem',
  background: color.night,
  color: color.paper,
  [wide]: {
    minHeight: '100dvh',
    padding: '1.75rem 4rem 4rem',
  },
})

let idleInner = css({
  display: 'grid',
  justifyItems: 'start',
  gap: '1.25rem',
  maxWidth: '34rem',
})

let idleTitle = css({
  margin: 0,
  fontStretch: font.condensed,
  fontWeight: 800,
  fontSize: 'clamp(3.25rem, 8vw, 6.5rem)',
  lineHeight: 0.88,
  textTransform: 'uppercase',
})

let idleCopy = css({
  margin: 0,
  color: color.nightMute,
  fontSize: '1.0625rem',
  lineHeight: 1.5,
  maxWidth: '28rem',
})

let idleLink = css({
  display: 'inline-flex',
  alignItems: 'center',
  gap: '0.5rem',
  minHeight: '2.75rem',
  padding: '0 1.1rem',
  border: `1.5px solid ${color.paper}`,
  color: color.paper,
  textDecoration: 'none',
  fontStretch: font.semi,
  fontWeight: 750,
  fontSize: '0.875rem',
  letterSpacing: '0.06em',
  textTransform: 'uppercase',
  '& svg': {
    width: '1.1rem',
    height: '1.1rem',
  },
  '&:hover': {
    background: color.paper,
    color: color.ink,
  },
})

let onAir = css({
  display: 'inline-flex',
  alignItems: 'center',
  gap: '0.45rem',
  minHeight: '1.75rem',
  padding: '0 0.6rem',
  border: `1.5px solid ${color.nightLine}`,
  color: color.nightMute,
  fontStretch: font.semi,
  fontWeight: 800,
  fontSize: '0.75rem',
  letterSpacing: '0.12em',
  textTransform: 'uppercase',
  whiteSpace: 'nowrap',
})

let onAirLive = css({
  borderColor: color.redInk,
  background: color.redInk,
  color: color.paper,
  '&::before': {
    content: '""',
    width: '0.45rem',
    height: '0.45rem',
    borderRadius: '50%',
    background: color.paper,
  },
})

let classic = css({
  display: 'none',
  [wide]: {
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 1.08fr) minmax(24rem, 1fr)',
    minHeight: '100dvh',
  },
})

let deck = css({
  position: 'sticky',
  top: 0,
  display: 'grid',
  gridTemplateRows: 'auto minmax(0, 1fr)',
  gap: '1.5rem',
  height: '100dvh',
  padding: '1.75rem 2.5rem 2.5rem',
  background: color.night,
  color: color.paper,
})

let deckBar = css({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: '1rem',
  minWidth: 0,
})

let deckNote = css({
  minWidth: 0,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  color: color.nightMute,
  fontStretch: font.semi,
  fontWeight: 700,
  fontSize: '0.75rem',
  letterSpacing: '0.1em',
  textTransform: 'uppercase',
})

let deckTable = css({
  display: 'grid',
  placeItems: 'center',
  minHeight: 0,
})

let programme = css({
  display: 'grid',
  alignContent: 'start',
  gap: '2.5rem',
  padding: '2.25rem 2.5rem 4rem',
  background: color.paper,
  color: color.ink,
})

let nowBlock = css({
  display: 'grid',
  gap: '1.25rem',
})

let nowTitle = css({
  margin: 0,
  fontStretch: font.condensed,
  fontWeight: 800,
  fontSize: 'clamp(3rem, 3.4vw + 1.2rem, 5.75rem)',
  lineHeight: 0.88,
  letterSpacing: '-0.005em',
  textTransform: 'uppercase',
  textWrap: 'balance',
  overflowWrap: 'anywhere',
})

let nowByline = css({
  margin: '-0.4rem 0 0',
  color: color.mute,
  fontSize: '1.125rem',
  lineHeight: 1.35,
  '& strong': {
    color: color.ink,
    fontWeight: 650,
  },
})

let plinth = css({
  position: 'relative',
  aspectRatio: '1',
  background: color.night2,
  border: `1px solid ${color.nightLine}`,
  perspective: '1400px',
})

let classicPlinth = css({
  width: 'min(100%, calc(100dvh - 8.5rem), 42rem)',
})

let phonePlinth = css({
  width: 'min(100%, 50dvh)',
  justifySelf: 'center',
})

let vinylFlip = css({
  position: 'absolute',
  left: '6%',
  top: '10%',
  width: '80%',
  aspectRatio: '1',
  transition: `transform 420ms cubic-bezier(0.65, 0, 0.35, 1)`,
})

let vinylEdge = css({
  transform: 'rotateY(90deg)',
})

let vinyl = css({
  position: 'absolute',
  inset: 0,
  display: 'grid',
  placeItems: 'center',
  borderRadius: '50%',
  background: `repeating-radial-gradient(circle at 50% 50%, #0D0F16 0 1.5px, #191C27 1.5px 3px)`,
  boxShadow: `0 0 0 1px ${color.nightLine}`,
  containerType: 'inline-size',
})

let vinylSpinning = css({
  animation: 'spinbox-vinyl 1.8s linear infinite',
})

// Fixed sheen: the light stays put while the record turns beneath it.
let vinylSheen = css({
  position: 'absolute',
  inset: 0,
  borderRadius: '50%',
  background:
    'conic-gradient(from 20deg, transparent 0deg, rgba(242, 241, 236, 0.07) 30deg, transparent 70deg, transparent 180deg, rgba(242, 241, 236, 0.05) 215deg, transparent 250deg)',
  pointerEvents: 'none',
})

let labelBase = css({
  position: 'relative',
  display: 'grid',
  placeItems: 'center',
  overflow: 'hidden',
  borderRadius: '50%',
  textAlign: 'center',
})

let labelLarge = css({
  width: '34%',
  aspectRatio: '1',
})

let labelSmall = css({
  width: '42%',
  aspectRatio: '1',
})

let labelArt = css({
  position: 'absolute',
  inset: 0,
  width: '100%',
  height: '100%',
  objectFit: 'cover',
})

let labelText = css({
  display: 'grid',
  gap: '5cqi',
  maxWidth: '76%',
})

let labelTitle = css({
  display: '-webkit-box',
  WebkitLineClamp: '2',
  WebkitBoxOrient: 'vertical',
  overflow: 'hidden',
  fontStretch: font.condensed,
  fontWeight: 800,
  fontSize: '3.4cqi',
  lineHeight: 0.95,
  textTransform: 'uppercase',
  overflowWrap: 'anywhere',
})

let labelArtist = css({
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  fontStretch: font.semi,
  fontWeight: 600,
  fontSize: '2.1cqi',
  letterSpacing: '0.06em',
  textTransform: 'uppercase',
})

let spindle = css({
  position: 'absolute',
  left: '50%',
  top: '50%',
  width: '9%',
  aspectRatio: '1',
  transform: 'translate(-50%, -50%)',
  borderRadius: '50%',
  background: color.paper,
  boxShadow: `0 0 0 1.5px ${color.night}`,
})

let tonearmLayer = css({
  position: 'absolute',
  inset: 0,
  pointerEvents: 'none',
})

let tonearmSvg = css({
  display: 'block',
  width: '100%',
  height: '100%',
  overflow: 'visible',
})

let arm = css({
  transformBox: 'view-box',
  transformOrigin: '88px 14px',
  transform: 'rotate(-5deg)',
  transition: `transform 700ms ${ease}`,
})

let armPlaying = css({
  transform: 'rotate(24deg)',
})

let plinthLamp = css({
  position: 'absolute',
  left: '4%',
  bottom: '4%',
  width: '0.6rem',
  height: '0.6rem',
  background: color.nightLine,
})

let plinthLampOn = css({
  background: color.red,
})

let plinthSpeed = css({
  position: 'absolute',
  right: '4%',
  bottom: '3.2%',
  color: color.nightMute,
  fontStretch: font.semi,
  fontWeight: 700,
  fontSize: '0.75rem',
  letterSpacing: '0.1em',
  fontVariantNumeric: 'tabular-nums',
})

let phone = css({
  display: 'grid',
  alignContent: 'start',
  gap: '1.25rem',
  minHeight: 'calc(100dvh - 3.75rem)',
  padding: '1rem 1.15rem 1.75rem',
  background: color.night,
  color: color.paper,
  [wide]: {
    display: 'none',
  },
})

let phoneTitle = css({
  margin: 0,
  fontStretch: font.condensed,
  fontWeight: 800,
  fontSize: 'clamp(2.25rem, 10vw, 3.25rem)',
  lineHeight: 0.9,
  textTransform: 'uppercase',
  textWrap: 'balance',
  overflowWrap: 'anywhere',
})

let phoneByline = css({
  margin: '0.45rem 0 0',
  color: color.nightMute,
  fontSize: '1rem',
})

let phoneListing = css({
  display: 'grid',
  margin: '0.5rem -1.15rem -1.75rem',
  padding: '1.25rem 1.15rem 1.75rem',
  background: color.paper,
  color: color.ink,
})

let transport = css({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: '0.5rem',
  maxWidth: '24rem',
  color: 'var(--tx-fg)',
})

let toneButton = css({
  color: 'var(--tx-fg)',
  '&:hover:not(:disabled)': {
    background: 'color-mix(in srgb, var(--tx-fg) 12%, transparent)',
  },
  '&[aria-pressed=false]': {
    color: 'var(--tx-mute)',
  },
  '&[aria-pressed=true]': {
    boxShadow: 'inset 0 -3px 0 var(--tx-fg)',
  },
})

let playButton = css({
  width: '3.75rem',
  height: '3.75rem',
  borderRadius: '50%',
  background: 'var(--tx-fg)',
  color: 'var(--tx-bg)',
  '& svg': {
    width: '1.5rem',
    height: '1.5rem',
  },
  '&:hover:not(:disabled)': {
    background: 'var(--tx-fg)',
    transform: 'scale(1.04)',
  },
})

let smallButton = css({
  width: '2.25rem',
  height: '2.25rem',
  '& svg': {
    width: '1.05rem',
    height: '1.05rem',
  },
})

let seekWrap = css({
  display: 'grid',
  gap: '0.15rem',
})

const seekThumb = {
  appearance: 'none',
  width: '14px',
  height: '14px',
  border: 0,
  borderRadius: 0,
  background: 'var(--tx-fg)',
}

let seek = css({
  appearance: 'none',
  width: '100%',
  height: '1.75rem',
  margin: 0,
  background: 'transparent',
  color: 'var(--tx-fg)',
  cursor: 'pointer',
  '&::-webkit-slider-runnable-track': {
    height: '4px',
    background: 'linear-gradient(to right, var(--tx-fg) var(--pct), var(--tx-rest) var(--pct))',
  },
  '&::-webkit-slider-thumb': {
    ...seekThumb,
    marginTop: '-5px',
  },
  '&::-moz-range-track': {
    height: '4px',
    background: 'var(--tx-rest)',
  },
  '&::-moz-range-progress': {
    height: '4px',
    background: 'var(--tx-fg)',
  },
  '&::-moz-range-thumb': seekThumb,
  '&:focus-visible': {
    outlineOffset: '4px',
  },
})

let seekTimes = css({
  display: 'grid',
  gridTemplateColumns: '1fr auto 1fr',
  gap: '1rem',
  color: 'var(--tx-mute)',
  fontStretch: font.semi,
  fontWeight: 700,
  fontSize: '0.8125rem',
  fontVariantNumeric: 'tabular-nums',
  '& > :last-child': {
    textAlign: 'right',
  },
})

let seekClock = css({
  color: 'var(--tx-fg)',
})

let listingBlock = css({
  display: 'grid',
})

let listingHead = css({
  display: 'flex',
  alignItems: 'baseline',
  justifyContent: 'space-between',
  gap: '1rem',
  margin: 0,
  padding: '0.6rem 0 0.7rem',
  borderTop: `3px solid ${color.ink}`,
  fontStretch: font.condensed,
  fontWeight: 800,
  fontSize: '1.5rem',
  lineHeight: 1,
  textTransform: 'uppercase',
})

let listingCount = css({
  color: color.mute,
  fontStretch: font.semi,
  fontWeight: 700,
  fontSize: '0.75rem',
  letterSpacing: '0.08em',
  whiteSpace: 'nowrap',
})

let listingRows = css({
  margin: 0,
  padding: 0,
  listStyle: 'none',
  borderTop: `1px solid ${color.rule}`,
})

let listingRow = css({
  display: 'grid',
  gridTemplateColumns: '4.25rem minmax(0, 1fr) auto auto',
  alignItems: 'center',
  gap: '0 0.75rem',
  minHeight: '3.25rem',
  padding: '0.3rem 0.25rem 0.3rem 0.5rem',
  borderBottom: `1px solid ${color.rule}`,
})

let listingRowCurrent = css({
  background: color.yellow,
  borderBottomColor: color.ink,
})

let rowClock = css({
  fontStretch: font.semi,
  fontWeight: 750,
  fontSize: '0.875rem',
  fontVariantNumeric: 'tabular-nums',
  whiteSpace: 'nowrap',
})

let rowMain = css({
  display: 'grid',
  minWidth: 0,
})

let rowTitleText = css({
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  fontWeight: 600,
})

let rowArtistText = css({
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  color: color.mute,
  fontSize: '0.8125rem',
})

let rowDuration = css({
  color: color.mute,
  fontSize: '0.875rem',
  fontVariantNumeric: 'tabular-nums',
})

let rowActions = css({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'end',
  minWidth: '6.75rem',
})

let rowActionGap = css({
  width: '2.25rem',
  height: '2.25rem',
})

let rowNowTag = css({
  paddingRight: '0.5rem',
  fontStretch: font.semi,
  fontWeight: 800,
  fontSize: '0.6875rem',
  letterSpacing: '0.1em',
  textTransform: 'uppercase',
})

let listingEmpty = css({
  margin: 0,
  padding: '1rem 0.5rem',
  borderBottom: `1px solid ${color.rule}`,
  color: color.mute,
  fontSize: '0.9375rem',
  lineHeight: 1.45,
})

let listingFoot = css({
  display: 'flex',
  flexWrap: 'wrap',
  gap: '0.5rem',
  paddingTop: '1rem',
})

let queueBadge = css({
  display: 'inline-grid',
  placeItems: 'center',
  minWidth: '1.25rem',
  height: '1.25rem',
  padding: '0 0.3rem',
  marginLeft: 'auto',
  background: color.yellow,
  color: color.ink,
  fontStretch: font.semi,
  fontWeight: 800,
  fontSize: '0.6875rem',
  lineHeight: 1,
  fontVariantNumeric: 'tabular-nums',
})

let dock = css({
  position: 'relative',
  display: 'grid',
  gridTemplateColumns: 'minmax(0, 1fr) auto',
  alignItems: 'center',
  gap: '0.5rem',
  padding: '0.45rem 0.4rem 0.45rem 0.75rem',
  background: color.night2,
  borderTop: `1px solid ${color.nightLine}`,
  color: color.paper,
  [wide]: {
    gridTemplateColumns: 'minmax(0, 1fr)',
    gap: '0.6rem',
    padding: '1rem 0.85rem 1rem 1.25rem',
  },
})

let dockMeta = css({
  display: 'grid',
  gridTemplateColumns: '2.75rem minmax(0, 1fr)',
  alignItems: 'center',
  gap: '0.75rem',
  minWidth: 0,
  color: 'inherit',
  textDecoration: 'none',
  '&:hover [data-dock-title]': {
    textDecoration: 'underline',
  },
})

let miniDisc = css({
  display: 'grid',
  placeItems: 'center',
  width: '2.75rem',
  height: '2.75rem',
  borderRadius: '50%',
  background: `repeating-radial-gradient(circle at 50% 50%, #0D0F16 0 1px, #191C27 1px 2px)`,
  boxShadow: `0 0 0 1px ${color.nightLine}`,
})

let dockText = css({
  display: 'grid',
  minWidth: 0,
  lineHeight: 1.25,
})

let dockState = css({
  display: 'flex',
  alignItems: 'center',
  gap: '0.35rem',
  color: color.nightMute,
  fontStretch: font.semi,
  fontWeight: 800,
  fontSize: '0.6875rem',
  letterSpacing: '0.1em',
  textTransform: 'uppercase',
})

let dockStateLive = css({
  color: color.paper,
  '&::before': {
    content: '""',
    width: '0.45rem',
    height: '0.45rem',
    borderRadius: '50%',
    background: color.red,
  },
})

let dockTitle = css({
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  fontWeight: 650,
  fontSize: '0.9375rem',
})

let dockArtist = css({
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  color: color.nightMute,
  fontSize: '0.8125rem',
})

let dockTransport = css({
  display: 'flex',
  alignItems: 'center',
  gap: '0.1rem',
  color: color.paper,
  '& form:first-child button': {
    display: 'none',
  },
  [wide]: {
    justifyContent: 'space-between',
    '& form:first-child button': {
      display: 'inline-flex',
    },
  },
  '& [aria-label=Play], & [aria-label=Pause]': {
    width: '2.75rem',
    height: '2.75rem',
    '& svg': {
      width: '1.2rem',
      height: '1.2rem',
    },
  },
})

let dockSheet = css({
  position: 'static',
  '&[open] > summary': {
    background: color.paper,
    color: color.ink,
  },
})

let dockSheetSummary = css({
  position: 'relative',
  listStyle: 'none',
  '&::-webkit-details-marker': {
    display: 'none',
  },
  '& span:last-child': {
    position: 'absolute',
    top: '0.3rem',
    right: '0.2rem',
    fontSize: '0.625rem',
  },
})

let dockSheetPanel = css({
  position: 'absolute',
  left: 0,
  right: 0,
  bottom: '100%',
  maxHeight: '65dvh',
  overflowY: 'auto',
  padding: '0.75rem 1rem 1rem',
  background: color.paper,
  color: color.ink,
  borderTop: `1px solid ${color.rule}`,
  boxShadow: '0 -16px 32px -12px rgba(17, 19, 24, 0.35)',
  [wide]: {
    left: '100%',
    right: 'auto',
    bottom: 0,
    width: '28rem',
    maxHeight: 'min(40rem, 90dvh)',
    padding: '1rem 1.25rem 1.25rem',
    border: `1.5px solid ${color.ink}`,
    boxShadow: '16px 0 40px -16px rgba(17, 19, 24, 0.35)',
  },
})

let errorBox = css({
  display: 'flex',
  gap: '0.65rem',
  alignItems: 'start',
  padding: '0.8rem 1rem',
  border: `1.5px solid ${color.redInk}`,
  background: color.sheet,
  color: color.ink,
  lineHeight: 1.4,
  '& svg': {
    flex: 'none',
    width: '1.25rem',
    height: '1.25rem',
    marginTop: '0.05rem',
    color: color.redInk,
  },
})

let errorText = css({
  display: 'grid',
  gap: '0.1rem',
  margin: 0,
  '& strong': {
    fontWeight: 750,
  },
})
