# Spinbox

Household self-hosted web music player. **This checkout is dev-only.** There are no product features yet: no real auth, no Library I/O, and no playback.

The app is a single-package [Remix 3](https://remix.run/) (`remix@next`) process. UI is `remix/ui`, not React. Auth will be first-party `remix/auth` — not Better Auth.

Requires **Node ≥ 24.3**.

## Run

```sh
npm install
npm run dev
```

Open http://127.0.0.1:44100 for the smoke hello route.

```sh
npm test
npm run typecheck
```

## Layout

Remix entrypoints (`server.ts`, `app/routes.ts`, `app/router.ts`, `app/actions`, `app/middleware`, `app/assets`, `app/ui`) plus empty `app/modules/*` stubs (`config`, `auth`, `library`, `media`, `playback`, `playlists`). Product behavior lands in later PRs.

See [`docs/design/spinbox-v1.md`](docs/design/spinbox-v1.md) and [`CONTEXT.md`](CONTEXT.md).
