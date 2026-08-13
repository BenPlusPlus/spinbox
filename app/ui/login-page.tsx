import type { Handle } from 'remix/ui'

import { routes } from '../routes.ts'
import { AuthShell, field, fieldStack, input, submit } from './auth-shell.tsx'

export function LoginPage(handle: Handle<{ error?: string }>) {
  return () => {
    let { error } = handle.props

    return (
      <AuthShell
        title="Sign in"
        lead="Household members sign in with email and password."
        error={error}
      >
        <form method="POST" action={routes.login.action.href()} mix={fieldStack}>
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
              autoComplete="current-password"
              required
            />
          </label>
          <button mix={submit} type="submit">
            Sign in
          </button>
        </form>
      </AuthShell>
    )
  }
}
