import type { Handle, RemixNode } from 'remix/component'

import { routes } from '../routes.ts'
import { color, globalStyles } from './theme.ts'

export interface DocumentProps {
  children?: RemixNode
  head?: RemixNode
  title?: string
}

export function Document(handle: Handle<DocumentProps>) {
  return () => {
    let { children, head, title = 'Spinbox' } = handle.props

    return (
      <html lang="en">
        <head>
          <meta charSet="utf-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1" />
          <meta name="theme-color" content={color.night} />
          <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
          <link
            rel="preload"
            href="/fonts/archivo-latin.woff2"
            as="font"
            type="font/woff2"
            crossOrigin="anonymous"
          />
          <title>{title}</title>
          {head}
          <style>{globalStyles}</style>
        </head>
        <body>
          {children}
          <script type="module" src={routes.assets.href({ path: 'app/assets/entry.ts' })}></script>
        </body>
      </html>
    )
  }
}
