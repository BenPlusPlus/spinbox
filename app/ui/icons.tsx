import type { RemixNode } from 'remix/component'

export type IconName =
  | 'play'
  | 'pause'
  | 'prev'
  | 'next'
  | 'shuffle'
  | 'repeat'
  | 'repeat-one'
  | 'queue'
  | 'more'
  | 'search'
  | 'library'
  | 'playlist'
  | 'settings'
  | 'up'
  | 'down'
  | 'remove'
  | 'back'
  | 'alert'
  | 'info'
  | 'plus'
  | 'record'
  | 'continue'

const paths: Record<IconName, RemixNode> = {
  play: <path d="M7 4.5v15L19.5 12z" fill="currentColor" stroke="none" />,
  pause: (
    <>
      <path d="M6.5 4.5h4v15h-4z" fill="currentColor" stroke="none" />
      <path d="M13.5 4.5h4v15h-4z" fill="currentColor" stroke="none" />
    </>
  ),
  prev: (
    <>
      <path d="M18.5 5v14L8 12z" fill="currentColor" stroke="none" />
      <path d="M6 5v14" />
    </>
  ),
  next: (
    <>
      <path d="M5.5 5v14L16 12z" fill="currentColor" stroke="none" />
      <path d="M18 5v14" />
    </>
  ),
  shuffle: (
    <>
      <path d="M3 7h3.5c4.5 0 6.5 10 11 10H21" />
      <path d="M3 17h3.5c1.6 0 2.8-1.3 3.8-3M13.7 10c1-1.7 2.2-3 3.8-3H21" />
      <path d="M18 4l3 3-3 3M18 14l3 3-3 3" />
    </>
  ),
  repeat: (
    <>
      <path d="M4 11V8h14" />
      <path d="M15 5l3 3-3 3" />
      <path d="M20 13v3H6" />
      <path d="M9 19l-3-3 3-3" />
    </>
  ),
  'repeat-one': (
    <>
      <path d="M4 11V8h14" />
      <path d="M15 5l3 3-3 3" />
      <path d="M20 13v3H6" />
      <path d="M9 19l-3-3 3-3" />
      <path d="M11 13.5v-4l-1.2.8" />
    </>
  ),
  queue: (
    <>
      <path d="M3 6h13M3 11h13M3 16h8" />
      <path d="M15 14v6l5-3z" fill="currentColor" stroke="none" />
    </>
  ),
  more: (
    <>
      <path d="M4.5 12h.01M12 12h.01M19.5 12h.01" stroke-width="3.5" />
    </>
  ),
  search: (
    <>
      <path d="M10.5 3.5a7 7 0 1 0 0 14 7 7 0 0 0 0-14z" />
      <path d="M15.5 15.5L21 21" />
    </>
  ),
  library: (
    <>
      <path d="M4 4v16M9 4v16" />
      <path d="M13.5 4.6l5.8 15" />
    </>
  ),
  playlist: (
    <>
      <path d="M3 6h12M3 11h12M3 16h7" />
      <path d="M17 18.5a2 2 0 1 1-4 0 2 2 0 0 1 4 0zM17 18.5V8l4 1.5" />
    </>
  ),
  settings: (
    <>
      <path d="M4 7h9M17 7h3M4 17h3M11 17h9" />
      <path d="M13 4.5v5h4v-5zM7 14.5v5h4v-5z" />
    </>
  ),
  up: <path d="M5 15l7-7 7 7" />,
  down: <path d="M5 9l7 7 7-7" />,
  remove: <path d="M6 6l12 12M18 6L6 18" />,
  back: (
    <>
      <path d="M20 12H5" />
      <path d="M11 6l-6 6 6 6" />
    </>
  ),
  alert: (
    <>
      <path d="M12 3L2.5 20h19z" />
      <path d="M12 9.5v5M12 17.2v.01" />
    </>
  ),
  info: (
    <>
      <path d="M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z" />
      <path d="M12 11v6M12 7.5v.01" />
    </>
  ),
  plus: <path d="M12 5v14M5 12h14" />,
  record: (
    <>
      <path d="M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z" />
      <path d="M12 9.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5z" />
    </>
  ),
  continue: (
    <>
      <path d="M4 12a8 8 0 1 0 2.4-5.7" />
      <path d="M4 3v4h4" />
      <path d="M10 8.5v7l5.5-3.5z" fill="currentColor" stroke="none" />
    </>
  ),
}

export function icon(name: IconName): RemixNode {
  return (
    <svg
      viewBox="0 0 24 24"
      width="24"
      height="24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="square"
      stroke-linejoin="miter"
      aria-hidden="true"
      focusable="false"
    >
      {paths[name]}
    </svg>
  )
}
