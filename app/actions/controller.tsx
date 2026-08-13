import { createController } from 'remix/router'
import { verifyCredentials } from 'remix/auth'
import { Auth, requireAuth } from 'remix/middleware/auth'
import { Session } from 'remix/session'

import { assetServer } from '../assets.ts'
import type { AppDatabase } from '../data/index.ts'
import {
  AuthError,
  changeOwnPassword,
  createFirstAdmin,
  createMemberPasswordProvider,
  demoteMember,
  disableMember,
  enableMember,
  findInviteByToken,
  hardDeleteMember,
  householdHasMembers,
  listInvites,
  listMembers,
  mintInvite,
  promoteMember,
  publicRedirect,
  redeemInvite,
  revokeInvite,
  setTemporaryPassword,
  signInMember,
  signOutMember,
  updateOwnDisplayName,
  type HouseholdMember,
} from '../modules/auth/index.ts'
import { publicOrigin, type AppConfig } from '../modules/config/index.ts'
import {
  getScanStatus,
  LibraryError,
  listTracks,
  startScan,
  type ScanAdapter,
} from '../modules/library/index.ts'
import { serveTrack } from '../modules/media/index.ts'
import {
  addToQueue,
  continueListening,
  getListeningSession,
  getListenResume,
  listRecentlyPlayed,
  playIntoSession,
  playNext,
  PlaybackError,
  updateListeningSession,
  type RepeatMode,
} from '../modules/playback/index.ts'
import { routes } from '../routes.ts'
import { InvitesPage } from '../ui/invites-page.tsx'
import { JoinPage } from '../ui/join-page.tsx'
import { LibraryHomePage } from '../ui/library-home-page.tsx'
import { LoginPage } from '../ui/login-page.tsx'
import { SettingsPage } from '../ui/settings-page.tsx'
import { SetupPage } from '../ui/setup-page.tsx'

type AppDeps = {
  config: AppConfig
  database: AppDatabase
  passwordProvider: ReturnType<typeof createMemberPasswordProvider>
  scanAdapter?: ScanAdapter
}

