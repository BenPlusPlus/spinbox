# Research: Serving audio from a mounted Synology share

**Ticket:** [#6](https://github.com/BenPlusPlus/spinbox/issues/6)  
**Map:** [#1](https://github.com/BenPlusPlus/spinbox/issues/1)  
**Date:** 2026-03-08  
**Scope:** Practical constraints when Spinbox runs on a separate always-on LAN host, mounts the household music Library from a Synology NAS (SMB and/or NFS), and streams audio files to browsers after auth.

## Executive summary

1. **HTTP byte-range support is mandatory** for browser seek (`<audio>` / HTML media elements). The app must answer `Range` with `206 Partial Content`, `Accept-Ranges: bytes`, and `Content-Range` — not stream whole files as opaque 200 bodies without ranges.
2. **Mount the Library read-only.** Spinbox never writes track files; `ro` (and Synology-side read-only NFS privilege where applicable) is the correct least-privilege default.
3. **Protocol choice by app-host OS:** prefer **NFS on Linux**, **SMB on Windows**. Both are reliable for concurrent read-only media on a home LAN; audio bitrates are far below gigabit capacity.
4. **File locking is a non-issue** for Spinbox’s read path. Multiple clients reading the same track is fine; do not open files for write.
5. **Permission models differ:** NFS is host + UID/GID (or squash); SMB is user/credential based. Design around a dedicated app identity that can *read* the share and nothing else.
6. **Self-hosted practice** (Navidrome, Jellyfin-class stacks): host mounts the NAS share, container/process sees a local path bind-mounted **read-only**, scanner + streamer use that path.

## Topology (assumed)

```
[Browser] --HTTP(S)--> [Spinbox app host] --NFS or SMB--> [Synology NAS: Library share]
                              | local mount e.g. /mnt/library
```

- App host is **not** the Synology (map Notes: separate always-on LAN machine).
- Auth happens at Spinbox; browsers never talk SMB/NFS.
- Library files stay on the NAS; Spinbox indexes metadata and streams bytes.

---

## 1. HTTP range / seek (browser streaming)

### What browsers need

HTML media elements use **HTTP range requests** so players can seek without downloading the entire file. MDN documents this as the standard mechanism for media random access: clients send `Range: bytes=…`; servers that support partial content advertise `Accept-Ranges: bytes` and return **206 Partial Content** with a `Content-Range` describing the slice. Out-of-bounds ranges yield **416**; servers that do not support ranges may ignore `Range` and return **200** with the full body (seek then degrades or is disabled).

Primary references:

- [MDN: HTTP range requests](https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/Range_requests)
- [RFC 9110 — HTTP Semantics](https://www.rfc-editor.org/rfc/rfc9110.html) (obsoletes RFC 7233 range requests; status **206** / **416**, `Accept-Ranges`, `Range`, `Content-Range`, `If-Range`)
- [MDN: 206 Partial Content](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Status/206)
- [HTML living standard — media elements / seeking](https://html.spec.whatwg.org/multipage/media.html) (`seekable`, seek events; byte-range is how user agents implement random access over HTTP)

Observed browser behavior (media tags): an initial `Range: bytes=0-` probe is common; if the server cannot answer with proper partial content, seeking while buffering is often unavailable.

### Implications for Spinbox

| Requirement | Design assumption |
| --- | --- |
| Range unit | Bytes only in practice (`Accept-Ranges: bytes`) |
| Status codes | `206` for satisfiable ranges; `416` with `Content-Range: bytes */size` when unsatisfiable |
| Length | Full file size known up front (stat on mount path) so `Content-Range` can include total length |
| Streaming I/O | Open file → seek to start offset → read only the requested window (POSIX `lseek`/`read` or equivalent over the mount) |
| Auth | Session cookie **or** short-lived signed stream URL must still apply on **every** range request (browsers re-request ranges during seek) |
| Conditional ranges | Support `If-Range` + `ETag` / `Last-Modified` if caching intermediaries or resume matter; useful but secondary on private LAN |

Mount protocol (SMB vs NFS) does **not** replace HTTP ranges. The browser only sees HTTP; the mount only needs to support random-access **reads** of file bytes — which both NFS and SMB do for ordinary files.

Node/static-serving stacks typically implement this already (e.g. Express `serve-static` / `send` with `acceptRanges` defaulting to true). Remix or a custom route must either use such a library or implement the same headers.

---

## 2. Latency and bandwidth

### Bandwidth envelope

Household audio bitrates are modest relative to a LAN:

| Format (typical) | Approx. bitrate | Concurrent streams on 1 Gbit LAN |
| --- | --- | --- |
| MP3 320 kbps | ~40 KiB/s | Dozens |
| AAC / M4A lossy | similar order | Dozens |
| FLAC (CD-ish) | ~0.5–1+ MiB/s | Many |
| WAV / high-res | higher | Still usually fine on gigabit |

Bottleneck for “spin up on play / seek” is usually **first-byte latency** (auth + open/stat + first NFS/SMB READ), not sustained throughput.

### Mount-layer latency

- Each HTTP range may trigger one or more network READs on the mount if data is not in the app host’s page cache.
- Sequential playback benefits from kernel readahead on both NFS and SMB clients.
- Seek jumps to cold offsets pay an extra round-trip; on LAN (sub-ms to low-ms RTT) this is acceptable for audio.
- **Do not** use `noac` (NFS) or `cache=none` (CIFS) on the streaming path solely for “freshness” — that multiplies metadata RPCs and hurts scans and open latency. Prefer default attribute caching for serve; refresh metadata on **library scan** jobs instead.

### App-level latency budget (design targets)

Assumptions a design can use until measured:

- Cold open + first range on LAN: aim well under ~200–500 ms time-to-first-audio-byte under light load.
- Hot file (recently played): often served largely from host page cache.
- Tailscale/VPN later phase: still fine for lossy; high-res FLAC may need buffering headroom — not a v1 LAN concern.

---

## 3. Locking

Spinbox’s relationship to Library files is **read-only concurrent consumers**.

| Concern | Practical impact |
| --- | --- |
| Multiple household members streaming the same track | Safe; readers do not need exclusive locks |
| Scanner reading tags while someone plays | Safe if both open read-only |
| NFS advisory locks / SMB mandatory locks | Irrelevant if the app never opens write handles |
| NAS-side writers (ripping, retagging, Plex, File Station) | Possible mid-stream if a file is replaced; rare. Treat as “next play / rescan refreshes”; optional `If-Range` / ETag invalidation later |

**Recommendation:** open tracks `O_RDONLY` only; never flock for playback. If a file disappears mid-stream, fail the HTTP response cleanly (client can retry or skip).

---

## 4. Permission models

### Synology side

Synology exposes both protocols via **Control Panel → File Services**:

- **SMB:** enable SMB service; shared-folder permissions use DSM users/groups (ACL-style). ([Synology KB — SMB Settings](https://kb.synology.com/en-global/DSM/help/SMBService/smbservice_smb_settings?version=7))
- **NFS:** enable NFS; per shared folder, **NFS Permissions** rules (client hostname/IP, privilege read-only or read/write, squash). ([Synology KB — Assign NFS Permissions](https://kb.synology.com/en-global/DSM/help/DSM/AdminCenter/file_share_privilege_nfs?version=7))

Community documentation of Synology export lines maps UI squash choices to classic NFS flags, e.g. *Map root to admin* → `root_squash` + `anonuid` for admin, *Map all users to admin* → `all_squash`, *No mapping* → `no_root_squash`. (See [OSMC forum notes on Synology NFS exports](https://discourse.osmc.tv/t/using-nfs-with-synology/36776) — useful as operational reference, not a Synology primary doc.)

**Design assume on NAS:**

1. Dedicated DSM user (or NFS rule) used only by the app host, with **read** access to the music shared folder.
2. Prefer **Read only** NFS privilege for that rule when the protocol is NFS.
3. Restrict NFS client address to the app host (or LAN subnet as needed) — not `*` in production.
4. Music files themselves must be readable by that identity (Unix mode/ACL on the volume). Squash + world/group-readable library trees are a common household pattern when UID maps are painful.

### NFS identity model

- Classic NFS trusts **UID/GID numbers** from the client (unless squashed). Same numeric UID on app host and NAS simplifies “no mapping” setups.
- Squash maps remote users to a fixed `anonuid`/`anongid` on the NAS — simpler for a single media-server host (“everyone from this IP is the reader user”).
- Linux client options: see [nfs(5)](https://man7.org/linux/man-pages/man5/nfs.5.html) (`nfsvers`/`vers`, `soft`/`hard`, `rsize`/`wsize`, `ac`/`noac`, `actimeo`, `timeo`, `retrans`).

### SMB identity model

- **User authentication** at session setup (username/password, optional domain). Linux: `mount.cifs` with `credentials=` file (mode `0600`), not passwords in world-readable fstab. ([mount.cifs(8)](https://linux.die.net/man/8/mount.cifs))
- Local presentation of ownership uses `uid=`, `gid=`, `file_mode=`, `dir_mode=` when Unix extensions are absent or forced.
- Client permission check (`perm` default) is in addition to server ACLs.

### Windows app host

- Map network drive or mount via OS SMB client with a service account that has share + NTFS/ACL read rights on the Synology share.
- Prefer running the Spinbox process as that same identity (or with access to the mapped path). Navidrome’s Windows notes similarly call out service-account access to network drives.

### Linux app host process identity

- Run Spinbox as a non-root user that can traverse the mount and read files.
- Docker: bind-mount the host mount into the container **read-only** (Navidrome documents `-v /path/to/music:/music:ro` and requires the process UID to have read access). ([Navidrome Getting Started](https://www.navidrome.org/docs/getting-started/))

---

## 5. SMB vs NFS for media reads (reliability)

High-level comparison for **read-only music libraries on a home LAN** (synthesis of protocol roles + ops practice):

| Dimension | NFS | SMB (CIFS) |
| --- | --- | --- |
| Natural home | Linux/Unix app hosts | Windows (and mixed desktops); Synology enables SMB by default |
| Auth | Host-based export + UID/GID or squash | User credentials / ACLs |
| Locking | Advisory (NLM / NFSv4) | Stronger/server-side locking tradition; irrelevant for RO media |
| Linux client maturity for media servers | Excellent; common for Jellyfin/Navidrome host mounts | Solid via `cifs-utils`; more credential/ACL ceremony |
| Windows client | Possible but less idiomatic | Native |
| Failure behavior (Linux) | Default **hard**: hang until server returns; **soft**: return I/O errors after retries ([nfs(5)](https://man7.org/linux/man-pages/man5/nfs.5.html)) | Default **soft** (errors to app); **hard** hangs ([mount.cifs(8)](https://linux.die.net/man/8/mount.cifs)) |
| Throughput for audio | Both ample on gigabit | Both ample |
| Permission friction | UID/GID/squash mismatches | Credential + `file_mode`/`uid` mapping |

**AWS comparison overview** (NFS vs SMB roles, Linux vs Windows affinity): [What’s the Difference Between NFS and SMB?](https://aws.amazon.com/compare/the-difference-between-nfs-smb/)

### Reliability notes for Spinbox

1. **Either protocol is fine** for concurrent RO audio if the mount is stable and the app uses range-capable streaming.
2. **Prefer NFS** when the always-on app host is Linux (map leanings): simpler identity for a single server-to-NAS link, native Linux stack, widely used for media-server containers.
3. **Prefer SMB** when the app host is Windows, or when the household already standardizes on DSM users/ACLs and does not want NFS enabled.
4. **Avoid SMB1**; use SMB2/3 only (Synology advanced SMB settings / client `vers=3.0` or `3.1.1`).
5. **NAS down behavior:**  
   - NFS `hard` can pin worker threads forever → risk of wedged processes.  
   - NFS `soft`/`softerr` returns errors (man page warns of silent corruption risk for **writes**; Spinbox mounts **ro**, so risk is primarily incomplete reads → surface as failed streams).  
   - App-level timeouts and clear 502/503 still recommended regardless of mount option.
6. **Do not double-mount the same tree RW via two protocols for writers** without understanding cache coherence; Spinbox should only **read**. Writers (tag edits, imports) stay on NAS-local tools or a single designated protocol.

---

## 6. Recommended mount assumptions (design defaults)

### Common

- Mount point: stable absolute path, e.g. `/mnt/spinbox-library` (Linux) or a fixed drive letter / UNC access path (Windows).
- **Read-only** at mount (`ro`) and ideally read-only on the Synology export rule.
- Persist via `/etc/fstab` or systemd `.mount` + optional `x-systemd.automount` so reboot recovers without manual remount.
- App config: single root path (“media root”) pointing at that mount; never accept client-supplied filesystem paths.
- Scanner and streamer share the same path; both run under an identity that can read it.
- Monitor mount health (e.g. `stat` of root or a sentinel file) and fail streams gracefully if the mount is stale or disconnected.

### Linux + NFS (preferred for Linux app host)

Illustrative fstab-style options (tune after measure; start near defaults):

```text
nas.local:/volume1/music  /mnt/spinbox-library  nfs  ro,nfsvers=4,hard,timeo=600,retrans=2,_netdev  0  0
```

| Option | Rationale |
| --- | --- |
| `ro` | App never writes Library files |
| `nfsvers=4` (or `3` if NFSv4 is disabled on DSM) | Explicit; avoid accidental negotiation surprises |
| `hard` *or* `soft`/`softerr` | `hard` maximizes integrity of long reads; `soft`/`softerr` fails faster when NAS is dead — pick based on whether hung I/O or quick error is worse for the process model. Prefer **app timeouts** either way. |
| Default `rsize`/`wsize` | Let client/server negotiate (up to 1 MiB on modern Linux NFS) |
| Attribute cache on (`ac`, default) | Better open/stream performance; scanner can readdir and re-stat on its own schedule |
| `_netdev` | Don’t mount before network |

Optional: raise `actimeo` if directory listings thrash; keep defaults first.

Synology: NFS enabled; rule for app-host IP; **Read only**; squash chosen so the app UID can read (often *Map all users to admin* or aligned UIDs with *No mapping* / *Map root to admin* — document the household choice in deploy notes).

### Linux + SMB

```text
//nas.local/music  /mnt/spinbox-library  cifs  ro,credentials=/etc/spinbox/nas.cred,uid=spinbox,gid=spinbox,file_mode=0444,dir_mode=0555,vers=3.1.1,cache=strict,iocharset=utf8,_netdev  0  0
```

| Option | Rationale |
| --- | --- |
| `credentials=` | Avoid password in fstab |
| `uid`/`gid` | Local ownership matches app user |
| `file_mode`/`dir_mode` | Predictable local permission bits for a RO media tree |
| `vers=3.1.1` (or `3.0`) | Modern SMB; not SMB1 |
| `cache=strict` | Protocol-correct client cache ([mount.cifs(8)](https://linux.die.net/man/8/mount.cifs)); default on modern kernels |
| `ro` | Same least privilege |

### Windows + SMB

- Use a dedicated DSM user with read rights; store credentials in the service’s secure store or Windows Credential Manager as appropriate for the host service model.
- Keep the mapping available at service start (startup order: network → map → Spinbox).
- Prefer UNC path consistency in config if drive-letter maps are fragile across sessions.

### Caching layers (what to assume)

| Layer | Role |
| --- | --- |
| NAS disk + DSM cache | Opaque; treat as “local disk far away” |
| NFS/SMB client page cache on app host | **Primary** win for repeated plays and sequential stream |
| HTTP `Cache-Control` for audio | Private LAN + authenticated media: prefer **private, short or no shared cache**; avoid public CDN caching of auth-gated audio |
| App in-memory track buffer | Optional later; not required for v1 if range streaming is correct |
| Index/DB on local app disk | Metadata, playlists, scan state — **not** on the NAS mount |

---

## 7. Streaming architecture assumptions for Spinbox design

These are facts the later streaming-architecture decision can treat as settled:

1. **Serve file bytes from the mount via HTTP with full range support** after auth. Do not reverse-proxy raw NAS HTTP unless it also enforces household auth (it usually does not).
2. **Path traversal guards:** resolve realpath under media root; reject `..` and symlinks escaping the root if symlinks are allowed at all.
3. **Correct `Content-Type`** from extension/probe (`audio/mpeg`, `audio/mp4`, `audio/flac`, etc.) so `<audio>` accepts the resource.
4. **Content-Length / size from `stat`** before answering ranges.
5. **Auth on media URLs:** cookie session for same-origin player **or** short-lived signed query tokens if the media host/path is isolated; both must survive multiple range GETs.
6. **No write API** against Library files in v1 (scan is read/index only).
7. **Mount RO** in deploy docs and container binds (`:ro`).
8. **Failure UX:** if mount unavailable, API returns a clear error; player does not hang the UI on wedged I/O (timeouts).

Self-hosted precedent: Navidrome’s documented Docker pattern mounts music **read-only** and requires process read access; network shares are an expected way to place files on the host. ([Navidrome Getting Started](https://www.navidrome.org/docs/getting-started/), [FAQ — network shares for the music directory](https://www.navidrome.org/docs/faq/))

---

## 8. SMB vs NFS — decision table for Spinbox

| App host | Recommendation |
| --- | --- |
| Linux always-on box | **NFS**, RO export + RO mount; SMB acceptable fallback |
| Windows always-on box | **SMB**, RO share ACL + service account |
| Mixed / uncertain | SMB for simpler DSM user story; still RO |

Both are **production-viable** for this workload. Protocol choice is an **ops/deploy** decision, not a product-feature fork: the app only needs a readable local path.

---

## 9. Open items (out of this ticket)

- Exact HTTP route shape, worker vs request-path streaming, and cache headers (map: “Streaming architecture details…”).
- Scan pipeline vs attribute cache timing (map: scan pipeline ticket).
- Whether to support changing media root without reinstall.
- Measured time-to-first-byte on the real NAS + host (validate after prototype).

---

## Sources

### Primary / standards

- [RFC 9110: HTTP Semantics](https://www.rfc-editor.org/rfc/rfc9110.html) — range requests, 206, Accept-Ranges / Range / Content-Range (obsoletes RFC 7233).
- [MDN: HTTP range requests](https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/Range_requests).
- [MDN: 206 Partial Content](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Status/206).
- [HTML Standard: media elements](https://html.spec.whatwg.org/multipage/media.html).
- [nfs(5) Linux man page](https://man7.org/linux/man-pages/man5/nfs.5.html) — soft/hard, rsize/wsize, ac/noac, actimeo, timeo, retrans.
- [mount.cifs(8)](https://linux.die.net/man/8/mount.cifs) — ro, credentials, uid/gid, file_mode/dir_mode, cache=, soft/hard, vers.
- [Synology Knowledge Center: SMB Settings](https://kb.synology.com/en-global/DSM/help/SMBService/smbservice_smb_settings?version=7).
- [Synology Knowledge Center: Assign NFS Permissions](https://kb.synology.com/en-global/DSM/help/DSM/AdminCenter/file_share_privilege_nfs?version=7).
- [AWS: NFS vs SMB comparison](https://aws.amazon.com/compare/the-difference-between-nfs-smb/) — protocol roles and OS affinity (overview).

### Self-hosted media practice

- [Navidrome: Getting Started](https://www.navidrome.org/docs/getting-started/) — music path, Docker `:ro`, process read access.
- [Navidrome FAQ](https://www.navidrome.org/docs/faq/) — network shares for the music directory.
- [Express serve-static `acceptRanges`](https://expressjs.com/en/resources/middleware/serve-static/) — range support as default in common static stacks.

### Secondary operational notes (not standards)

- [OSMC: Using NFS with Synology](https://discourse.osmc.tv/t/using-nfs-with-synology/36776) — maps DSM NFS squash UI to export flags (illustrative).
- Community media-server practice: host-level NFS/SMB mount + container bind-mount RO for Jellyfin/Navidrome-class apps (widely repeated; treat as convention, not a single vendor spec).

---

## One-line gist (for map Decisions-so-far)

Mount Library **read-only** (NFS on Linux / SMB on Windows); stream via **HTTP byte-range (206)** after auth; locking irrelevant for RO media; design for client page cache + graceful NAS-down errors.
