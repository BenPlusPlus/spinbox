# Research: Remix 3 fitness for Spinbox

**Ticket:** [#2 — Remix 3 fitness for Spinbox](https://github.com/BenPlusPlus/spinbox/issues/2)  
**Map:** [#1 — Spinbox design + PR plan](https://github.com/BenPlusPlus/spinbox/issues/1)  
**Date:** 2026-08-08  
**Sources:** primary only (official Remix / React Router docs, GitHub `remix-run/remix`, npm package metadata)

---

## Executive recommendation

**Remix 3 is a strong technical fit for Spinbox’s audio and SSR needs, but it is explicitly a beta — not production-ready.** Design and PR planning should treat Remix 3 as the **intended foundation** only if the household product accepts:

1. **Beta API churn** and weekly releases  
2. **A non-React UI model** (`remix/ui` — not React / not drop-in React libraries)  
3. **Node.js ≥ 24.3.0** and a **long-lived Node HTTP server** (not Vite-framework deploy)  
4. **Auth integration work**: either wire Better Auth as a Fetch handler next to Remix routes, or prefer first-party `remix/auth` + sessions for v1 simplicity  

**Fallback if beta risk is unacceptable for the design doc:** React Router **framework mode** (v7/v8, production-stable, Vite + React 19) remains the continuity path of the former “Remix stack,” with weaker first-party range-file helpers (app-owned `Response` streaming still works via Web APIs).

---

## What Remix 3 is today

### Identity and history

| Era | What it was |
| --- | --- |
| Remix v1–v2 | Full-stack React framework on React Router |
| 2024 “merge” | Planned Remix v3 features shipped as **React Router v7** framework mode; Remix packages “took a nap” ([Merging Remix and React Router](https://remix.run/blog/merging-remix-and-react-router)) |
| 2025 “wake up” | Remix rebooted as a **new full-stack framework**, not React, guided by six principles ([Wake up, Remix!](https://remix.run/blog/wake-up-remix)) |
| 2025–2026 | Composable packages open-sourced; umbrella `remix` package targeted early 2026 ([Remix Jam 2025 Recap](https://remix.run/blog/remix-jam-2025-recap)) |
| 2026-04-30 | **Remix 3 beta preview** published ([Remix 3 Beta Preview](https://remix.run/blog/remix-3-beta-preview)) |

Remix 3 is **not** an incremental upgrade from Remix v2. It is a new framework: Fetch-API routes, own component model, own asset pipeline, batteries-included packages under one distribution.

### Stability

- Official posture: **pre-release / beta; not production ready** ([Remix 3 Beta Preview](https://remix.run/blog/remix-3-beta-preview); [remix.run homepage](https://remix.run/)).
- npm: `remix@next` → **`3.0.0-beta.5`**; `remix@latest` is still **Remix v2** (`2.17.5`) (npm dist-tags, 2026-08-08).
- Source: [github.com/remix-run/remix](https://github.com/remix-run/remix) — active monorepo (`packages/*`, template, bookstore demo).
- Expect **API movement** (“new features and releases every week” per beta post).

### Package names

**App dependency (recommended):** single package **`remix`** with **subpath imports only** (no top-level `import { … } from 'remix'`).

```text
npm install remix@next
# or scaffold:
npx remix@next new my-remix-app
```

**Subpath map (illustrative, from published exports / skill):**

| Concern | Import |
| --- | --- |
| Router | `remix/router`, `remix/routes` |
| Node adapter | `remix/node-fetch-server` |
| Assets (unbundling) | `remix/assets` |
| Sessions | `remix/session`, `remix/middleware/session`, `remix/session-storage/*` |
| Auth | `remix/auth`, `remix/middleware/auth` |
| Static / files | `remix/middleware/static`, `remix/fs`, `remix/lazy-file`, `remix/response/file` |
| UI | `remix/ui`, `remix/ui/server`, `remix/ui/*` primitives |
| Data | `remix/data-schema`, `remix/data-table`, `remix/data-table/sqlite` (etc.) |

Workspace packages still exist as **`@remix-run/<name>`** inside the monorepo; apps consume them **via the umbrella `remix` re-exports**.

Docs: [API docs](https://api.remix.run/), package READMEs on GitHub under `packages/*/README.md`, agent skill `.agents/skills/remix/SKILL.md` in the repo.

### Deploy model

- **Default template:** long-lived **Node** process  
  - `node --import remix/node-tsx server.ts`  
  - `http.createServer(createRequestListener(…))` → `router.fetch(request)`  
  - Engines: **`node: ">=24.3.0"`** (template + `remix` package; monorepo `.nvmrc` is `24`)  
  Sources: [template/package.json](https://github.com/remix-run/remix/blob/main/template/package.json), [template/server.ts](https://github.com/remix-run/remix/blob/main/template/server.ts), [packages/remix/package.json](https://github.com/remix-run/remix/blob/main/packages/remix/package.json)
- **Portability claim:** Web Fetch primitives; packages aim to work on Node, Bun, Deno, Cloudflare Workers ([README Goals](https://github.com/remix-run/remix/blob/main/README.md)). For Spinbox’s always-on LAN host, **Node HTTP is the documented happy path**.
- **Not Vite-centric:** Remix 3 is **bundler-free / “unbundling”** — browser JS/CSS compiled **on demand** by `remix/assets` (`createAssetServer`), not a Vite app plugin ([beta post](https://remix.run/blog/remix-3-beta-preview); [assets README](https://github.com/remix-run/remix/tree/main/packages/assets)).
- Reverse-proxy: `node-fetch-server` supports `trustProxy` and host options for deployment behind a proxy ([node-fetch-server README](https://github.com/remix-run/remix/tree/main/packages/node-fetch-server)).

### UI model (critical for “rich Now playing”)

- **Not React.** Custom component runtime in `remix/ui` (Preact-influenced lineage called out in [Wake up, Remix!](https://remix.run/blog/wake-up-remix); procedural components with `Handle`, explicit `handle.update()`, mixins).
- Interactivity: selective hydration via `clientEntry` / `run`; async islands via `<Frame>` ([Jam recap](https://remix.run/blog/remix-jam-2025-recap); UI skill guidance).
- Animation helpers exist (`remix/ui/animation`) — relevant to vinyl flip UX.
- **React ecosystem components do not drop in.**

---

## Fitness vs Spinbox requirements

### 1. Authenticated SSR app — **Fit (with auth-stack choices)**

| Need | Remix 3 support |
| --- | --- |
| SSR HTML | Controllers return `Response` / `createHtmlResponse` / `remix/ui/server` render |
| Sessions | Cookie + storage backends (memory, fs, cookie, redis, memcache) |
| Route protection | `auth()` middleware + `requireAuth()` |
| Credentials / OAuth | First-party `remix/auth` (credentials, Google, GitHub, OIDC, etc.) |

Sources: [auth README](https://github.com/remix-run/remix/tree/main/packages/auth), agent skill security defaults.

**Better Auth (map leaning):** Better Auth documents **framework-agnostic** server support for standard `Request`/`Response` and a **vanilla JS client** ([installation docs](https://better-auth.com/docs/installation)). That is compatible in principle with Remix’s Fetch router: mount `auth.handler` on an `/api/auth/*` route (or equivalent) and resolve session in Remix middleware.

**Footgun:** There is **no official Remix 3 integration** in Better Auth’s curated framework list (React/Next/etc. are the polished paths). Design must budget for:

- Mounting Better Auth’s handler on the Fetch router  
- Session cookie sharing / dual session systems if mixing `remix/session` and Better Auth storage  
- Client: use **vanilla** Better Auth client inside `clientEntry` islands, not `better-auth/react`  
- Invite-only + admin roles: Better Auth plugins can help **or** implement on top of `remix/auth` credentials  

**Design recommendation:** Treat auth as a **decision ticket**: (A) Better Auth mounted on Remix 3, or (B) `remix/auth` + `data-table` users for household invites. Do not assume React UI from either stack.

### 2. Streaming / binary audio + HTTP Range — **Strong fit**

First-class building blocks:

| Piece | Role |
| --- | --- |
| `remix/lazy-file` / `openLazyFile` | Stream large files without buffering ([lazy-file README](https://github.com/remix-run/remix/tree/main/packages/lazy-file)) |
| `createFileResponse(file, request, opts)` | ETag, Last-Modified, conditional GETs, **206 Partial Content**, `Accept-Ranges: bytes` ([response/file](https://github.com/remix-run/remix/blob/main/packages/response/src/lib/file.ts)) |
| `staticFiles()` middleware | Same semantics for directory trees ([static-middleware README](https://github.com/remix-run/remix/tree/main/packages/static-middleware)) |
| Headers | Typed `Range`, `Content-Range`, `If-Range`, etc. via `remix/headers/*` |

Default behavior aligns with audio:

- Range support defaults **on for non-compressible MIME types** (media); compression is **skipped** when `Accept-Ranges: bytes` is set (range + compression mutually exclusive — documented in response README).
- Uses `file.slice(start, end).stream()` for 206 bodies — works with `LazyFile` slice.

**Constraints / footguns for audio:**

1. **Single range only** — multi-range requests return 416 (multipart ranges not supported). Fine for HTML5 `<audio>` seek (single ranges).  
2. **Do not use strong ETags on large tracks by default** — strong digests buffer the whole file into memory unless you supply a streaming custom `digest`. Prefer weak ETags (`W/"size-mtime"`) for library files.  
3. **Auth on media URLs** — static middleware alone is public-by-directory; Spinbox should serve audio via a **controller** that checks auth then `createFileResponse(openLazyFile(path), request)`, or put static middleware behind auth carefully.  
4. **Library on Synology mount** — use lazy streaming; never `arrayBuffer()` an album FLAC in a request path.  
5. Transcoding (if any) is **out of framework scope** — separate stream pipeline returning a `ReadableStream` `Response` is still valid Web API usage.

### 3. Background-ish library scan jobs — **Fit as Node app, not as framework feature**

Remix 3 does **not** ship a job queue, worker pool, or durable scheduler. The deploy model is a **long-lived Node server**, which **allows**:

- In-process scan state (admin “Scan now”, progress in session/DB)  
- `setInterval` / external cron hitting a protected admin route  
- Separate worker process sharing the same DB  

**Footguns:**

- Do not run multi-hour scans **inside a single HTTP request** without care (timeouts, aborted `request.signal`). Prefer fire-and-track job records.  
- In-process jobs die on process restart — acceptable for household v1 if scans are restartable/idempotent.  
- Multi-instance deploy would need external coordination; Spinbox’s single always-on host avoids that.

### 4. Rich client Now playing UI — **Fit, with relearning cost**

| Need | Path |
| --- | --- |
| SSR shell + browse | Server components / full page render |
| Client player state (queue, seek UI, vinyl anim) | `clientEntry` hydrated islands; `handle` state + `handle.update()` |
| DOM / Web Audio / Media Session | Browser-only code in client entries |
| Independent refresh of chrome vs player | `<Frame>` patterns (bookstore demo) |
| Animation | `remix/ui/animation` springs/tweens |

**Footguns:**

- **Not React** — no hooks, no React DevTools mental model, no shadcn/Radix React.  
- Hydrated props must be **serializable**.  
- Make server routes correct **without** JS first (audio URL + progressive enhancement), then layer player chrome.  
- Ecosystem maturity: fewer third-party UI kits; more first-party primitives (button, menu, popover, …).

---

## Recommended project shape (for design + PR plan)

Assume this skeleton unless a later ticket overrides:

```text
spinbox/
  package.json          # "type": "module", engines.node >= 24.3.0
  server.ts             # node:http + createRequestListener → router.fetch
  app/
    routes.ts           # typed route contract (href generation)
    router.ts           # createRouter + middleware + router.map
    actions/            # controllers by route-map key
    assets/             # client entries (player, now-playing)
    data/               # schema, queries, migrations
    middleware/         # session, auth, db, static/assets
    ui/                 # shared cross-route UI
  db/                   # migrations / sqlite files (if using data-table)
  public/               # truly public static only (not the music library)
  test/
```

Aligned with official template + [remix agent skill layout](https://github.com/remix-run/remix/blob/main/.agents/skills/remix/SKILL.md).

### Tooling assumptions

| Item | Assume |
| --- | --- |
| Package | `remix@next` (pin exact beta, e.g. `3.0.0-beta.5`, and re-evaluate pin often) |
| Node | **≥ 24.3.0** (document on host image) |
| Bundler | **No Vite app** — `remix/assets` `createAssetServer` for browser modules |
| Dev | `node --watch --import remix/node-tsx server.ts` |
| Tests | `remix test` / router `fetch` tests preferred |
| DB leaning | `remix/data-table` + SQLite is coherent for household; not required by Remix |
| Music root | **Outside** `public/`; served only via authenticated media routes + `createFileResponse` |
| Deploy | Single Node process on always-on LAN host; optional reverse proxy with `trustProxy` |

### Scaffold command

```sh
npx remix@next new spinbox
```

### What the design doc should **not** assume

- Classic Remix v2 / `@remix-run/react` / file-based routes  
- Vite + React Router as the Remix 3 path (that is the **other** stack)  
- Production stability guarantees or LTS  
- Drop-in React component libraries for Now playing  
- Built-in background workers  

---

## Constraints and footguns (checklist)

1. **Beta risk** — official “not production ready”; APIs move weekly.  
2. **Node 24.3+** on the always-on host.  
3. **Not React** — team/agent skills must use `remix/ui` patterns.  
4. **Import discipline** — always `remix/<subpath>`.  
5. **Auth duality** — Better Auth vs `remix/auth`; avoid two competing session cookies without a design.  
6. **Audio serving** — weak ETags; auth before bytes; lazy files; single-range only.  
7. **Scan jobs** — app-level, not framework; no blocking request-scoped full-library scan.  
8. **Asset allowlists** — `createAssetServer` requires explicit `allowFiles` / `allowPackages`.  
9. **Secrets** — fail-fast session secrets outside test (skill defaults).  
10. **Upgrade path** — Remix 3 is intentionally **not** “migrate React Router apps to Remix 3” ([discussion stance](https://github.com/remix-run/remix/discussions/10333) / wake-up post); pick Remix 3 **or** React Router framework mode, don’t plan a later free port of UI.

---

## Alternative foundation: React Router framework mode

If Spinbox prioritizes **production stability and React ecosystem** over Remix 3’s file/range/auth batteries:

| | Remix 3 (beta) | React Router v7/v8 framework |
| --- | --- | --- |
| Stability | Beta | Production (v8 current: Node 22+, Vite 7+, React 19+, ESM — [reactrouter.com](https://reactrouter.com/)) |
| UI | `remix/ui` | React |
| Assets | `remix/assets` unbundling | Vite |
| Audio ranges | First-party `createFileResponse` | Manual `Response` / middleware (still Web Streams) |
| Auth | `remix/auth` or mount Better Auth | Better Auth has more React-facing docs |
| Continuity with “old Remix” | New stack | Direct descendant of Remix v2 |

**Recommendation for map:** Prefer **Remix 3** if the vinyl player and media-serving model are the centerpiece and beta risk is accepted for a household app. Prefer **React Router framework** if design wants React + Vite maturity and is willing to own range-response helpers.

---

## Answers to the ticket questions (compressed)

| Question | Answer |
| --- | --- |
| Stability | **Beta** (`3.0.0-beta.5` on `next`); not production-ready per official posts |
| Package names | Umbrella **`remix`** + subpaths; monorepo `@remix-run/*` |
| Docs | [api.remix.run](https://api.remix.run/), GitHub package READMEs, blog, agent skill; not a polished “Remix v2 docs site” yet |
| Deploy | Long-lived **Node ≥ 24.3** HTTP server via `node-fetch-server`; portable claims to other runtimes; **no Vite app model** |
| Sound foundation for Spinbox? | **Yes technically** (SSR, auth middleware, **excellent** range/file streaming, client islands for Now playing). **Conditional on accepting beta + non-React UI + auth integration work.** Background scans are app-owned. |

---

## Suggested follow-ons for the map

1. **Auth decision ticket** — Better Auth on Fetch router vs `remix/auth` for invite-only household + admin.  
2. **Media route design** — authenticated `createFileResponse` + cache headers + weak ETags (pairs with format/mount research).  
3. **Scan job design** — process-local job table + admin UX (independent of Remix).  
4. **Now playing prototype** — `clientEntry` + Media Session + vinyl animation on Remix 3 UI (validates non-React cost early).  
5. **Stability gate** — pin beta; define “promote to stable `remix@`” criterion before multi-user household cutover.

---

## Primary sources

- [Wake up, Remix!](https://remix.run/blog/wake-up-remix) (2025-05-28)  
- [Remix Jam 2025 Recap](https://remix.run/blog/remix-jam-2025-recap) (2025-10-20)  
- [Remix 3 Beta Preview](https://remix.run/blog/remix-3-beta-preview) (2026-04-30)  
- [remix.run](https://remix.run/)  
- [api.remix.run](https://api.remix.run/)  
- [github.com/remix-run/remix](https://github.com/remix-run/remix) (README, packages, template, demos/bookstore)  
- Package READMEs: `response`, `lazy-file`, `static-middleware`, `auth`, `assets`, `node-fetch-server`, `ui`  
- [Merging Remix and React Router](https://remix.run/blog/merging-remix-and-react-router) (historical RR v7 path)  
- [reactrouter.com](https://reactrouter.com/) (stable React alternative)  
- [Better Auth installation](https://better-auth.com/docs/installation) (Request/Response + vanilla client)  
- npm package `remix` dist-tags (`latest` = 2.x, `next` = 3.0.0-beta.x)
