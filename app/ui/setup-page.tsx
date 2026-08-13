import type { Handle } from 'remix/ui'

import { routes } from '../routes.ts'
import { AuthShell, field, fieldStack, input, submit } from './auth-shell.tsx'

export function SetupPage(handle: Handle<{ error?: string }>) {
  return () => {
    let { error } = handle.props

    return (
      <AuthShell
        title="Create the first Admin"
        lead="This household is empty. Set an email and password to become the first Admin. After this, Spinbox is invite-only."
        error={error}
      >
        <form method="POST" action={routes.setup.action.href()} mix={fieldStack}>
          <label mix={field}>
            Email
            <input mix={input} type="email" name="email" autoComplete="username" required />
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
            Create Admin
          </button>
        </form>
      </AuthShell>
    )
  }
}
