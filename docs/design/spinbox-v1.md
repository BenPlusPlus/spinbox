# Spinbox v1 — Design Document

**Status:** Build-ready design for a later implementation effort  
**Map:** [Spinbox: design + PR plan](https://github.com/BenPlusPlus/spinbox/issues/1)  
**Assembly ticket:** [Spinbox design doc and PR plan assembly](https://github.com/BenPlusPlus/spinbox/issues/17)  
**Glossary:** [`CONTEXT.md`](../../CONTEXT.md)  
**ADRs:** [0001 — Remix 3 + remix/auth](../adr/0001-remix-3-and-remix-auth.md), [0002 — Hybrid Remix modules](../adr/0002-hybrid-remix-modules.md)

This document is the handoff artifact for implementing Spinbox. It compiles product and architecture decisions from the wayfinder map. It does **not** ship the app; it is the map’s destination: a design clear enough that implementation can start without reopening product or architecture questions.

---

## 1. Product summary

**Spinbox** is a household self-hosted web music player.

| Aspect | v1 commitment |
| --- | --- |
| Audience | One household, invite-only **Household members** |
| Content | One shared **Library** (Plex-structured music tree) |
| Host | Always-on **Linux** LAN host (Raspberry Pi preferred first try; host-agnostic); **not** on the Synology |
| Library storage | Synology share mounted read-only at a single `LIBRARY_ROOT` |
| Core surfaces | Browse, search, play, private playlists, vinyl-inspired **Now playing** |
| Client | Responsive web (phone on the couch is a first-class form factor) |
| Access | Private-first: household **Tailscale** tailnet HTTPS (MagicDNS + Serve → loopback) |
| Stack | **Remix 3** (`remix@next`, Node ≥ 24.3, non-React `remix/ui`) + first-party **`remix/auth`** |

### Success for v1 (implementation-complete)

A Household member on a phone or desktop, on the household tailnet, can sign in, browse the Library, play Tracks with progressive HTTP range streaming, control a multi-device **Listening session**, manage private **Playlists**, and (as Admin) invite members and run a **Scan run** — without public internet exposure of the app.

---

## 2. Key Decisions

| # | Decision | Rationale (short) | Source |
| --- | --- | --- | --- |
| K1 | **Remix 3 + `remix/auth`**; Better Auth out for v1 | One cookie/session stack; Fetch router + file/range helpers; learn Remix 3 | [#18](https://github.com/BenPlusPlus/spinbox/issues/18), ADR 0001 |
| K2 | **Hybrid project shape**: Remix entrypoints + deep `app/modules/*` | Deep modules, shallow controllers; single package | [#19](https://github.com/BenPlusPlus/spinbox/issues/19), ADR 0002 |
| K3 | **App host separate from Synology**; `LIBRARY_ROOT` only; RO hard in prod | NAS holds files; app is host-agnostic Linux service | [#8](https://github.com/BenPlusPlus/spinbox/issues/8) |
| K4 | **Path-identity Tracks**; Artist/Album/Album artist as display strings | Matches Plex-style libraries without entity CRUD | [#12](https://github.com/BenPlusPlus/spinbox/issues/12) |
| K5 | **Extension allowlist + ignore gates**; hide by rename off-allowlist | Predictable membership; no library-local ignore file | [#9](https://github.com/BenPlusPlus/spinbox/issues/9) |
| K6 | **Originals only** streaming (no FFmpeg); stream-source seam for later | Household library mostly browser-native; avoid pipeline complexity | [#11](https://github.com/BenPlusPlus/spinbox/issues/11) |
| K7 | **SQLite** one DB under app data dir (never under Library) | Single-host household; one backup unit; RO Library | [#13](https://github.com/BenPlusPlus/spinbox/issues/13) |
| K8 | **In-process media** `/media/tracks/:trackId`; cookie auth every GET/range | Same-origin progressive `<audio>`; no sidecar | [#14](https://github.com/BenPlusPlus/spinbox/issues/14) |
| K9 | **Listening session** shared across a member’s devices (LWW) | Couch + phone without device-bound queues | [#12](https://github.com/BenPlusPlus/spinbox/issues/12) |
| K10 | **Invite-only** after empty-DB first Admin; multi-Admin; 7-day invites | Household trust model without open signup | [#10](https://github.com/BenPlusPlus/spinbox/issues/10) |
| K11 | **Tailscale** MagicDNS HTTPS via Serve → loopback; `SPINBOX_PUBLIC_URL` sole origin | Private-first; one origin for cookies; no Funnel as v1 | [#15](https://github.com/BenPlusPlus/spinbox/issues/15) |
| K12 | **Vinyl** Now playing centerpiece: Classic deck (desktop) + Phone stack (mobile); full route + mini-dock | Prototype direction; product centerpiece | [#7](https://github.com/BenPlusPlus/spinbox/issues/7) |
| K13 | **Browse shell**: Library home landing; Artists\|Albums\|Tracks (default Albums); play-into-session smart defaults | Couch-usable IA | [#16](https://github.com/BenPlusPlus/spinbox/issues/16) |

---

## 3. Domain model

Canonical language lives in [`CONTEXT.md`](../../CONTEXT.md). Implementers must use glossary terms in code comments, UI copy drafts, and schema names where practical.

### Core concepts

```
Household
  └── Household member ─── role: Member | Admin
        ├── Invite (Admin mints; redeem → Member)
        ├── Listening session (1 per member; multi-device LWW)
        │     ├── current Track, playhead, play/pause, shuffle, repeat
        │     └── Play queue (ordered upcoming)
        ├── Listen resume (per Track + last-active)
        ├── Recently played (last 50 distinct Tracks)
        └── Playlist* (owner-private; ordered entries)
              └── Missing track entries when index Track pruned

Library (1 per deployment; files under LIBRARY_ROOT)
  └── Track* (identity = library-relative path)
        ├── tags/path → Artist, Album, Album artist (display strings)
        └── disc/track numbers, duration, MIME, mtime/size fingerprint
  └── Scan run (≤1 active; prune only after successful full walk)
```

### Identity and rules of note

- **Track identity** is the normalized library-relative path. Move/rename ⇒ different Track.
- **Artist / Album / Album artist** are **not** first-class durable entities; browse groups by resolved strings.
- **Multi-disc**: attributes on Track only; sort disc then track number.
- Empty metadata fallbacks: `Unknown artist`, `Unknown album`; title ← filename stem.
- **Playlist** ≠ **Play queue**. Playlists are curated and private; the queue lives inside the Listening session.
- **Missing track**: playlist row kept, shown missing, skipped on play until owner removes it.
- **Scan run**: second start rejected while one is active; failed/partial walks never mass-delete Tracks.

---

## 4. Architecture

### Runtime topology

```
[Member devices on household tailnet]
        │  HTTPS MagicDNS (e.g. https://spinbox.<tailnet>.ts.net)
        ▼
[Tailscale Serve]  ──TLS terminate──►  127.0.0.1:PORT  (app loopback only)
                                              │
                    ┌─────────────────────────┴─────────────────────────┐
                    │  Long-lived Node ≥ 24.3 — Remix 3 app (single process) │
                    │  modules: config · auth · library · media · playback · playlists │
                    └─────────────┬───────────────────────────┬─────────┘
                                  │                           │
                    SPINBOX_DATA_DIR/*.sqlite          LIBRARY_ROOT (RO mount)
                    (writable app state)               → Synology music share
```

### Process boundaries

| Concern | v1 |
| --- | --- |
| HTTP + SSR + actions | In-process Remix |
| Auth cookies / sessions | In-process `remix/auth` + cookie sessions |
| Scan run | **In-process** behind library seam (HTTP must not stay open for full walk) |
| Media streaming | **In-process** media module (no sidecar) |
| Mount of Library | **OS-level** (NFS/SMB/etc. — operator choice); app never speaks SMB/NFS |
| Multi-process writers | Not assumed — single Node writer default (SQLite WAL) |

### Module inventory

| Module | Owns |
| --- | --- |
| `config` | Typed env (`LIBRARY_ROOT`, `SPINBOX_DATA_DIR`, `SPINBOX_PUBLIC_URL`, `PORT`, allowlist/skip overrides); fail-fast at boot |
| `auth` | `remix/auth` wiring, credentials, cookie sessions, roles, invites, member lifecycle |
| `library` | Track index, membership/ignore rules, tag/path resolution, Scan run lifecycle + in-process adapter |
| `media` | Authenticated range delivery, weak ETag / status map, **stream-source** seam (v1 = original under `LIBRARY_ROOT`) |
| `playback` | Listening session, Play queue, Listen resume, Recently played |
| `playlists` | Owner-private playlists and Missing track entries |

Browse shell and vinyl Now playing are **not** domain modules: they live in `app/ui` and `app/assets` and talk to modules only through HTTP actions / server render paths.

### Seams (stable interfaces)

1. **Scan (`library`)**  
   - `startScan(admin) → Result`  
   - `getScanStatus() → idle | running | last result`  
   - At most one active Scan run.  
   - v1 adapter: in-process walk; worker extractable later without rewriting callers.

2. **Stream-source (`media`)**  
   - `resolveSource(trackRef) → source` (v1: absolute path under `LIBRARY_ROOT` + MIME from index)  
   - `serveTrack` owns auth check, 401/404/503, `createFileResponse` / `LazyFile`.  
   - `media` asks `library` for path/metadata — no cross-module raw table access.

### Project tree (design assumption)

```
spinbox/
  package.json                 # single package (no workspace monorepo in v1)
  server.ts
  app/
    routes.ts
    router.ts
    actions/                   # thin controllers → modules
    middleware/
    assets/                    # client entries (now-playing, dock, …)
    ui/                        # shell + vinyl presentational
    data/                      # SQLite connection, schema, versioned migrations
    modules/
      config/
      auth/
      library/
      media/
      playback/
      playlists/
  public/
  test/
  docs/
    design/spinbox-v1.md       # this document
    adr/
  CONTEXT.md
```

### Rules of the road

1. Actions and middleware stay shallow — product logic in modules.
2. No cross-module raw table access; modules expose query/command APIs.
3. `app/data` is infrastructure; product APIs live on modules.
4. Client islands never import `app/modules/*`; they call routes/actions.
5. UI never writes Library files; production Library mount is RO-hard.

Full rationale: ADR 0002.

---

## 5. Configuration and host

### Environment / config (minimum)

| Variable | Role |
| --- | --- |
| `LIBRARY_ROOT` | Absolute path to Library tree (dev default: local folder) |
| `SPINBOX_DATA_DIR` | Writable app data (SQLite lives here; never under Library) |
| `SPINBOX_PUBLIC_URL` | Sole canonical origin (scheme+host[+port]) for cookies, redirects, absolute links |
| `PORT` / `SPINBOX_PORT` | Loopback listen port behind Tailscale Serve |

Optional ops config (file and/or env, **no admin UI**): extension allowlist, directory skip names, path globs for scan scope.

### Host and mount

- Always-on **Linux** app host; **not** on Synology (hard).
- Raspberry Pi preferred first attempt when ready; design remains host-agnostic.
- Prefer **64-bit** OS for Node ≥ 24.3.
- Mount protocol **agnostic** (NFS/SMB/etc.); credentials **OS-level only** (never in app env/repo).
- Production: **RO** mount and RO export when the protocol allows.
- App **starts without** a healthy mount and degrades cleanly (shell/index from SQLite stay up; media returns 503 when Library unhealthy).
- Near term: **dev only** until host is provisioned. Dev: local folder default; optional real-NAS mount for integration tests.

### Origin and cookies

- Production origin comes **only** from `SPINBOX_PUBLIC_URL` — do not invent origin from `Host` / `X-Forwarded-*` for security-sensitive behavior.
- Dev: HTTP `localhost` OK (non-`Secure` cookies).

---

## 6. Data store

| Concern | Commitment |
| --- | --- |
| Engine | **SQLite**, one database file under `SPINBOX_DATA_DIR` |
| Access layer | Prefer `remix/data-schema` + `remix/data-table` / sqlite; stable contract = **SQL schema + one file** |
| Auth sessions | **Cookie** sessions for auth |
| Playback durability | Listening session, queue, resume, recent **always in SQLite** |
| Migrations | Versioned SQL in repo; apply on start and/or migrate CLI before serve |
| Backup | Ops file-copy / SQLite backup only — **no** backup UI |
| Concurrency | WAL + short `busy_timeout`; single Node writer default |

### Logical tables (sketch — implementer refines)

Illustrative, not final SQL:

| Area | Tables (sketch) |
| --- | --- |
| Auth | `members`, `credentials`, `invites`, optional session epoch/flag support |
| Library | `tracks` (path PK/id, metadata columns, mtime, size, mime), `scan_runs` |
| Playback | `listening_sessions`, `play_queue_items`, `listen_resume`, `recently_played` |
| Playlists | `playlists`, `playlist_items` (nullable track ref + missing marker / path snapshot as needed) |

**Track id:** stable opaque id in the index (URL-safe) mapping to path — media URL uses id, not raw path. Path remains identity for scan upsert/prune.

---

## 7. Auth and household membership

**Mechanism:** `remix/auth` credentials + app-owned invite/role tables (not Better Auth).

### Bootstrap

1. Empty DB → one-time **setup** creates the first **Admin** (email + password, optional display name).
2. Once any member exists, setup is gone until DB wipe/restore — **invite-only** thereafter.

### Credentials

- Email + password only (unique email); optional display name.
- No magic link; no self-serve email password reset in v1.
- Forgotten password: Admin sets temporary password / forces reset; member changes after sign-in.
- Non-admin self-service: change own password only.

### Invites

- Admin mints single-use links; default **7-day** expiry; revocable while unused.
- Optional email hard-bound at accept; if omitted, open single-use link.
- Accept creates **Member** only; Admin only via promote after join.

### Roles and lifecycle

- Multiple Admins; cannot demote/remove/disable the **last** Admin.
- **Admin-only:** invites; disable / re-enable / hard-delete; promote/demote; Scan now + scan status.
- **Disable** (default remove): block sign-in, end sessions, retain app data.
- **Hard delete**: permanent member + app data removal.
- **Not in app UI:** `LIBRARY_ROOT`, mount, backup.
- Last-Admin lockout: **host-local CLI/script** recovery (not a network backdoor).

### Auth shell

Separate from app chrome: setup, login, invite accept — no sidebar, tabs, or dock. After cookie → **Library home**.

---

## 8. Library indexing and Scan run

### Membership gates (all must pass)

1. Not a symlink (do not follow).
2. Not under skipped directory segments (case-insensitive): `@eaDir`, `#recycle`, `#snapshot`, `.SyncArchive`, `lost+found`, **any `.`-prefixed directory**.
3. Basename not hidden / junk: no leading-dot basenames; skip `Thumbs.db`, `desktop.ini` if hit.
4. Extension on allowlist (case-insensitive):  
   `mp3`, `m4a`, `mp4`, `flac`, `ogg`, `opus`, `wav`, `aac`, `aiff`, `aif`, `wma`
5. Sidecars / non-audio are not Tracks.

**Hide without delete:** rename so extension leaves allowlist. No `.spinboxignore` in the media tree. Ops may override allowlist, skip dirs, path globs via **app** config only.

### Indexing strategy

- Prefer allowlisted directory walk + **mtime/size** incremental re-parse.
- Metadata: tags when present, else Plex-style path; library: `music-metadata` (research: `research/plex-library-indexing`).
- Layout expectation: Plex-compatible music folder structure under `LIBRARY_ROOT`.

### Scan run

- Admin-visible job: manual **Scan now** (and optional schedule later if cheap — not required for first ship).
- At most one active; concurrent start rejected / no-op.
- **Prune** missing paths only after a **successful full walk**.
- Coarse status in Admin Settings: **idle / running / last result** (rich progress copy deferred).
- HTTP request must not block for the full walk (background in-process work + poll status).

---

## 9. Formats and delivery policy

### v1 playback policy

- Stream **Library originals only** — no remux, no transcode, no FFmpeg.
- Best-effort play on the full index; some browser/codec pairs may fail.
- Unplayable UX: clear error on Now playing / queue; **stay** on Track; **manual** skip; no auto-skip.
- No required `canPlayType` preflight (optional polish later).

### Deferred (not in v1 PR plan as features)

1. Server remux / transcode  
2. Remote lossy ladder for large lossless  
3. Client capability grey-out  
4. Background derivatives (if ever: **app cache only**, never into RO Library)

Design the **stream-source** seam so a future pipeline plugs in without reshaping core modules.

---

## 10. Audio delivery

| Concern | Commitment |
| --- | --- |
| Server | In-process Remix/Node only |
| Auth | Session cookie, same-origin; re-check on **every** GET including ranges |
| URL | `/media/tracks/:trackId` |
| Player | Progressive `<audio src>` (or equivalent); no MSE/blob pipeline in v1 |
| Range | HTTP 206 via `createFileResponse` / `LazyFile` (or equivalent) |
| Cache headers | `Cache-Control: private, no-cache` (or short max-age + revalidate); **weak ETag** (size-mtime); honor `If-None-Match` / `If-Range`; never public/CDN cache |
| Content-Type | From **index** (set at scan time) |

### Status codes

| Case | Code |
| --- | --- |
| Not signed in / dead session | **401** |
| Unknown Track / missing file / path jail | **404** |
| Mount / Library unhealthy | **503** |

Player maps any non-2xx to “can’t play this Track” (clear error, stay, manual skip). Mid-stream blip: **one short client retry**, then same UX. App shell stays up from SQLite when media degrades.

Path resolution must jail under `LIBRARY_ROOT`.

---

## 11. Playback state

### Listening session (per Household member)

Shared across that member’s devices:

- Current Track, playhead, play/pause, shuffle, repeat  
- **Play queue** (ordered upcoming)

**Multi-device:** last-write-wins; no presence / “other device controlling” chrome.

### Listen resume

Per member, per-Track last position + **last-active** continue target. May outlive Recently played.

### Recently played

Ring of last **50 distinct** Tracks — light continue-listening UI, not a scrobble log.

### Play-into-session defaults (shell)

- One-tap **container** (Album, Playlist, Artist track list): **replace queue** and play (from start or from tapped track in container order).
- One-tap **lone Track**: **replace queue with that single Track**.
- Long-press / ⋯: Play next, Add to queue, Add to playlist.

---

## 12. UI and UX structure

### Now playing (vinyl centerpiece)

| Form factor | Layout |
| --- | --- |
| Desktop | **Classic deck** (plinth + tonearm metaphor; metadata + transport beside platter) |
| Mobile / couch phone | **Phone stack** (vertical hero vinyl, large targets, up-next strip) |

- Motion: **per-track edge-swap** (no album “sides” as a domain concept).
- **Full-route** Now playing **plus** persistent **mini-dock** when browsing.
- Dock **hidden** when idle (no current Track).
- Prototype asset: branch `prototype/vinyl-now-playing` → `prototypes/vinyl-now-playing/index.html`.
- Implementation: `remix/ui` **client islands** in `app/assets` / `app/ui`.

### Primary destinations

- **Library**, **Playlists**, **Search**, **Settings** (Admin section for Admins only).
- Now playing: full route + mini-dock (not a primary nav tab).
- Play queue: **sheet from the dock**, not top-level nav.
- Recently played: section on **Library home**.

### Landing and chrome

- After sign-in → **Library home**.
- **Desktop:** left sidebar (Library, Playlists, Settings) + global search in top chrome; mini-dock on main shell.
- **Mobile:** bottom tabs — Library | Playlists | Search | Settings; mini-dock **above** tabs when a current Track exists.

### Library browse

- Facets: **Artists | Albums | Tracks**; default **Albums**.
- Library home: **Continue** (last-active resume) → **Recently played** strip → facet control.
- Album detail: title, album artist, tracks (disc then track), play-all / shuffle.
- Artist detail: albums for that artist string; optional tracks where track-artist matches.
- Grouping keys in URLs: encoding flexible (string groupings or opaque keys) — implementer chooses stable encoding.

### Search

One global search over Track title, Artist, Album, Album artist, **own** Playlist names. Results grouped: Tracks, Albums, Artists, Your playlists.

### Playlists

- List mine → detail (ordered tracks; **Missing track** marked) → play / play-from-track.
- Create empty, rename, delete; reorder + remove tracks; add via ⋯ elsewhere.
- **Bulk multi-select polish deferred.**

### Queue sheet (v1)

Current + upcoming; reorder upcoming; remove; clear upcoming / clear all. No “save queue as playlist” in v1. Shuffle/repeat on full Now playing.

### Settings

- **Any member:** display name, change password, sign out.
- **Admin:** members lifecycle; invites; **Scan now** + coarse last Scan run status.

### Degraded / empty states

- Empty index: empty Library home; Admin scan CTA; non-admins “ask an Admin”.
- Mount unavailable: browse last index OK; play errors per media policy; banner “Library storage unavailable”.
- Missing playlist tracks: shown, skipped on play.

### Logical routes (encoding flexible)

| Area | Routes |
| --- | --- |
| Auth | setup, login, invite accept |
| App | `/` Library home; `/library/artists|albums|tracks`; artist & album detail; `/search`; `/playlists`, `/playlists/:id`; `/now-playing`; `/settings` (+ admin) |
| Media | `/media/tracks/:trackId` |

No public share links.

---

## 13. Private-first access

| Concern | Commitment |
| --- | --- |
| Path | **Tailscale** (preferred) household tailnet |
| Addressing | **MagicDNS** hostname at home and away |
| TLS | **Tailscale Serve** (or equivalent) → app on **loopback only** |
| Devices | Every device that uses Spinbox joins the tailnet |
| Origin | Required `SPINBOX_PUBLIC_URL` |
| Auth | Invite + email/password cookies — **not** Tailscale identity |
| Media | Same-origin relative `/media/...` only |
| Break-glass | Ops only (SSH, local loopback) — no second product origin |
| Dev | HTTP localhost |

### Anti-corner-paint for a later public-HTTPS phase

1. No Funnel (or public edge) as the v1 path  
2. No hardcoded `*.ts.net` in application code  
3. Auth remains invite + password, not mesh identity  
4. Cookie model stays same-origin (one HTTPS origin)  
5. App bind default stays private  
6. Media URLs stay relative / same-origin  

Exact Serve CLI flags, ACLs, and Pi flash are **ops runbook** content (PR-10), not product code forks.

---

## 14. Out of scope (v1)

- Offline / PWA packaging  
- Lyrics, scrobbling, smart playlists, radio/autoplay stations  
- Multi-library or multi-tenant “families”  
- Video/photo (music only)  
- Native mobile apps  
- Commercial/multi-tenant SaaS packaging  
- Album “sides” as a domain concept  
- Better Auth / React Router v7 as the app framework  
- Collaborative / household-shared Playlists  
- Media sidecar, MSE pipeline, public CDN media cache  
- Backup UI, mount/LIBRARY_ROOT admin UI  
- Self-serve email password reset  

---

## 15. Open questions and deferred polish

These do **not** block starting implementation. They are recorded so implementers do not invent product policy accidentally.

| Item | Guidance |
| --- | --- |
| Scan run rich progress / error presentation | Ship coarse idle/running/last result; richer UX later |
| Playlist bulk multi-select | Basic reorder/remove/create/rename/delete is enough for v1 |
| Artwork discovery conventions | Not decided; browse may show placeholders until a later decision |
| Exact album/artist URL encoding | Implementer choice; keep stable once chosen |
| Scheduled scan | Optional convenience; not required for first ship |
| Remix 3 beta thrash | Pin `remix@next`; if beta becomes untenable, revisit ADR 0001 (likely RR framework mode) rather than silently mixing stacks |

Assembly-time defaults (reversible glue) may appear during implementation without reopening architecture: empty-state copy, minor Settings section layout, exact migration filenames, etc.

---

## 16. Research and prototype assets

| Asset | Location / ticket |
| --- | --- |
| Remix 3 fitness | Branch `research/remix-3-fitness`; [#2](https://github.com/BenPlusPlus/spinbox/issues/2) |
| Better Auth (rejected path) | Branch `research/betterauth-household`; [#3](https://github.com/BenPlusPlus/spinbox/issues/3) |
| Browser audio formats | Branch `research/browser-audio-formats`; [#4](https://github.com/BenPlusPlus/spinbox/issues/4) |
| Plex library indexing | Branch `research/plex-library-indexing`; [#5](https://github.com/BenPlusPlus/spinbox/issues/5) |
| Synology mount streaming | Branch `research/synology-audio-mount`; [#6](https://github.com/BenPlusPlus/spinbox/issues/6) |
| Vinyl Now playing prototype | Branch `prototype/vinyl-now-playing`; `prototypes/vinyl-now-playing/` |
| Stack ADR | `docs/adr/0001-remix-3-and-remix-auth.md` |
| Modules ADR | `docs/adr/0002-hybrid-remix-modules.md` |

Research branches are context, not runtime dependencies. Prefer merging useful notes into `docs/research/` during early implementation PRs if they help reviewers.

---

## 17. PR Plan

Hybrid strategy: **thin foundation PRs**, then **module vertical slices** so something reviewable and increasingly playable appears mid-stack. Each PR should be independently reviewable and leave `main` buildable (even if product-incomplete).

### Dependency DAG

```
PR-1 Scaffold
  └─► PR-2 Config + SQLite
        └─► PR-3 Auth (setup, login, invites, roles)
              ├─► PR-4 Library index + Scan run
              │     └─► PR-5 Media stream
              │           └─► PR-6 Playback session
              │                 ├─► PR-7 Browse shell
              │                 │     ├─► PR-8 Now playing (vinyl + dock)
              │                 │     └─► PR-9 Playlists
              │                 └─► PR-9 Playlists (also needs shell for full UX;
              │                        can land list APIs after PR-6 with minimal UI)
              └─► PR-10 Access & ops runbook (can parallel after PR-3; finish after PR-5+)
```

**Playable milestone:** after **PR-5 + PR-6 + minimal player chrome**, an Admin can set up, scan a local Library, and stream a Track. Full vinyl + browse polish lands in PR-7/8.

---

### PR-1 — Remix hybrid scaffold

| Field | Content |
| --- | --- |
| **Title** | Scaffold single-package Remix 3 hybrid layout |
| **Depends on** | — |
| **Delivers** | `package.json` (Node ≥ 24.3, pin `remix@next`), `server.ts`, empty `app/routes|router|actions|middleware|assets|ui|data|modules/*` stubs, smoke “hello” route, test harness stub |
| **Files** | Root package config, `server.ts`, `app/**` skeleton, README “dev only” notes |
| **Out** | Product features, real auth, Library I/O |

---

### PR-2 — Config + SQLite foundation

| Field | Content |
| --- | --- |
| **Title** | Typed config and SQLite migrations under app data dir |
| **Depends on** | PR-1 |
| **Delivers** | `config` module (fail-fast env); `app/data` connection + versioned migrations runner (start and/or CLI); empty/bootstrap schema shell; WAL pragmas; default local `SPINBOX_DATA_DIR` / `LIBRARY_ROOT` for dev |
| **Files** | `app/modules/config/**`, `app/data/**`, env example, tests for migration apply |
| **Out** | Domain tables beyond skeleton; auth UI |

---

### PR-3 — Auth and household membership

| Field | Content |
| --- | --- |
| **Title** | Invite-only auth: first Admin setup, members, invites, roles |
| **Depends on** | PR-2 |
| **Delivers** | `auth` module + `remix/auth`; empty-DB setup; login/logout; invite mint/accept/revoke; promote/demote; disable/re-enable/hard-delete; last-Admin protection; cookie sessions; auth shell routes; host-local last-Admin recovery script stub |
| **Files** | `app/modules/auth/**`, auth routes/actions, member/invite migrations, middleware for session |
| **Out** | Tailscale docs (PR-10); Library scan |

---

### PR-4 — Library index and Scan run

| Field | Content |
| --- | --- |
| **Title** | Library membership walk, Track index, Scan run seam |
| **Depends on** | PR-3 (Admin gate) |
| **Delivers** | `library` module: membership gates, allowlist, skip rules, tag/path resolution, Track upsert, Scan run single-active + success-only prune, `startScan`/`getScanStatus`, Admin Scan now + coarse status API; in-process adapter |
| **Files** | `app/modules/library/**`, tracks/scan migrations, Admin scan actions, unit tests for gates |
| **Out** | HTTP media streaming; rich scan progress UI |

---

### PR-5 — Media delivery

| Field | Content |
| --- | --- |
| **Title** | Authenticated range streaming at `/media/tracks/:trackId` |
| **Depends on** | PR-4 |
| **Delivers** | `media` module: cookie auth every GET/range; stream-source v1 (original file); weak ETag; Content-Type from index; 401/404/503 map; path jail; smoke test with fixture files |
| **Files** | `app/modules/media/**`, media route, integration tests |
| **Out** | Full player UI (minimal `<audio>` proof OK in this PR or PR-6) |

---

### PR-6 — Playback session

| Field | Content |
| --- | --- |
| **Title** | Listening session, Play queue, resume, recently played |
| **Depends on** | PR-5 (stable Track ids + playable src) |
| **Delivers** | `playback` module: session LWW APIs; queue mutations; Listen resume; Recently played (50 distinct); actions for play-into-session defaults; multi-device share via SQLite |
| **Files** | `app/modules/playback/**`, migrations, actions, tests for LWW/queue rules |
| **Out** | Vinyl chrome; full browse shell |

---

### PR-7 — Browse shell

| Field | Content |
| --- | --- |
| **Title** | App shell: Library home, facets, search, Settings chrome |
| **Depends on** | PR-6 |
| **Delivers** | Desktop sidebar + mobile tabs; Library home (Continue + Recently played + facets); Artists/Albums/Tracks + detail pages; global search; Settings (member + Admin sections wired to existing APIs); empty/degraded banners; mini-dock shell slot (may be stub until PR-8) |
| **Files** | `app/ui/**`, routes, search actions, responsive layout |
| **Out** | Full vinyl island polish |

---

### PR-8 — Now playing vinyl + mini-dock

| Field | Content |
| --- | --- |
| **Title** | Vinyl Now playing islands and persistent mini-dock |
| **Depends on** | PR-7 |
| **Delivers** | Classic deck (desktop) + Phone stack (mobile); per-track edge-swap; full-route Now playing; mini-dock with transport + queue sheet entry; wire to playback + media URLs; unplayable error UX (no auto-skip) |
| **Files** | `app/assets/**` client entries, `app/ui` vinyl components; prototype as visual reference |
| **Out** | Playlist management |

---

### PR-9 — Playlists

| Field | Content |
| --- | --- |
| **Title** | Owner-private playlists and Missing track behavior |
| **Depends on** | PR-6 (Tracks + session); **PR-7** for full list/detail UX |
| **Delivers** | `playlists` module; list/detail CRUD; reorder/remove; add-from-⋯; Missing track keep/show/skip; play playlist into session |
| **Files** | `app/modules/playlists/**`, playlist routes/UI, migrations |
| **Out** | Bulk multi-select polish |

---

### PR-10 — Access and ops runbook

| Field | Content |
| --- | --- |
| **Title** | Tailscale private access docs and host deploy notes |
| **Depends on** | PR-3 (origin/cookies real); preferably after PR-5 for end-to-end media checklist |
| **Delivers** | Ops doc: loopback bind, Tailscale Serve → app, `SPINBOX_PUBLIC_URL`, RO mount examples (protocol-agnostic), Node ≥ 24.3 host notes (Pi-first), DB backup file-copy, last-Admin recovery usage, degraded Library behavior checklist; anti-corner-paint notes for future public HTTPS |
| **Files** | `docs/ops/**` (or `docs/deploy.md`), env example updates |
| **Out** | Actual Pi provisioning (human ops); public Funnel |

---

### Suggested implementation sequence notes

1. **Keep PRs green:** feature flags not required if incomplete UI simply lacks routes until later PRs.  
2. **Dev Library:** fixture tree under e.g. `test/fixtures/library` for CI.  
3. **Prototype port:** PR-8 ports behavior/look from `prototype/vinyl-now-playing`, not a pixel-perfect freeze.  
4. **No FFmpeg phase** in this DAG — only the stream-source seam in PR-5.  
5. **Execution effort** is separate from this map; this plan is the ordered decision about *how* to build, not the build itself.

---

## 18. Definition of done for this design

This design is **build-ready** when:

1. Implementers can pick up PR-1 without reopening stack, host topology, domain identity, auth model, media contract, or access model.  
2. Glossary + ADRs + this document agree.  
3. Deferred items are listed (not silently assumed).  

Remaining product polish in §15 may be decided during implementation only when it does not reverse K1–K13.

---

## Document history

| Date | Change |
| --- | --- |
| 2026-08-08 | Initial assembly from wayfinder map decisions ([#17](https://github.com/BenPlusPlus/spinbox/issues/17)) |
