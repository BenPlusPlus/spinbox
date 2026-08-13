# Spinbox

Household self-hosted web music player. **This checkout is still mostly dev-only.** First Admin setup and cookie sign-in work; Library I/O and playback are not built yet.

The app is a single-package [Remix 3](https://remix.run/) (`remix@next`) process. UI is `remix/ui`, not React. Auth is first-party `remix/auth` plus app-owned Household member tables — not Better Auth.

Requires **Node ≥ 24.3**.

## Run

```sh
pnpm install
pnpm dev
```

Open http://127.0.0.1:44100. An empty database shows first-Admin setup; after that, sign in with email and password. In development, missing env falls back to a local Library at `data/library` and app data (including SQLite) at `data/app`. A well-known dev `SESSION_SECRET` is supplied automatically.

```sh
pnpm test
pnpm typecheck
```

Migrations apply on start. `pnpm migrate` applies them without serving and uses the same env rules as the process (`NODE_ENV=development` for local defaults; production fail-fasts if required vars are missing).

Last-Admin lockout recovery is host-local only (not a network backdoor):

```sh
pnpm recover-admin --email ada@example.com --password new-secure-password
```

That promotes and re-enables the named Household member if needed, then sets the password. Run it on the app host with the same env as the process.

Production (`pnpm start`) fail-fasts unless `LIBRARY_ROOT`, `SPINBOX_DATA_DIR`, `SPINBOX_PUBLIC_URL`, `SESSION_SECRET`, and a listen port (`PORT` or `SPINBOX_PORT`) are set. See [`.env.example`](.env.example). Origin-sensitive behavior uses `SPINBOX_PUBLIC_URL` only — never `Host` or `X-Forwarded-*`. Dev cookies over HTTP localhost are non-`Secure`.

## Layout

Remix entrypoints (`server.ts`, `app/routes.ts`, `app/router.ts`, `app/actions`, `app/middleware`, `app/assets`, `app/ui`) plus `app/modules/*` (`config` and `auth` are live; `library`, `media`, `playback`, `playlists` are stubs). SQLite connection and versioned migrations live in `app/data`.

See [`docs/design/spinbox-v1.md`](docs/design/spinbox-v1.md) and [`CONTEXT.md`](CONTEXT.md).
