# Remix 3 + first-party `remix/auth` as Spinbox stack

Spinbox needs a full-stack foundation for authenticated SSR, household invite-only access, and HTTP range audio from a local library. We commit to **Remix 3** (`remix@next`, long-lived Node ≥ 24.3, `remix/ui` — not React) and **first-party `remix/auth` + app-owned invite/admin**, and we **do not** use Better Auth for v1.

Remix 3 is officially beta; we accept that risk to learn the framework and to use its Fetch router and first-class file/range helpers (`createFileResponse` / `LazyFile`). Better Auth fits household auth well, but its documented path is React Router v7, and mounting it on Remix 3 would mean DIY glue and a second session story alongside Remix’s own auth/session packages. Dropping Better Auth keeps one cookie/session stack on the chosen framework.

## Considered options

- **A. Remix 3 + DIY Better Auth mount** — rejected: beta cost *plus* integration glue and dual-session risk.
- **B. Remix 3 + `remix/auth`** — **accepted.**
- **C. React Router v7 + Better Auth** — rejected for this effort: production-stable React path, but abandons Remix 3 learning goal and first-party media helpers.

## Consequences

- Design and PR plan assume **non-React** UI (`remix/ui`, client islands) for browse and vinyl Now playing.
- Invite-only signup, household **admin** (scan/invites), and member roles are **app domain + `remix/auth` credentials**, not Better Auth admin/organization plugins.
- Host image must run **Node ≥ 24.3**; pin exact `remix@next` beta and re-evaluate often.
- Audio delivery should prefer Remix file/range primitives; no plan to port UI to React later for free.
- Fallback if beta becomes untenable mid-build: revisit this ADR (likely RR framework mode) rather than silently mixing stacks.
