# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

One household: a few adults with mixed tech comfort, all invite-only Household members. Common scenes are a phone on the couch and a desktop browser. A shared living-room TV driven by a desktop browser is a welcome use (large display, viewed from across the room). Admins additionally invite members, manage member lifecycle, and run Scan runs.

## Product Purpose

Spinbox is a self-hosted web music player for the household's own collection: one shared Library (Plex-structured tree on a NAS), browsed, searched, queued, and played from any member's devices over the private tailnet. Success: any member can sign in, find something, and have it playing in a few taps, and the Listening session follows them across devices.

## Positioning

It's ours: a small, private, ritual-feeling way to play our own collection, like putting on a record, not a streaming-service clone. The vinyl Now playing (spinning record, tonearm, per-track edge-swap) is the product's centerpiece and must survive any redesign.

## Operating Context

- Phone on the couch (touch, one hand, large targets); desktop browser; desktop browser on a shared TV (viewed at distance).
- Private-first: reached only over the household Tailscale tailnet via `SPINBOX_PUBLIC_URL`; no public internet exposure.
- Library is read-only from the app; Admin Scan runs index it. Mount can be unhealthy; the shell keeps working from SQLite.

## Capabilities and Constraints

- Stack: Remix 3 (`remix@next`, `remix/component`, not React), Node ≥ 24.3, SQLite. Styling via `css()` mixins in `app/ui` and `app/assets`; client islands via `clientEntry`.
- Surfaces: auth shell (setup, login, invite accept); Library home (Continue, Recently played, Artists|Albums|Tracks facets, default Albums); Artist and Album detail; Search (Tracks, Albums, Artists, Your playlists); Playlists list/detail with Missing tracks; Settings (member + Admin: members, invites, Scan now/status); full-route Now playing plus persistent mini-dock with Play queue sheet.
- Navigation: desktop left sidebar + top search; mobile bottom tabs (Library | Playlists | Search | Settings) with mini-dock above tabs.
- Playback rules: originals only, no transcode; unplayable Track shows a clear error, stays, manual skip only.
- Terminology from `CONTEXT.md` is binding in UI copy (Track, Album, Album artist, Play queue, Listening session, Scan run, Household member, Invite, Disable, Hard delete).
- Undecided: artwork discovery (albums may show placeholders until decided).

## Brand Commitments

- Name: Spinbox.
- Vinyl-inspired Now playing: Classic deck on desktop, Phone stack on mobile, spinning record, per-track edge-swap motion.
- No album "sides" as a concept.

## Evidence on Hand

- Product and architecture: `docs/design/spinbox-v1.md`, `CONTEXT.md`, `docs/adr/`.
- Fixture Library: `test/fixtures/library` (one `cover.jpg` exists; no real artwork pipeline yet).
- No testimonials, metrics, or public claims exist; none should be invented.

## Product Principles

1. Ritual over feed: playing music should feel deliberate and warm, not like an algorithmic catalog.
2. Couch-first, desk-equal: every action works one-handed on a phone and reads well on a desktop or TV.
3. It's ours: private, household-scale, no streaming-service tropes (no recommendations, no promos).
4. Honest state: degraded Library, Missing tracks, and unplayable Tracks are shown plainly, never hidden.

## Accessibility & Inclusion

WCAG 2.2 AA. Respect `prefers-reduced-motion` (spinning record and edge-swap must have calm fallbacks). Touch targets ≥ 44px.
