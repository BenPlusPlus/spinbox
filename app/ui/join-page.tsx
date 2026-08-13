import type { Handle } from 'remix/ui'

import type { Invite } from '../modules/auth/index.ts'
import { routes } from '../routes.ts'
import { AuthShell, field, fieldStack, input, submit } from './auth-shell.tsx'

export function JoinPage(
  handle: Handle<{ token: string; invite?: Invite | null; error?: string }>,
) {
  return () => {
    let { token, invite, error } = handle.props
    let redeemable = invite?.status === 'unused'
    let boundEmail = invite?.email

    return (
      <AuthShell
        title={redeemable ? 'Accept Invite' : 'Invite unavailable'}
        lead={
          redeemable
            ? 'Set your password to join this household as a Member.'
            : 'This Invite cannot be used. Ask an Admin for a new one.'
        }
        error={error}
      >
        {redeemable ? (
          <form
            method="POST"
            action={routes.join.action.href({ token })}
            mix={fieldStack}
          >
            <label mix={field}>
              Email
              <input
                mix={input}
                type="email"
                name="email"
                autoComplete="username"
                required
                readOnly={boundEmail != null}
                value={boundEmail ?? undefined}
              />
            </label>
            <label mix={field}>
              Password
              <input
                mix={input}
                type="password"
                name="password"
                autoComplete="new-password"
                required
                minLength={8}
              />
            </label>
            <label mix={field}>
              Display name (optional)
              <input mix={input} type="text" name="displayName" autoComplete="nickname" />
            </label>
            <button mix={submit} type="submit">
              Join household
            </button>
          </form>
        ) : null}
      </AuthShell>
    )
  }
}
