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
  findInviteByToken,
  householdHasMembers,
  listInvites,
  mintInvite,
  publicRedirect,
  redeemInvite,
  revokeInvite,
  signInMember,
  signOutMember,
  type HouseholdMember,
} from '../modules/auth/index.ts'
import { publicOrigin, type AppConfig } from '../modules/config/index.ts'
import { routes } from '../routes.ts'
import { InvitesPage } from '../ui/invites-page.tsx'
import { JoinPage } from '../ui/join-page.tsx'
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
      inviteRevoke: {
        middleware: [
          requireAuth<HouseholdMember>({
            onFailure() {
              return guestRedirect(config, database)
            },
          }),
        ],
        async handler(context) {
          let member = signedInOrThrow(context)
          if (member.role !== 'admin') {
            return publicRedirect(config, routes.home.href())
          }

          try {
            await revokeInvite(database, member, context.params.id)
          } catch (error) {
            if (error instanceof AuthError) {
              context.get(Session).flash('error', error.message)
              return publicRedirect(config, routes.invites.index.href())
            }
            throw error
          }

          return publicRedirect(config, routes.invites.index.href())
        },
      },
    },
  })
}

export function createInvitesController({ config, database }: AppDeps) {
  return createController(routes.invites, {
    middleware: [
      requireAuth<HouseholdMember>({
        onFailure() {
          return guestRedirect(config, database)
        },
      }),
    ],
    actions: {
      async index(context) {
        let member = signedInOrThrow(context)
        if (member.role !== 'admin') {
          return publicRedirect(config, routes.home.href())
        }

        let session = context.get(Session)
        let mintedUrl = session.get('mintedInviteUrl')
        let error = session.get('error')
        let invites = await listInvites(database, member)
        return context.render(
          <InvitesPage
            invites={invites}
            mintedUrl={typeof mintedUrl === 'string' ? mintedUrl : undefined}
            error={typeof error === 'string' ? error : undefined}
          />,
        )
      },
      async action(context) {
        let member = signedInOrThrow(context)
        if (member.role !== 'admin') {
          return publicRedirect(config, routes.home.href())
        }

        let formData = context.get(FormData)
        try {
          let minted = await mintInvite(database, member, {
            email: String(formData.get('email') ?? ''),
          })
          let acceptUrl = new URL(
            routes.join.index.href({ token: minted.token }),
            publicOrigin(config),
          ).href
          context.get(Session).flash('mintedInviteUrl', acceptUrl)
          return publicRedirect(config, routes.invites.index.href())
        } catch (error) {
          if (error instanceof AuthError) {
            let invites = await listInvites(database, member)
            return context.render(<InvitesPage invites={invites} error={error.message} />)
          }
          throw error
        }
      },
    },
  })
}

export function createJoinController({ config, database }: AppDeps) {
  return createController(routes.join, {
    actions: {
      async index(context) {
        if (signedInMember(context)) {
          return publicRedirect(config, routes.home.href())
        }

        let token = context.params.token
        let invite = await findInviteByToken(database, token)
        return context.render(<JoinPage token={token} invite={invite} />)
      },
      async action(context) {
        if (signedInMember(context)) {
          return publicRedirect(config, routes.home.href())
        }

        let token = context.params.token
        let formData = context.get(FormData)
        try {
          let member = await redeemInvite(database, {
            token,
            email: String(formData.get('email') ?? ''),
            password: String(formData.get('password') ?? ''),
            displayName: String(formData.get('displayName') ?? ''),
          })
          signInMember(context, member)
          return publicRedirect(config, routes.home.href())
        } catch (error) {
          if (error instanceof AuthError) {
            let invite = await findInviteByToken(database, token)
            return context.render(
              <JoinPage token={token} invite={invite} error={error.message} />,
            )
          }
          throw error
        }
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

function signedInOrThrow(context: { get: (key: typeof Auth) => unknown }): HouseholdMember {
  let member = signedInMember(context)
  if (!member) {
    throw new Error('requireAuth should have resolved a Household member')
  }
  return member
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
