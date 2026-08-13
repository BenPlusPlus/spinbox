# Spinbox

Household self-hosted web music player. **This checkout is still mostly dev-only.** There is typed config and SQLite under the app data dir, but no real auth, Library I/O, or playback yet.

The app is a single-package [Remix 3](https://remix.run/) (`remix@next`) process. UI is `remix/ui`, not React. Auth will be first-party `remix/auth` — not Better Auth.

Requires **Node ≥ 24.3**.

## Run

```sh
pnpm install
pnpm dev
```

Open http://127.0.0.1:44100 for the smoke hello route. In development, missing env falls back to a local Library at `data/library` and app data (including SQLite) at `data/app`.

```sh
pnpm test
pnpm typecheck
```

Migrations apply on start. `pnpm migrate` applies them without serving and uses the same env rules as the process (`NODE_ENV=development` for local defaults; production fail-fasts if required vars are missing).

Production (`pnpm start`) fail-fasts unless `LIBRARY_ROOT`, `SPINBOX_DATA_DIR`, `SPINBOX_PUBLIC_URL`, and a listen port (`PORT` or `SPINBOX_PORT`) are set. See [`.env.example`](.env.example). Origin-sensitive behavior uses `SPINBOX_PUBLIC_URL` only — never `Host` or `X-Forwarded-*`.

## Layout

Remix entrypoints (`server.ts`, `app/routes.ts`, `app/router.ts`, `app/actions`, `app/middleware`, `app/assets`, `app/ui`) plus `app/modules/*` (`config` is live; `auth`, `library`, `media`, `playback`, `playlists` are stubs). SQLite connection and versioned migrations live in `app/data`.

See [`docs/design/spinbox-v1.md`](docs/design/spinbox-v1.md) and [`CONTEXT.md`](CONTEXT.md).
