import { clientEntry, css, on, ref, type Handle, type RemixNode } from 'remix/ui'

import { routes } from '../routes.ts'

export type PlayerTrack = {
  id: string
  title: string
  artist: string
  album: string
  durationMs: number | null
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
const LABEL_COLORS = ['#d4a574', '#7a9eb8', '#c47a8a', '#8a9a6a', '#b8956a']

export const PlayerIsland = clientEntry(
  import.meta.url,
  function PlayerIsland(handle: Handle<PlayerProps>) {
    let view = snapshotFromProps(handle.props)
    let error: string | null = null
    let swapping = false
    let retried = false
    let audio: HTMLAudioElement | null = null
    let persistAt = 0

    handle.queueTask(() => {
      syncAudio(true)
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
          <main mix={idleFull}>
            <h1 mix={idleTitle}>Now playing</h1>
            <p mix={idleCopy}>Nothing playing</p>
            <a mix={idleLink} href={handle.props.libraryHref}>
              Back to Library
            </a>
          </main>
        )
      }

      let upNext = view.queue[0] ?? null
      return (
        <main mix={fullMain}>
          {errorBanner()}
          <section mix={classic} aria-label="Classic deck">
            <div mix={classicShell}>
              <div
                mix={view.playing && !swapping ? [plinth, plinthPlaying] : plinth}
                data-plinth
              >
                <div mix={tonearm} data-tonearm aria-hidden="true"></div>
                {vinylDisc(track)}
              </div>
              <div mix={classicMeta}>
                <p mix={albumLine}>{track.album}</p>
                <h1 mix={titleLine}>{track.title}</h1>
                <p mix={artistLine}>{track.artist}</p>
                {seekBar(track)}
                {fullTransport()}
                <p mix={upHint}>Up next</p>
                <p mix={upLine}>{upNext ? `${upNext.title} · ${upNext.artist}` : 'End of Play queue'}</p>
              </div>
            </div>
          </section>

          <section mix={phone} aria-label="Phone stack">
            <div mix={phoneShell}>
              <div mix={phoneTop}>
                <span>Now playing</span>
                <span mix={liveDot}>{view.playing ? 'Playing' : 'Paused'}</span>
              </div>
              <div mix={phoneVinyl}>{vinylDisc(track)}</div>
              <div>
                <h1 mix={phoneTitle}>{track.title}</h1>
                <p mix={artistLine}>{track.artist}</p>
                <p mix={albumLine}>{track.album}</p>
              </div>
              {seekBar(track)}
              {fullTransport()}
              <div mix={upStrip}>
                <h2 mix={upHint}>Up next</h2>
                <div mix={upRow}>
                  <span>{upNext ? `${upNext.title} · ${upNext.artist}` : 'End of Play queue'}</span>
                  <span>{upNext ? formatMs(upNext.durationMs ?? 0) : ''}</span>
                </div>
              </div>
            </div>
          </section>
          {queueSheet(track)}
        </main>
      )
    }

    function dockSurface(): RemixNode {
      let track = view.currentTrack
      if (track == null) {
        return null
      }
      return (
        <aside mix={dock} aria-label="Mini-dock">
          <div mix={dockRow}>
            <a mix={dockMeta} href={handle.props.nowPlayingHref}>
              <span mix={dockEyebrow}>{view.playing ? 'Now playing' : 'Paused'}</span>
              <strong>
                Now playing · {track.title}
                {view.playing ? '' : ' (paused)'}
              </strong>
              <span mix={dockArtist}>{track.artist}</span>
            </a>
            <div mix={dockTransport}>
              {sessionButton('skip-previous', 'Previous')}
              {sessionButton(
                'update',
                view.playing ? 'Pause' : 'Play',
                view.playing ? { playing: '0' } : { playing: '1' },
              )}
              {sessionButton('skip-next', 'Next')}
            </div>
          </div>
          {errorBanner()}
          {queueSheet(track)}
        </aside>
      )
    }

    function queueSheet(track: PlayerTrack): RemixNode {
      return (
        <details mix={sheet}>
          <summary mix={sheetSummary}>Play queue</summary>
          <section mix={sheetBody} aria-label="Play queue">
            {errorBanner()}
            <h2 mix={sheetHeading}>Current</h2>
            <p mix={sheetCurrent}>{track.title}</p>
            <h2 mix={sheetHeading}>Upcoming</h2>
            {view.queue.length === 0 ? (
              <p mix={sheetEmpty}>No upcoming Tracks</p>
            ) : (
              <ol mix={sheetList}>
                {view.queue.map((item, index) => (
                  <li mix={sheetItem} key={`${item.id}-${index}`}>
                    <span>
                      {item.title} · {item.artist}
                    </span>
                    <span mix={sheetActions}>
                      {index > 0
                        ? sessionButton('reorder-queue', 'Move up', {
                            from: String(index),
                            to: String(index - 1),
                          })
                        : null}
                      {index < view.queue.length - 1
                        ? sessionButton('reorder-queue', 'Move down', {
                            from: String(index),
                            to: String(index + 1),
                          })
                        : null}
                      {sessionButton('remove-from-queue', 'Remove', { position: String(index) })}
                    </span>
                  </li>
                ))}
              </ol>
            )}
            <div mix={sheetActions}>
              {sessionButton('clear-upcoming', 'Clear upcoming')}
              {sessionButton('clear-all', 'Clear all')}
            </div>
          </section>
        </details>
      )
    }

    function vinylDisc(track: PlayerTrack): RemixNode {
      return (
        <div mix={vinylStage}>
          <div
            mix={[
              vinyl,
              view.playing && !swapping ? vinylSpinning : null,
              swapping ? vinylEdge : null,
            ]}
            data-vinyl
          >
            <div mix={platter}>
              <div
                mix={[
                  label,
                  css({
                    background: `radial-gradient(circle at 35% 30%, rgba(255,255,255,0.25), transparent 45%), ${labelColor(track.id)}`,
                  }),
                ]}
              >
                <div mix={labelInner}>
                  <span>{track.title}</span>
                  <span mix={labelArtist}>{track.artist}</span>
                </div>
              </div>
              <div mix={spindle}></div>
            </div>
          </div>
        </div>
      )
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

    function seekBar(track: PlayerTrack): RemixNode {
      let max = Math.max(track.durationMs ?? 0, view.playheadMs, 1)
      return (
        <div mix={progressWrap}>
          <input
            mix={[
              progress,
              on('input', (event) => {
                let value = Number((event.target as HTMLInputElement).value)
                view.playheadMs = value
                if (audio) {
                  audio.currentTime = value / 1000
                }
                void handle.update()
              }),
              on('change', (event) => {
                let value = Number((event.target as HTMLInputElement).value)
                void postIntent({ intent: 'update', playheadMs: String(value) })
              }),
            ]}
            type="range"
            min="0"
            max={String(max)}
            value={String(Math.min(view.playheadMs, max))}
            aria-label="Seek"
          />
          <div mix={times}>
            <span>{formatMs(view.playheadMs)}</span>
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
      return (
        <form method="POST" action={handle.props.sessionHref}>
          <input type="hidden" name="intent" value={intent} />
          <input type="hidden" name="next" value={returnTo()} />
          {Object.entries(fields).map(([name, value]) => (
            <input type="hidden" name={name} value={value} key={name} />
          ))}
          <button
            mix={label === 'Play' || label === 'Pause' ? playBtn : iconBtn}
            type="submit"
            aria-label={label}
            aria-pressed={pressed}
            title={label === 'Repeat' ? `Repeat · ${view.repeat}` : label}
          >
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
        <p mix={errorBox} role="alert">
          {error}
        </p>
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

function labelColor(id: string): string {
  let hash = 0
  for (let index = 0; index < id.length; index++) {
    hash = (hash + id.charCodeAt(index) * (index + 1)) % LABEL_COLORS.length
  }
  return LABEL_COLORS[hash] ?? LABEL_COLORS[0]!
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

let hiddenAudio = css({
  position: 'absolute',
  width: '1px',
  height: '1px',
  overflow: 'hidden',
  clip: 'rect(0, 0, 0, 0)',
})

let fullRoot = css({
  color: '#f5f0e8',
})

let dockRoot = css({
  color: '#f3ead8',
})

let fullMain = css({
  background: '#0c0a09',
})

let idleFull = css({
  margin: 0,
  padding: '3rem 1.25rem',
  color: '#1c120c',
})

let idleTitle = css({
  margin: '0 0 0.5rem',
  fontFamily: 'Fraunces, Georgia, serif',
  fontSize: '2rem',
})

let idleCopy = css({
  margin: '0 0 1rem',
  color: '#4a4038',
})

let idleLink = css({
  color: '#1c120c',
})

let classic = css({
  display: 'none',
  minHeight: 'calc(100dvh - 6rem)',
  padding: '3rem 1.5rem 4rem',
  background:
    'radial-gradient(ellipse 80% 60% at 30% 45%, #2a221c 0%, transparent 55%), linear-gradient(165deg, #1a1512 0%, #0c0a09 50%, #120e0c 100%)',
  '@media (min-width: 56rem)': {
    display: 'grid',
    placeItems: 'center',
  },
})

let classicShell = css({
  width: 'min(920px, 100%)',
  display: 'grid',
  gridTemplateColumns: '1fr 1fr',
  gap: '2.5rem',
  alignItems: 'center',
})

let plinth = css({
  position: 'relative',
  background: 'linear-gradient(145deg, #2c241e, #1a1512)',
  borderRadius: '18px',
  padding: '2rem',
  boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.06), 0 20px 60px rgba(0,0,0,0.4)',
})

let plinthPlaying = css({
  '& [data-tonearm]': {
    transform: 'rotate(18deg)',
  },
})

let tonearm = css({
  position: 'absolute',
  right: '12%',
  top: '18%',
  width: '4px',
  height: '38%',
  background: 'linear-gradient(#c8c4bc, #8a8680)',
  borderRadius: '2px',
  transformOrigin: 'top center',
  transform: 'rotate(-8deg)',
  boxShadow: '0 2px 6px rgba(0,0,0,0.4)',
  opacity: 0.85,
  transition: 'transform 0.5s cubic-bezier(0.22, 1, 0.36, 1)',
  '&::before': {
    content: '""',
    position: 'absolute',
    top: '-10px',
    left: '50%',
    transform: 'translateX(-50%)',
    width: '18px',
    height: '18px',
    borderRadius: '50%',
    background: '#b0aaa2',
  },
  '&::after': {
    content: '""',
    position: 'absolute',
    bottom: '-6px',
    left: '50%',
    transform: 'translateX(-50%)',
    width: '10px',
    height: '14px',
    background: '#6a6660',
    borderRadius: '2px',
  },
})

let classicMeta = css({})

let phone = css({
  display: 'block',
  padding: '1.25rem 1rem 2rem',
  background: '#12100e',
  '@media (min-width: 56rem)': {
    display: 'none',
  },
})

let phoneShell = css({
  maxWidth: '390px',
  margin: '0 auto',
  background: 'linear-gradient(180deg, #1c1814 0%, #0e0c0b 100%)',
  borderRadius: '28px',
  border: '1px solid rgba(255,255,255,0.06)',
  padding: '1.25rem',
  display: 'flex',
  flexDirection: 'column',
  gap: '1.1rem',
})

let phoneTop = css({
  display: 'flex',
  justifyContent: 'space-between',
  fontSize: '12px',
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  color: '#8a8074',
})

let liveDot = css({
  color: '#e8a06a',
})

let phoneVinyl = css({
  display: 'grid',
  placeItems: 'center',
  minHeight: '220px',
})

let phoneTitle = css({
  margin: 0,
  fontSize: '1.35rem',
  fontWeight: 600,
})

let vinylStage = css({
  perspective: '1200px',
  display: 'grid',
  placeItems: 'center',
})

let vinyl = css({
  position: 'relative',
  width: 'min(52vmin, 340px)',
  aspectRatio: '1',
  transformStyle: 'preserve-3d',
  transition: 'transform 0.85s cubic-bezier(0.65, 0, 0.35, 1)',
})

let vinylSpinning = css({
  animation: 'spinbox-vinyl 3.2s linear infinite',
})

let vinylEdge = css({
  transform: 'rotateY(90deg)',
})

let platter = css({
  position: 'absolute',
  inset: 0,
  borderRadius: '50%',
  background:
    'radial-gradient(circle at 50% 50%, transparent 14%, rgba(255,255,255,0.04) 14.5%, transparent 15%), repeating-radial-gradient(circle at 50% 50%, #1a1614 0, #1a1614 1.5px, #221e1b 1.5px, #221e1b 3px)',
  boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.06), inset 0 0 40px rgba(0,0,0,0.5), 0 24px 80px rgba(0,0,0,0.45)',
})

let label = css({
  position: 'absolute',
  inset: '32%',
  borderRadius: '50%',
  background:
    'radial-gradient(circle at 35% 30%, rgba(255,255,255,0.25), transparent 45%), var(--label-color, #d4a574)',
  display: 'grid',
  placeItems: 'center',
  textAlign: 'center',
  padding: '8%',
})

let labelInner = css({
  fontSize: 'clamp(9px, 2.1vmin, 12px)',
  lineHeight: 1.25,
  color: 'rgba(0,0,0,0.78)',
  fontWeight: 600,
})

let labelArtist = css({
  display: 'block',
  fontWeight: 500,
  opacity: 0.7,
  marginTop: '0.2em',
})

let spindle = css({
  position: 'absolute',
  left: '50%',
  top: '50%',
  width: '8%',
  height: '8%',
  transform: 'translate(-50%, -50%)',
  borderRadius: '50%',
  background: 'radial-gradient(circle at 40% 35%, #ddd 0%, #666 55%, #222 100%)',
})

let transport = css({
  display: 'flex',
  alignItems: 'center',
  flexWrap: 'wrap',
  gap: '0.55rem',
  marginTop: '1.25rem',
})

let iconBtn = css({
  appearance: 'none',
  border: 0,
  background: 'rgba(255,255,255,0.06)',
  color: '#f5f0e8',
  minWidth: '44px',
  minHeight: '44px',
  padding: '0.45rem 0.7rem',
  borderRadius: '999px',
  font: 'inherit',
  fontSize: '0.78rem',
  fontWeight: 600,
  cursor: 'pointer',
})

let playBtn = css({
  appearance: 'none',
  border: 0,
  background: '#f5f0e8',
  color: '#0c0a09',
  minWidth: '56px',
  minHeight: '56px',
  padding: '0.45rem 0.85rem',
  borderRadius: '999px',
  font: 'inherit',
  fontWeight: 600,
  cursor: 'pointer',
})

let progressWrap = css({
  width: '100%',
  display: 'grid',
  gap: '0.35rem',
  marginTop: '1.25rem',
})

let progress = css({
  appearance: 'none',
  width: '100%',
  height: '4px',
  borderRadius: '2px',
  background: 'rgba(255,255,255,0.12)',
})

let times = css({
  display: 'flex',
  justifyContent: 'space-between',
  fontSize: '11px',
  color: '#8a8074',
  fontVariantNumeric: 'tabular-nums',
})

let titleLine = css({
  margin: '0.15rem 0 0',
  fontFamily: 'Georgia, "Times New Roman", serif',
  fontSize: 'clamp(1.25rem, 3.5vw, 1.75rem)',
  fontWeight: 500,
})

let artistLine = css({
  margin: '0.25rem 0 0',
  color: '#8a8074',
})

let albumLine = css({
  margin: 0,
  color: '#8a8074',
  opacity: 0.8,
  fontSize: '0.8rem',
})

let upHint = css({
  margin: '1.5rem 0 0',
  fontSize: '12px',
  color: '#8a8074',
  letterSpacing: '0.06em',
  textTransform: 'uppercase',
})

let upLine = css({
  margin: '0.35rem 0 0',
  opacity: 0.8,
})

let upStrip = css({
  marginTop: 'auto',
  background: 'rgba(255,255,255,0.04)',
  borderRadius: '14px',
  padding: '0.75rem 0.9rem',
})

let upRow = css({
  display: 'flex',
  justifyContent: 'space-between',
  gap: '0.75rem',
  fontSize: '0.9rem',
})

let errorBox = css({
  margin: '0 0 0.75rem',
  color: '#e8a06a',
  fontWeight: 600,
})

let dock = css({
  display: 'grid',
  gap: '0.55rem',
  margin: '0 0.75rem',
  padding: '0.85rem 1rem',
  background: '#1c120c',
  color: '#f3ead8',
  borderRadius: '3px 3px 0 0',
  boxShadow: '0 -10px 28px rgba(28, 18, 12, 0.22)',
  '@media (min-width: 56rem)': {
    margin: '0 1.75rem 0',
  },
})

let dockRow = css({
  display: 'flex',
  flexWrap: 'wrap',
  alignItems: 'center',
  gap: '0.75rem 1rem',
})

let dockMeta = css({
  display: 'grid',
  gap: '0.1rem',
  color: 'inherit',
  textDecoration: 'none',
  flex: '1 1 12rem',
})

let dockEyebrow = css({
  fontSize: '0.68rem',
  letterSpacing: '0.16em',
  textTransform: 'uppercase',
  color: '#c4783a',
})

let dockArtist = css({
  color: '#d8cbb8',
  fontSize: '0.92rem',
})

let dockTransport = css({
  display: 'flex',
  gap: '0.4rem',
})

let sheet = css({
  borderTop: '1px solid rgba(243, 234, 216, 0.12)',
  paddingTop: '0.45rem',
})

let sheetSummary = css({
  cursor: 'pointer',
  fontWeight: 600,
  letterSpacing: '0.06em',
  textTransform: 'uppercase',
  fontSize: '0.75rem',
  color: '#c4783a',
})

let sheetBody = css({
  display: 'grid',
  gap: '0.45rem',
  paddingTop: '0.65rem',
})

let sheetHeading = css({
  margin: 0,
  fontSize: '0.72rem',
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  color: '#8a8074',
})

let sheetCurrent = css({
  margin: 0,
  fontWeight: 600,
})

let sheetEmpty = css({
  margin: 0,
  color: '#8a8074',
})

let sheetList = css({
  margin: 0,
  padding: 0,
  listStyle: 'none',
  display: 'grid',
  gap: '0.45rem',
})

let sheetItem = css({
  display: 'flex',
  flexWrap: 'wrap',
  justifyContent: 'space-between',
  gap: '0.35rem 0.75rem',
  alignItems: 'center',
})

let sheetActions = css({
  display: 'flex',
  flexWrap: 'wrap',
  gap: '0.35rem',
})
