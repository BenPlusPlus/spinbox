# Research: Better Auth for invite-only household access

**Ticket:** [#3 — BetterAuth for invite-only household access](https://github.com/BenPlusPlus/spinbox/issues/3)  
**Map:** [#1 — Spinbox design + PR plan](https://github.com/BenPlusPlus/spinbox/issues/1)  
**Branch:** `research/betterauth-household`  
**Date:** 2026-08-08  
**Sources:** primary only — [Better Auth docs](https://better-auth.com/docs) and [better-auth/better-auth](https://github.com/better-auth/better-auth) (published MDX under `docs/content/docs/`). Cross-read with map ticket [#2 Remix 3 fitness](https://github.com/BenPlusPlus/spinbox/issues/2) / `docs/research/remix-3-fitness.md` (sibling research branch) where framework stack intersects auth.

---

## Question

How should Spinbox use Better Auth for a small household: invite-only onboarding, email/password and/or magic link, sessions/cookies on a self-hosted web app, and an admin-capable member role?

Cover framework integration options relevant to Remix 3 (or closest supported Remix/React Router stack), database adapters commonly used, and any gaps that would force a different auth approach.

## Spinbox constraints (from map + domain)

- One **household** Library; **household members** sign in; **admin** is a capability on a member (invites + scan control), not a separate product.
- Invite-only signup; self-hosted always-on LAN host; private-first access (public HTTPS later).
- Map stack leaning: Remix 3 + Better Auth (neither locked until research/design tickets close).

---

## Executive recommendation

**Better Auth is a solid fit for Spinbox household auth** if Spinbox runs on a **standard Web Fetch + cookie** host and accepts **composing** invite-only from core options + the **admin** plugin (and a small app-owned invite surface). Prefer:

| Concern | Recommendation |
| --- | --- |
| Product model | Single app identity store (not multi-tenant org plugin) |
| Public signup | **Off** — `emailAndPassword.disableSignUp: true` (+ magic-link `disableSignUp: true` if magic link is enabled) |
| Roles | **Admin plugin** — default `admin` / `user` roles; bootstrap first admin via seed or `adminUserIds` |
| Invites | **App-owned invite tokens** (or admin `createUser` + set-password / magic-link delivery); do **not** adopt the Organization plugin solely for household invites |
| Sign-in methods | **Email/password** as baseline; **magic link** optional if outbound email is reliable |
| Sessions | Default **cookie sessions** (`session_token`); same-origin app + `/api/auth` |
| Database | **SQLite** (`better-sqlite3` / Kysely built-in) for single-host household; Drizzle adapter if the app already standardizes on Drizzle |
| Framework | Official polished path: **React Router v7** (and Remix v2-style resource routes). **Remix 3: no official integration** — mount `auth.handler` on Fetch routes + vanilla client; budget glue work (see § Framework). |

**Bottom line:** Stay with Better Auth for invite-only household + admin role **unless** the chosen app framework forces dual session systems or rejects Fetch handlers — then prefer the framework’s first-party auth (`remix/auth` on Remix 3) over fighting two cookie stacks.

---

## 1. What Better Auth is (primary)

- Framework-agnostic TypeScript auth library: users, accounts, sessions, plugins ([repo README](https://github.com/better-auth/better-auth); [installation](https://better-auth.com/docs/installation)).
- Server: `betterAuth({…})` → `auth.handler(request)` for Web standard `Request`/`Response` ([installation — mount handler](https://better-auth.com/docs/installation)).
- Client: `createAuthClient` from framework packages (`better-auth/react`, vanilla `better-auth/client`, etc.) ([installation](https://better-auth.com/docs/installation); [basic usage](https://better-auth.com/docs/basic-usage)).
- Env: `BETTER_AUTH_SECRET` (≥ 32 chars, high entropy), `BETTER_AUTH_URL` / `baseURL` ([installation](https://better-auth.com/docs/installation); [options](https://better-auth.com/docs/reference/options)).
- Docs version observed in sources: **v1.6** line on better-auth.com; monorepo at [github.com/better-auth/better-auth](https://github.com/better-auth/better-auth).

---

## 2. Framework integration

### 2.1 Closest supported stack: React Router v7 (ex–Remix path)

Primary: [React Router v7 Integration](https://better-auth.com/docs/integrations/react-router) (`docs/content/docs/integrations/react-router.mdx`).

Official callout:

> React Router v7 is the successor to Remix. If you're using Remix v2, the main difference is changing your imports from `@remix-run/*` to `react-router`. The APIs remain the same.

Documented wiring:

1. **Server instance** — e.g. `app/lib/auth.server.ts` exporting `auth = betterAuth({…})`.
2. **Resource route** — `app/routes/api.auth.$.ts`:

```ts
// React Router v7
import type { LoaderFunctionArgs, ActionFunctionArgs } from "react-router"
// Remix v2: from "@remix-run/node"

export async function loader({ request }: LoaderFunctionArgs) {
  return auth.handler(request)
}
export async function action({ request }: ActionFunctionArgs) {
  return auth.handler(request)
}
```

3. **Client** — `createAuthClient` from **`better-auth/react`**.
4. **SSR session** — in loaders, pass request headers ([basic usage — server side](https://better-auth.com/docs/basic-usage)):

```ts
const session = await auth.api.getSession({
  headers: request.headers,
})
```

Installation docs also list `react-router` among mount-handler tabs and note Remix v2 import path parity ([installation](https://better-auth.com/docs/installation)).

**Example apps:** [better-auth/examples](https://github.com/better-auth/examples) includes `react-router-example/`.

### 2.2 Remix 3 (map leaning) — gap, not a first-class path

Better Auth’s curated integration docs cover Next, Nuxt, SvelteKit, **React Router**, SolidStart, Hono, Express, Elysia, TanStack Start, Expo, Cloudflare Workers, etc. ([installation mount tabs](https://better-auth.com/docs/installation)). **There is no “Remix 3” guide.**

Compatible **in principle** because:

- Handler is standard Fetch `Request` → `Response`.
- Vanilla client exists (`better-auth/client`) without React.

Remix 3 research (ticket #2 / `docs/research/remix-3-fitness.md` on branch `research/remix-3-fitness`) already flags:

- Mount `auth.handler` next to Remix Fetch routes.
- Prefer **vanilla** client in client islands — **not** `better-auth/react` if UI is non-React `remix/ui`.
- Risk of **dual session cookies** if also using `remix/session` / `remix/auth`.
- Alternative: first-party `remix/auth` + app user store.

**Implication for Spinbox design:**

| App stack decision | Better Auth posture |
| --- | --- |
| **React Router v7 framework mode** (stable “old Remix” lineage) | **Supported** — follow official RR guide; lowest integration risk |
| **Remix v2** | Supported as RR-shaped loaders/actions with `@remix-run/*` imports |
| **Remix 3 beta** | **DIY mount** only; no polished docs; cookie/session ownership must be single-stack; client is vanilla JS |
| **Remix 3 + remix/auth only** | Exit Better Auth for v1 simplicity (valid if invite/admin are small app features) |

### 2.3 Self-hosted same-origin cookies

Cookie model: signed cookies; session token in cookie; production cookies `httpOnly` + `secure` ([cookies](https://better-auth.com/docs/concepts/cookies); [session management](https://better-auth.com/docs/concepts/session-management)).

For a single self-hosted origin serving UI and `/api/auth/*`:

- Sessions are **first-party** — Safari ITP third-party cookie failures described in the cookies docs apply mainly to **split frontend/API domains**.
- Set `baseURL` / `BETTER_AUTH_URL` explicitly to the household URL (LAN name, Tailscale hostname, or later public HTTPS) ([options — baseURL](https://better-auth.com/docs/reference/options)).
- `trustedOrigins` for any additional hosts (e.g. `http://localhost:*` during dev; Tailscale MagicDNS hostname) ([options — trustedOrigins](https://better-auth.com/docs/reference/options)).
- Force secure cookies only when HTTPS is actually used (`advanced.useSecureCookies`); plain HTTP on LAN needs non-secure cookies or local TLS ([cookies](https://better-auth.com/docs/concepts/cookies)).

---

## 3. Invite-only onboarding

### 3.1 There is no dedicated “invite-only app” product mode

Better Auth does **not** ship a single switch named “household invite only.” Invite-style behavior is composed from:

1. **Disable open signup** on auth methods that can create users.
2. **Admin user management** and/or **app-level invite records**.
3. Optionally the **Organization** plugin’s invitation APIs (multi-tenant oriented).

### 3.2 Disable public signup (required baseline)

**Email/password** ([email-password](https://better-auth.com/docs/authentication/email-password); [options — emailAndPassword](https://better-auth.com/docs/reference/options)):

```ts
emailAndPassword: {
  enabled: true,
  disableSignUp: true, // default false
}
```

Documented option: `disableSignUp` — “Disable email and password sign up” (default `false`). Error reference: [signup_disabled](https://better-auth.com/docs/reference/errors/signup_disabled) (also shows `databaseHooks.user.create.before` allowlists).

**Magic link** ([magic link plugin](https://better-auth.com/docs/plugins/magic-link)):

- Default: **auto sign-up** if the email is unknown, unless `disableSignUp: true`.
- For invite-only: always set **`disableSignUp: true`** on the plugin if magic link is only for returning members.

If either path leaves signup open, the household is not invite-only.

### 3.3 Recommended household invite patterns

#### Pattern A — Admin creates members (smallest Better Auth surface)

Use **admin plugin** `createUser` (password + email + name + optional `role`) ([admin](https://better-auth.com/docs/plugins/admin)).

Flow:

1. Bootstrap one admin (seed script / env `adminUserIds` / first deploy).
2. Admin creates household member accounts.
3. Deliver credentials out-of-band **or** send password-reset / magic-link email so the member sets/uses a login without the admin knowing a long-term password.

**Pros:** Fully documented APIs; no custom tables for invite tokens.  
**Cons:** Weak “invite link” UX unless you add email for reset/magic link; temporary passwords are operationally awkward.

#### Pattern B — App-owned invite tokens + gated sign-up (best household UX)

App tables (or rows): `invite` = token, email, role (`admin`|`user`), expiresAt, invitedBy, consumedAt.

Flow:

1. Keep **`disableSignUp: true`** on public endpoints **or** keep signup enabled only through a **before hook** that requires a valid unconsumed invite (hooks docs show path checks on `/sign-up/email` and domain allowlists — same mechanism) ([hooks](https://better-auth.com/docs/concepts/hooks); [database hooks](https://better-auth.com/docs/concepts/database#database-hooks); [signup_disabled](https://better-auth.com/docs/reference/errors/signup_disabled)).
2. Accept-invite page: validate token → call controlled sign-up (client `signUp.email` only after server validates invite, or server `auth.api` create path) → mark invite consumed → set role via admin API or `databaseHooks.user.create`.
3. Admins mint invites; only admins hit invite-create routes (check session `user.role` / admin plugin permissions).

**Pros:** Real invite links; fits “admin members for invites.”  
**Cons:** App-owned; Better Auth does not generate the invite table for you.

#### Pattern C — Organization plugin invitations (usually wrong for Spinbox)

Primary: [Organization plugin](https://better-auth.com/docs/plugins/organization).

Capabilities:

- `sendInvitationEmail`, `invite-member`, `accept-invitation`, cancel/reject/list ([organization — Invitations](https://better-auth.com/docs/plugins/organization)).
- Default invitation TTL: **`invitationExpiresIn` 48 hours**.
- Roles: org-level `owner` / `admin` / `member` (separate from admin **plugin** global roles).
- Accept requires a **logged-in** session (`acceptInvitation` after login).
- Extra tables: organization, member, invitation (+ teams if enabled).
- Tunables: `allowUserToCreateOrganization`, `membershipLimit` (default 100), etc.

**Why not for a single household Library:** Spinbox is **one household, one Library**, not multi-tenant orgs. Org invites still leave **how the account is first created** to you (signup gate still required). You inherit org/active-org session concepts that do not map to domain language (**household member**, **admin** capability).

**Use only if** product expands to multi-household tenancy (explicitly out of map scope today).

### 3.4 Bootstrap the first admin

Documented options on admin plugin ([admin — Options](https://better-auth.com/docs/plugins/admin)):

- `adminUserIds: ["…"]` — listed IDs can perform admin operations.
- `defaultRole` (default `"user"`), `adminRoles` (default `["admin"]`).
- Or seed: create first user with `role: "admin"` via server-side admin/create during deploy.

Do not leave open signup solely to create the first admin in production.

---

## 4. Email/password and magic link

### 4.1 Email/password (core)

[Email & password](https://better-auth.com/docs/authentication/email-password):

- Enable: `emailAndPassword: { enabled: true }`.
- Client: `authClient.signUp.email` / `signIn.email` (sign-up disabled in invite-only mode).
- Options of note: `minPasswordLength` (default 8), `requireEmailVerification`, `autoSignIn`, `sendResetPassword`, `disableSignUp` ([options](https://better-auth.com/docs/reference/options)).
- Enumeration protection when `requireEmailVerification` or `autoSignIn: false` ([email-password](https://better-auth.com/docs/authentication/email-password)).

**Spinbox lean:** Enable password auth for LAN reliability when email is flaky. Password reset needs **outbound email** (`sendResetPassword`) — same operational dependency as magic links.

### 4.2 Magic link (plugin)

[Magic link](https://better-auth.com/docs/plugins/magic-link):

```ts
plugins: [
  magicLink({
    sendMagicLink: async ({ email, token, url, metadata }, ctx) => {
      // app sends email
    },
    disableSignUp: true, // invite-only
    expiresIn: 300, // default 5 minutes
  }),
]
```

- Client plugin: `magicLinkClient()`; `signIn.magicLink({ email, … })`.
- Metadata can carry app data (docs example: `metadata: { inviteId: "123" }`) — useful if invite acceptance is tied to the link send path.
- Verification is **single-use** (docs note atomic consume; `allowedAttempts` deprecated/ignored).
- Requires **BYO email** (`sendMagicLink`); Better Auth does not host mail ([email concept — bring your own provider](https://better-auth.com/docs/concepts/email)).

### 4.3 Self-hosted email reality

[Email](https://better-auth.com/docs/concepts/email): verification, reset, and magic link all assume an app-supplied sender (docs mention providers such as Resend as examples — still external to Better Auth).

For Spinbox private-first LAN:

| Mail available? | Practical auth mix |
| --- | --- |
| Yes (SMTP/Resend/etc.) | Password + optional magic link + email invite links |
| No / unreliable | Password only; admin-created accounts or LAN-local invite acceptance without email (show token/URL in admin UI for copy-paste) |

Magic link is **not free** of infrastructure: without outbound mail it is not a household login path.

---

## 5. Sessions and cookies (self-hosted web app)

Primary: [Session management](https://better-auth.com/docs/concepts/session-management), [Cookies](https://better-auth.com/docs/concepts/cookies).

### Model

- **Cookie-based sessions**; session row holds `token`, `userId`, `expiresAt`, `ipAddress`, `userAgent`.
- Cookie carries session token (`session_token`; prefix default `better-auth`).
- Default expiry: **`expiresIn` 7 days**, sliding refresh via **`updateAge` 1 day**.
- **Freshness** (`freshAge`, default 1 day) gates sensitive operations.
- Optional **`session.cookieCache`** — short-lived signed session payload to avoid DB hit on every `getSession`.
- Stateless-without-DB mode exists but **most plugins need a database** ([installation](https://better-auth.com/docs/installation); [session — stateless](https://better-auth.com/docs/concepts/session-management)).

### Client / server access

- Client: `authClient.useSession()`, `getSession()`, `signOut()`, list/revoke sessions ([basic usage](https://better-auth.com/docs/basic-usage); [session management](https://better-auth.com/docs/concepts/session-management)).
- Server: `auth.api.getSession({ headers })` with framework request headers ([basic usage](https://better-auth.com/docs/basic-usage)).

### Spinbox settings lean

```ts
session: {
  expiresIn: 60 * 60 * 24 * 14, // optional longer couch sessions
  updateAge: 60 * 60 * 24,
  // cookieCache: { enabled: true, maxAge: 5 * 60 } // optional
}
```

Protect media routes the same way as HTML routes: every range request must see the session cookie (or a deliberate short-lived signed media URL design — out of Better Auth’s core).

---

## 6. Admin-capable household member role

Primary: [Admin plugin](https://better-auth.com/docs/plugins/admin).

### Capabilities that map to Spinbox

| Spinbox need | Admin plugin |
| --- | --- |
| Distinguish admin members | `user.role` (`admin` / `user` by default) |
| Create members | `createUser` |
| Promote/demote | `setRole` |
| Remove access | `banUser` / `removeUser` / revoke sessions |
| List members | `listUsers` |
| Bootstrap | `adminUserIds` |

Schema additions: `user.role`, `banned`, `banReason`, `banExpires`; `session.impersonatedBy` ([admin — Schema](https://better-auth.com/docs/plugins/admin)).

### Access control

Default resources/actions cover **user** and **session** admin APIs, not app domain actions like “run library scan.”

For scan control:

1. **Simple:** treat `role === "admin"` in Spinbox loaders/actions as sufficient for scan + invites (recommended for v1 household).
2. **Richer:** `createAccessControl` + custom statements (e.g. `library: ["scan"]`, `invite: ["create"]`) and pass `ac` + `roles` into admin plugin server/client ([admin — Access Control](https://better-auth.com/docs/plugins/admin)).

Impersonation is available; **skip for household v1** unless support debugging is desired.

### Domain language

Map UI copy to glossary: **household member** (not “user” in product copy), **admin** as capability. Storage can still use Better Auth’s `user` table and `role` field.

---

## 7. Database adapters

Primary: [Installation — Configure Database](https://better-auth.com/docs/installation), [Database concept](https://better-auth.com/docs/concepts/database), adapter pages under [docs/adapters](https://better-auth.com/docs/adapters/drizzle).

### Built-in (Kysely) connections

Documented direct drivers:

| Engine | Example |
| --- | --- |
| **SQLite** | `better-sqlite3` `Database`, `node:sqlite`, `bun:sqlite` ([SQLite adapter](https://better-auth.com/docs/adapters/sqlite)) |
| **PostgreSQL** | `pg` `Pool` |
| **MySQL** | `mysql2` pool |

CLI: `npx auth@latest migrate` (Kysely only) or `generate` for SQL/ORM schema ([installation](https://better-auth.com/docs/installation)).

### ORM adapters

| Adapter | Import (per docs) |
| --- | --- |
| Drizzle | `drizzleAdapter` from `better-auth/adapters/drizzle` (installation) **or** package `@better-auth/drizzle-adapter` (dedicated [Drizzle adapter](https://better-auth.com/docs/adapters/drizzle) page — verify package name at install time; docs versions differ slightly) |
| Prisma | `prismaAdapter` from `better-auth/adapters/prisma` |
| MongoDB | `mongodbAdapter` from `better-auth/adapters/mongodb` |

Also: MSSQL, community adapters, “other relational databases” via Kysely dialects.

### Spinbox recommendation

| Choice | When |
| --- | --- |
| **SQLite + better-sqlite3** | Single always-on host, simplest ops, fits household scale — **default lean** |
| **SQLite + Drizzle** | App wants one ORM for library metadata + auth tables |
| **PostgreSQL** | Only if multi-process / remote DB is already chosen for other reasons |

Secondary storage (Redis) is optional for session/verification scale-out — **unnecessary** for a few household members ([database — secondary storage](https://better-auth.com/docs/concepts/database)).

Core tables: user, session, account, verification (+ plugin fields) ([database](https://better-auth.com/docs/concepts/database)).

---

## 8. Suggested Spinbox auth configuration sketch

Illustrative composition from primary options (not production-final):

```ts
import { betterAuth } from "better-auth"
import Database from "better-sqlite3"
import { admin } from "better-auth/plugins"
import { magicLink } from "better-auth/plugins" // optional

export const auth = betterAuth({
  database: new Database("./data/spinbox.sqlite"),
  baseURL: process.env.BETTER_AUTH_URL, // e.g. http://spinbox.local:3000
  emailAndPassword: {
    enabled: true,
    disableSignUp: true,
    // sendResetPassword: async ({ user, url }) => { ... } // if mail configured
  },
  session: {
    expiresIn: 60 * 60 * 24 * 14,
    updateAge: 60 * 60 * 24,
  },
  plugins: [
    admin({
      defaultRole: "user",
      adminRoles: ["admin"],
      // adminUserIds: [process.env.BOOTSTRAP_ADMIN_ID!]
    }),
    // magicLink({
    //   disableSignUp: true,
    //   sendMagicLink: async ({ email, url }) => { ... },
    // }),
  ],
})
```

**App-owned:** invite table + admin-only mint route; accept-invite route that creates the member under policy; loaders call `auth.api.getSession({ headers: request.headers })` and require `role === "admin"` for scan/invite.

Client (React Router / React):

```ts
import { createAuthClient } from "better-auth/react"
import { adminClient } from "better-auth/client/plugins"

export const authClient = createAuthClient({
  plugins: [adminClient()],
})
```

Remix 3: same server config; mount handler on Fetch router; use **`better-auth/client`** (vanilla) in islands.

---

## 9. Gaps that would force a different auth approach

| Gap | Severity | When it forces exit / rethink |
| --- | --- | --- |
| **No first-class invite-only product mode** | Low–med | Only if the team refuses any app-owned invite table / hooks; then use admin.createUser only or leave Better Auth |
| **No official Remix 3 integration** | Med | If Remix 3 is locked and dual-session / non-React client cost is too high → **`remix/auth`** (see [#2](https://github.com/BenPlusPlus/spinbox/issues/2)) |
| **Email required for magic link / reset / polished invites** | Med | Air-gapped or no-SMTP households cannot rely on magic link; password + offline invite URLs remain OK |
| **Organization plugin is multi-tenant** | Low | Using it for one household adds schema/UX noise — not a force-exit, just a wrong fit |
| **Admin plugin permissions ≠ domain “scan”** | Low | App must authorize scan routes itself; not a reason to switch libraries |
| **Stateless mode insufficient for plugins** | Low | Always use a real DB for Spinbox |
| **Safari third-party cookies** | Low for Spinbox | Only if UI and API are intentionally cross-site; keep same origin |
| **Magic-link default auto-signup** | Footgun | Misconfiguration reopens public registration — process/docs issue, not library exit |

**Force different approach when:**

1. Framework choice is **Remix 3 + first-party auth only** and Better Auth glue exceeds value; or  
2. Product requires a full multi-tenant org product (still Better Auth org plugin — not “different auth,” different feature set); or  
3. Auth must live entirely in an external IdP (OIDC/SSO) with no local passwords — Better Auth can do social/OIDC plugins, but pure “corporate SSO only” may prefer a thinner OIDC client.

None of the household requirements (invite-only, password, optional magic link, cookie sessions, admin role, self-hosted) are **unsupported** on React Router / Node + SQLite.

---

## 10. Recommendations for map / design doc

1. **Adopt Better Auth** for household members if the app stack is **React Router v7** or any Fetch-handler host willing to mount `/api/auth/*`.
2. **Invite-only:** `disableSignUp: true` (+ magic-link `disableSignUp`) + **app invite tokens** or admin `createUser`; **do not** take Organization plugin for v1.
3. **Admin:** admin plugin `role`; authorize scan/invite in app code with `role === "admin"` (optional custom AC later).
4. **Sessions:** default cookies; same-origin; explicit `baseURL`; SQLite session store on the always-on host.
5. **Methods:** email/password required for resilience; magic link only with real mail.
6. **Remix 3 decision coupling:** treat auth as a **joint decision** with framework ticket #2 — either Better Auth mounted on Remix 3 Fetch router, or `remix/auth` and drop Better Auth for v1.
7. **DB:** SQLite first; migrate only if ops demand.

---

## 11. Primary source index

| Topic | URL |
| --- | --- |
| Docs home | https://better-auth.com/docs |
| Installation / adapters / mount | https://better-auth.com/docs/installation |
| React Router (Remix successor) | https://better-auth.com/docs/integrations/react-router |
| Basic usage / server getSession | https://better-auth.com/docs/basic-usage |
| Email & password | https://better-auth.com/docs/authentication/email-password |
| Options (`disableSignUp`, `baseURL`, session, …) | https://better-auth.com/docs/reference/options |
| Session management | https://better-auth.com/docs/concepts/session-management |
| Cookies | https://better-auth.com/docs/concepts/cookies |
| Email (BYO provider) | https://better-auth.com/docs/concepts/email |
| Hooks | https://better-auth.com/docs/concepts/hooks |
| Database | https://better-auth.com/docs/concepts/database |
| Magic link | https://better-auth.com/docs/plugins/magic-link |
| Admin | https://better-auth.com/docs/plugins/admin |
| Organization / invitations | https://better-auth.com/docs/plugins/organization |
| SQLite adapter | https://better-auth.com/docs/adapters/sqlite |
| Drizzle adapter | https://better-auth.com/docs/adapters/drizzle |
| Signup disabled error | https://better-auth.com/docs/reference/errors/signup_disabled |
| Source monorepo | https://github.com/better-auth/better-auth |
| Examples monorepo | https://github.com/better-auth/examples |
| RR integration MDX (repo) | https://github.com/better-auth/better-auth/blob/main/docs/content/docs/integrations/react-router.mdx |

---

## 12. One-line gist (for map Decisions-so-far)

Better Auth fits invite-only household via disableSignUp + admin plugin (+ app invites); official path is React Router v7 cookies/SQLite — Remix 3 needs DIY mount or remix/auth instead.