export function createRootController({ config, database, scanAdapter }: AppDeps) {
  return createController(routes, {
    actions: {
      async assets(context) {
        return (
          (await assetServer.fetch(context.request)) ?? new Response('Not Found', { status: 404 })
        )
      },
      home: {
        middleware: [requireSignedIn(config, database)],
        handler(context) {
          let member = signedInOrThrow(context)
          let forced = passwordChangeRedirect(config, member)
          if (forced) {
            return forced
          }
          let error = context.get(Session).get('error')
          return context.render(
            <LibraryHomePage
              member={member}
              session={getListeningSession(database, member)}
              tracks={listTracks(database)}
              recentlyPlayed={listRecentlyPlayed(database, member)}
              resume={getListenResume(database, member)}
              error={typeof error === 'string' ? error : undefined}
            />,
          )
        },
      },
      session: {
        middleware: [requireSignedIn(config, database)],
        handler(context) {
          return runSessionMutation(context, config, database)
        },
      },
      logout(context) {
        signOutMember(context.get(Session))
        return guestRedirect(config, database)
      },
      memberPromote: {
        middleware: [requireSignedIn(config, database)],
        async handler(context) {
          return runMemberMutation(context, config, database, (actor, id) =>
            promoteMember(database, actor, id),
          )
        },
      },
      memberDemote: {
        middleware: [requireSignedIn(config, database)],
        async handler(context) {
          return runMemberMutation(context, config, database, (actor, id) =>
            demoteMember(database, actor, id),
          )
        },
      },
      memberDisable: {
        middleware: [requireSignedIn(config, database)],
        async handler(context) {
          return runMemberMutation(context, config, database, async (actor, id) => {
            await disableMember(database, actor, id)
            return { signOutIfSelf: true }
          })
        },
      },
      memberEnable: {
        middleware: [requireSignedIn(config, database)],
        async handler(context) {
          return runMemberMutation(context, config, database, (actor, id) =>
            enableMember(database, actor, id),
          )
        },
      },
      memberHardDelete: {
        middleware: [requireSignedIn(config, database)],
        async handler(context) {
          return runMemberMutation(context, config, database, async (actor, id) => {
            await hardDeleteMember(database, actor, id)
            return { signOutIfSelf: true }
          })
        },
      },
      memberTemporaryPassword: {
        middleware: [requireSignedIn(config, database)],
        async handler(context) {
          return runMemberMutation(context, config, database, (actor, id, formData) =>
            setTemporaryPassword(database, actor, id, {
              password: String(formData.get('password') ?? ''),
            }),
          )
        },
      },
      mediaTrack(context) {
        return serveTrack(database, config, context.request, {
          trackId: context.params.trackId,
          member: signedInMember(context),
        })
      },
      scanNow: {
        middleware: [requireSignedIn(config, database)],
        async handler(context) {
          let member = signedInOrThrow(context)
          if (member.role !== 'admin') {
            return publicRedirect(config, routes.home.href())
          }
          let forced = passwordChangeRedirect(config, member)
          if (forced) {
            return forced
          }

          try {
            let started = await startScan(database, config, member, { adapter: scanAdapter })
            if (!started.ok) {
              context.get(Session).flash('error', 'A Scan run is already in progress')
            }
          } catch (error) {
            if (error instanceof LibraryError) {
              context.get(Session).flash('error', error.message)
              return publicRedirect(config, routes.settings.index.href())
            }
            throw error
          }

          return publicRedirect(config, routes.settings.index.href())
        },
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
          let forced = passwordChangeRedirect(config, member)
          if (forced) {
            return forced
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
        let forced = passwordChangeRedirect(config, member)
        if (forced) {
          return forced
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
        let forced = passwordChangeRedirect(config, member)
        if (forced) {
          return forced
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
        return passwordChangeRedirect(config, member) ?? publicRedirect(config, routes.home.href())
      },
    },
  })
}

export function createSettingsController({ config, database }: AppDeps) {
  return createController(routes.settings, {
    middleware: [requireSignedIn(config, database)],
    actions: {
      async index(context) {
        let member = signedInOrThrow(context)
        let session = context.get(Session)
        let error = session.get('error')
        let notice = session.get('notice')
        let members = member.role === 'admin' ? await listMembers(database, member) : undefined
        let scanStatus = member.role === 'admin' ? getScanStatus(database) : undefined
        return context.render(
          <SettingsPage
            member={member}
            members={members}
            scanStatus={scanStatus}
            error={typeof error === 'string' ? error : undefined}
            notice={typeof notice === 'string' ? notice : undefined}
          />,
        )
      },
      async action(context) {
        let member = signedInOrThrow(context)
        let formData = context.get(FormData)
        let intent = String(formData.get('intent') ?? '')

        try {
          if (member.mustChangePassword && intent !== 'password') {
            context.get(Session).flash('error', 'Change your password before you continue')
            return publicRedirect(config, routes.settings.index.href())
          }
          if (intent === 'displayName') {
            await updateOwnDisplayName(database, member, String(formData.get('displayName') ?? ''))
          } else if (intent === 'password') {
            let updated = await changeOwnPassword(database, member, {
              currentPassword: String(formData.get('currentPassword') ?? ''),
              newPassword: String(formData.get('newPassword') ?? ''),
            })
            signInMember(context, updated)
          } else {
            context.get(Session).flash('error', 'That Settings action is not available')
          }
          return publicRedirect(config, routes.settings.index.href())
        } catch (error) {
          if (error instanceof AuthError) {
            let members = member.role === 'admin' ? await listMembers(database, member) : undefined
            let scanStatus = member.role === 'admin' ? getScanStatus(database) : undefined
            return context.render(
              <SettingsPage
                member={member}
                members={members}
                scanStatus={scanStatus}
                error={error.message}
              />,
            )
          }
          throw error
        }
      },
    },
  })
}

function passwordChangeRedirect(config: AppConfig, member: HouseholdMember) {
  if (member.mustChangePassword) {
    return publicRedirect(config, routes.settings.index.href())
  }
  return null
}

function requireSignedIn(config: AppConfig, database: AppDatabase) {
  return requireAuth<HouseholdMember>({
    onFailure() {
      return guestRedirect(config, database)
    },
  })
}

function runSessionMutation(
  context: { get: (key: any) => any },
  config: AppConfig,
  database: AppDatabase,
) {
  let member = signedInOrThrow(context)
  let forced = passwordChangeRedirect(config, member)
  if (forced) {
    return forced
  }

  let formData = context.get(FormData)
  let intent = String(formData.get('intent') ?? '')

  try {
    if (intent === 'play') {
      let trackIds = formData
        .getAll('trackId')
        .map((value: FormDataEntryValue) => String(value))
        .filter(Boolean)
      let startAtRaw = String(formData.get('startAt') ?? '')
      let startAt = startAtRaw === '' ? 0 : Number.parseInt(startAtRaw, 10)
      playIntoSession(database, member, { trackIds, startAt })
    } else if (intent === 'play-next') {
      playNext(database, member, String(formData.get('trackId') ?? ''))
    } else if (intent === 'add-to-queue') {
      addToQueue(database, member, String(formData.get('trackId') ?? ''))
    } else if (intent === 'update') {
      updateListeningSession(database, member, parseSessionPatch(formData))
    } else if (intent === 'continue') {
      continueListening(database, member)
    } else {
      context.get(Session).flash('error', 'That Listening session action is not available')
    }
  } catch (error) {
    if (error instanceof PlaybackError) {
      context.get(Session).flash('error', error.message)
      return publicRedirect(config, routes.home.href())
    }
    throw error
  }

  return publicRedirect(config, routes.home.href())
}

function parseSessionPatch(formData: FormData) {
  let patch: {
    playheadMs?: number
    playing?: boolean
    shuffle?: boolean
    repeat?: RepeatMode
  } = {}

  if (formData.has('playheadMs')) {
    patch.playheadMs = Number.parseInt(String(formData.get('playheadMs') ?? '0'), 10) || 0
  }
  if (formData.has('playing')) {
    patch.playing = formData.get('playing') === '1' || formData.get('playing') === 'true'
  }
  if (formData.has('shuffle')) {
    patch.shuffle = formData.get('shuffle') === '1' || formData.get('shuffle') === 'true'
  }
  if (formData.has('repeat')) {
    let repeat = String(formData.get('repeat') ?? '')
    if (repeat === 'off' || repeat === 'all' || repeat === 'one') {
      patch.repeat = repeat
    }
  }
  return patch
}

async function runMemberMutation(
  context: { params: { id: string }; get: (key: any) => any },
  config: AppConfig,
  database: AppDatabase,
  mutate: (
    actor: HouseholdMember,
    memberId: string,
    formData: FormData,
  ) => Promise<HouseholdMember | void | { signOutIfSelf: true }>,
) {
  let actor = signedInOrThrow(context)
  if (actor.role !== 'admin') {
    return publicRedirect(config, routes.home.href())
  }
  let forced = passwordChangeRedirect(config, actor)
  if (forced) {
    return forced
  }

  try {
    let result = await mutate(actor, context.params.id, context.get(FormData))
    if (
      result &&
      typeof result === 'object' &&
      'signOutIfSelf' in result &&
      result.signOutIfSelf &&
      actor.id === context.params.id
    ) {
      signOutMember(context.get(Session))
      return guestRedirect(config, database)
    }
    return publicRedirect(config, routes.settings.index.href())
  } catch (error) {
    if (error instanceof AuthError) {
      context.get(Session).flash('error', error.message)
      return publicRedirect(config, routes.settings.index.href())
    }
    throw error
  }
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
