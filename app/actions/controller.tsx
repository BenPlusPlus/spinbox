import { createController } from 'remix/router'
import { verifyCredentials } from 'remix/auth'
import { Auth, requireAuth } from 'remix/middleware/auth'
import { Session } from 'remix/session'

import { assetServer } from '../assets.ts'
import type { AppDatabase } from '../data/index.ts'
import {
  AuthError,
  createFirstAdmin,
  createMemberPasswordProvider,
  householdHasMembers,
  publicRedirect,
  signInMember,
  signOutMember,
  type HouseholdMember,
} from '../modules/auth/index.ts'
import type { AppConfig } from '../modules/config/index.ts'
import { routes } from '../routes.ts'
import { LibraryHomePage } from '../ui/library-home-page.tsx'
import { LoginPage } from '../ui/login-page.tsx'
import { SetupPage } from '../ui/setup-page.tsx'

type AppDeps = {
  config: AppConfig
  database: AppDatabase
  passwordProvider: ReturnType<typeof createMemberPasswordProvider>
}

export function createRootController({ config, database }: AppDeps) {
  return createController(routes, {
    actions: {
      async assets(context) {
        return (
          (await assetServer.fetch(context.request)) ?? new Response('Not Found', { status: 404 })
        )
      },
      home: {
        middleware: [
          requireAuth<HouseholdMember>({
            onFailure() {
              return guestRedirect(config, database)
            },
          }),
        ],
        handler(context) {
          let member = context.auth
          if (!member.ok) {
            throw new Error('requireAuth should have resolved a Household member')
          }
          return context.render(<LibraryHomePage member={member.identity} />)
        },
      },
      logout(context) {
        signOutMember(context.get(Session))
        return guestRedirect(config, database)
      },
    },
  })
}

export function createSetupController({ config, database }: AppDeps) {
  return createController(routes.setup, {
    actions: {
      async index(context) {
        if (await householdHasMembers(database)) {
          return signedInDestination(context, config)
        }
        return context.render(<SetupPage />)
      },
      async action(context) {
        if (await householdHasMembers(database)) {
          return publicRedirect(config, routes.login.index.href())
        }

        let formData = context.get(FormData)
        try {
          let member = await createFirstAdmin(database, {
            email: String(formData.get('email') ?? ''),
            password: String(formData.get('password') ?? ''),
            displayName: String(formData.get('displayName') ?? ''),
          })
          signInMember(context, member)
          return publicRedirect(config, routes.home.href())
        } catch (error) {
          if (error instanceof AuthError) {
            if (error.code === 'setup_unavailable') {
              return publicRedirect(config, routes.login.index.href())
            }
            return context.render(<SetupPage error={error.message} />)
          }
          throw error
        }
      },
    },
  })
}

export function createLoginController({ config, database, passwordProvider }: AppDeps) {
  return createController(routes.login, {
    actions: {
      async index(context) {
        if (!(await householdHasMembers(database))) {
          return guestRedirect(config, database)
        }
        if (signedInMember(context)) {
          return publicRedirect(config, routes.home.href())
        }

        let error = context.get(Session).get('error')
        return context.render(<LoginPage error={typeof error === 'string' ? error : undefined} />)
      },
      async action(context) {
        if (!(await householdHasMembers(database))) {
          return guestRedirect(config, database)
        }

        let member = await verifyCredentials(passwordProvider, context)
        if (member == null) {
          context.get(Session).flash('error', 'Email or password is incorrect')
          return publicRedirect(config, routes.login.index.href())
        }

        signInMember(context, member)
        return publicRedirect(config, routes.home.href())
      },
    },
  })
}

function signedInMember(context: { get: (key: typeof Auth) => unknown }): HouseholdMember | null {
  let state = context.get(Auth) as { ok?: boolean; identity?: HouseholdMember } | undefined
  if (!state?.ok || !state.identity) {
    return null
  }
  return state.identity
}

function signedInDestination(
  context: { get: (key: typeof Auth) => unknown },
  config: AppConfig,
) {
  if (signedInMember(context)) {
    return publicRedirect(config, routes.home.href())
  }
  return publicRedirect(config, routes.login.index.href())
}

async function guestRedirect(config: AppConfig, database: AppDatabase) {
  if (await householdHasMembers(database)) {
    return publicRedirect(config, routes.login.index.href())
  }
  return publicRedirect(config, routes.setup.index.href())
}
