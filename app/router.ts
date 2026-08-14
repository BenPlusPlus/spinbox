import { createRouter, type MiddlewareContext } from 'remix/router'
import { formData } from 'remix/middleware/form-data'
import { session } from 'remix/middleware/session'
import { staticFiles } from 'remix/middleware/static'

import {
  createInvitesController,
  createJoinController,
  createLoginController,
  createPlaylistController,
  createPlaylistsController,
  createRootController,
  createSettingsController,
  createSetupController,
} from './actions/controller.tsx'
import type { AppDatabase } from './data/index.ts'
import {
  createMemberAuthMiddleware,
  createMemberPasswordProvider,
  createMemberSessionStorage,
  createSessionCookie,
} from './modules/auth/index.ts'
import type { AppConfig } from './modules/config/index.ts'
import type { ScanAdapter } from './modules/library/index.ts'
import { render } from './middleware/render.tsx'
import { routes } from './routes.ts'

type AppContext = MiddlewareContext<
  [
    ReturnType<typeof render>,
    ReturnType<typeof session>,
    ReturnType<typeof formData>,
    ReturnType<typeof createMemberAuthMiddleware>,
  ]
>

declare module 'remix/router' {
  interface RouterTypes {
    context: AppContext
  }
}

export function createApp({
  config,
  database,
  scanAdapter,
}: {
  config: AppConfig
  database: AppDatabase
  scanAdapter?: ScanAdapter
}) {
  let passwordProvider = createMemberPasswordProvider(database)
  let deps = { config, database, passwordProvider, scanAdapter }

  let router = createRouter<AppContext>({
    middleware: [
      staticFiles('./public', { index: false }),
      render(),
      session(createSessionCookie(config), createMemberSessionStorage()),
      formData(),
      createMemberAuthMiddleware(database),
    ],
  })

  router.map(routes, createRootController(deps))
  router.map(routes.setup, createSetupController(deps))
  router.map(routes.login, createLoginController(deps))
  router.map(routes.invites, createInvitesController(deps))
  router.map(routes.join, createJoinController(deps))
  router.map(routes.playlists, createPlaylistsController(deps))
  router.map(routes.playlist, createPlaylistController(deps))
  router.map(routes.settings, createSettingsController(deps))

  return router
}
