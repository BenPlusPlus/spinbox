# Hybrid Remix layout with deep domain modules

Spinbox is a single-package Remix 3 app on one long-lived Node process. We organize source as a **hybrid**: framework entrypoints stay where Remix expects them (`server.ts`, `app/router.ts`, `app/routes.ts`, `app/actions/*`, `app/middleware/*`, `app/assets/*`, `app/ui/*`), and product behavior lives in **deep modules** under `app/modules/*` with small interfaces. Controllers and middleware stay shallow and call those modules.

We rejected a pure template-folder layout (domain logic smeared across actions) and a pure domain-first top-level tree (fights Remix’s router/assets model). We also keep **one package** for v1 and run **Scan runs in-process** behind a library-owned seam so a worker can be swapped later without rewriting callers.

## Module inventory

| Module | Owns |
| --- | --- |
| `config` | Typed env (`LIBRARY_ROOT`, `SPINBOX_DATA_DIR`, `SPINBOX_PUBLIC_URL`, …); fail-fast at boot |
| `auth` | `remix/auth` wiring, credentials, cookie sessions, roles, invites, member lifecycle helpers |
| `library` | Track index, membership/ignore rules, tag/path resolution, **Scan run** lifecycle + in-process adapter |
| `media` | Authenticated range delivery, weak ETag / status map, **stream-source** seam (v1 = original under `LIBRARY_ROOT`) |
| `playback` | Listening session, Play queue, Listen resume, Recently played |
| `playlists` | Owner-private playlists and Missing track entries |

Browse shell and vinyl Now playing are **not** domain modules: they live in `app/ui` and `app/assets` and talk to modules only through HTTP actions / server render paths.

## Data

One SQLite database under the host app data dir. **Versioned migrations and the connection live in `app/data`.** Domain modules own the **query/command interfaces** other code may use; no cross-module raw table access (e.g. `media` asks `library` to resolve a track to a path and metadata).

## Key seams

- **Scan (library):** `startScan` / `getScanStatus`; at most one active Scan run; HTTP request must not stay open for the full walk; v1 adapter is in-process.
- **Stream-source (media):** `resolveSource(trackRef)` with a v1 original-file adapter; `serveTrack` owns 401/404/503 and `createFileResponse` / LazyFile behavior.

## Considered options

- **Framework-shaped only** — rejected: shallow controllers accumulate library and session rules.
- **Domain-first packages / top-level domains** — rejected for v1: extra package or layout tax without a second deployable; clashes with Remix asset/clientEntry paths.
- **Separate scan worker from day one** — deferred: household single-host deploy; extract behind the scan seam if needed.
- **Monorepo workspace packages** — deferred until a real second deployable exists.

## Consequences

- Design doc and PR plan assume this tree and these module boundaries, not a scaffold-only template dump.
- UI never imports `app/modules/*` from client islands; islands call routes/actions.
- Future transcode/cache pipelines replace the media stream-source adapter; future scan workers replace the library scan adapter.
- npm workspace splits remain optional and are not required to start implementation.
