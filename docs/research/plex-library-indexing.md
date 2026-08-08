# Research: Indexing a Plex-structured music library

**Ticket:** [#5](https://github.com/BenPlusPlus/spinbox/issues/5)  
**Map:** [#1](https://github.com/BenPlusPlus/spinbox/issues/1)  
**Branch:** `research/plex-library-indexing`  
**Date:** 2026-03-26  

## Question

What are reliable approaches to scan and index a Plex-compatible music folder tree (Artist/Album/Track layout, disc folders, various taggers) for a self-hosted app?

Cover: walking large trees efficiently, reading embedded tags (Node/TS), reconciling tags vs path metadata, ignoring non-music clutter, and incremental rescan patterns. Note conventions Plex documents for music libraries.

## Spinbox constraints (from map + domain)

- Library lives on a Synology share, laid out for Plex compatibility.
- Metadata policy lean: **prefer tags when present, else path**.
- Formats: mostly mp3/m4a; scattered wav/flac/ogg/aac.
- Non-music clutter and **deliberately renamed extensions** must be ignorable (same spirit as “hide from Plex”).
- Admin-triggered scan + automatic periodic scan.

---

## 1. Plex-documented library conventions

Primary source: [Adding Music Media From Folders](https://support.plex.tv/articles/200265296-adding-music-media-from-folders/).

### Folder hierarchy

Plex expects content types separated by top-level folders (`/Music` vs `/Movies` vs `/TV Shows`). For music:

```
Music/ArtistName/AlbumName/TrackNumber - TrackName.ext
```

Even with perfect tags, Plex still recommends album folders — a flat dump of tracks is a poor experience and can fail matching.

### Multi-disc albums

Documented filename pattern: **prepend disc number to track number** (no separator), e.g. track 2 on disc 3 → `302 - TrackName.ext`:

```
Music/ArtistName/AlbumName/DiscNumberTrackNumber - TrackName.ext
```

Plex also states that multi-disc albums should have the correct **disc number in embedded tags**. A separate multi-disc article notes disc info is captured **at first scan**; fixing later may require re-add or manual edit ([Multi-disc support](https://support.plex.tv/articles/205748387-how-do-i-use-multi-disc-support-for-my-music-libraries/)).

**Implication for Spinbox:** Support both:

1. Flat album folder + `DDTT - Title.ext` naming (canonical Plex path form).
2. Optional `Disc N` / `CD1` subfolders under the album (common community layout; not the primary Plex doc form, but widely used). Prefer **tag `disk`** when present; else parse path (`Disc 1/…` or `101 - …`).

### Various Artists / compilations

Plex documents a literal artist folder named `Various Artists`. For tagged files under Prefer local metadata:

- **Album Artist** = `Various Artists`
- **Artist** = performing artist for that track

Mis-tagged album artist causes compilations to scatter under wrong artists.

### Embedded metadata vs path (Plex)

[Identifying Music Media Using Embedded Metadata](https://support.plex.tv/articles/200381093-identifying-music-media-using-embedded-metadata/):

- Plex can prefer local tags via **Prefer local metadata**.
- That mode assumes Track, Album, Artist (and ideally Album Artist) are complete and correct.
- Plex still expects folder organization even when tags drive matching.
- Default Plex guidance for most users is *not* to force local-only metadata (they use online agents + fingerprinting). **Spinbox is different:** it is a local index only — tags + path, no Last.fm/agent matching.

### Sidecar clutter Plex expects (ignore as tracks)

[Local lyrics and artwork](https://support.plex.tv/articles/215916117-adding-local-lyrics/):

| Kind | Placement | Names / extensions |
|------|-----------|--------------------|
| Lyrics | Same dir as track, same basename | `.lrc`, `.txt` |
| Artist art | Artist folder | `artist`, `cover`, `folder`, `poster`, … (+ `-poster` / `-background` variants); `.jpg`/`.jpeg`/`.png`/`.tbn` |
| Album art | Album folder | `album`, `cover`, `folder`, `poster`, `fanart`, … |

These are **not** audio tracks. Index optionally as related assets; never as tracks.

---

## 2. Walking large trees efficiently (Node/TS)

Primary API: [Node.js `fs` / `fs/promises`](https://nodejs.org/api/fs.html).

### Recommended walk pattern

1. **`fs.promises.opendir` / `fs.Dir` async iteration**, or **`readdir` with `{ withFileTypes: true }`**, so directory entries are `fs.Dirent` and type checks avoid an extra `stat` per child when the OS provides type info.
2. **Depth-first recursive walk** of the music root only (one library root).
3. **Do not** materialize every path into one giant array before processing if the tree is huge — stream candidates into a bounded work queue.
4. Use **`stat` / `lstat`** only when you need `mtimeMs`, `size`, or when `Dirent` type is unreliable (some network mounts).
5. **Skip symlink loops:** prefer `lstat` + explicit symlink policy (follow once with cycle guard, or never follow). On a Synology mount, decide once: typically **do not follow symlinks** unless the household layout requires them.

### Parallelism

- Directory enumeration can be modestly concurrent.
- **Tag parse I/O should be concurrency-limited** (see music-metadata FAQ: unbounded parallel `parseFile` hangs the process). Use a worker pool (e.g. 2–8 concurrent parses depending on share latency and CPU).
- Network filesystem (SMB/NFS to Synology): lower concurrency often wins over saturating the mount.

### Optional accelerators

- **`fs.promises.glob`** (modern Node) for extension-filtered discovery if preferred over a hand walk — still filter dirs and apply ignore rules.
- Third-party crawlers (e.g. `fdir`) exist for raw speed; **not required** if the walk is Dirent-based and work is streamed. Prefer standard library unless profiling shows enumeration is the bottleneck.

### Practical pipeline stages

```
enumerate (cheap) → filter extensions/ignores → fingerprint check (mtime/size)
  → parse tags only for new/changed → upsert index → prune missing paths
```

Enumeration should finish quickly relative to tag parsing; never re-parse unchanged files on every rescan.

---

## 3. Reading embedded tags (Node/TS ecosystem)

### Primary recommendation: `music-metadata` (Borewit)

Sources: [npm music-metadata](https://www.npmjs.com/package/music-metadata), [GitHub Borewit/music-metadata](https://github.com/Borewit/music-metadata), [common metadata map](https://github.com/Borewit/music-metadata/blob/master/doc/common_metadata.md).

| Property | Detail |
|----------|--------|
| Formats | MP3, MPEG-4/M4A, FLAC, Ogg/Vorbis/Opus, WAV, AIFF, AAC (ADTS), WavPack, WMA, and more — covers Spinbox’s expected mix |
| Tag systems | ID3v1/v2.x, Vorbis comments, iTunes/MP4, APE, RIFF INFO, ASF, … |
| API | ESM; Node ≥ 18; `parseFile(path, options)` for local files |
| Normalized fields | `metadata.common.*` (Picard-inspired mapping) + `metadata.format.*` + raw `metadata.native` |
| Options useful for indexing | `skipCovers: true` (default covers off for bulk index — large memory waste); `duration: true` only when duration not already available / needed |

**Fields Spinbox should map for v1 (from `common`):**

| Index concept | `common` field |
|---------------|----------------|
| Track title | `title` |
| Track artist | `artist` / `artists` |
| Album | `album` |
| Album artist | `albumartist` |
| Track no / total | `track` → `{ no, of }` |
| Disc no / total | `disk` → `{ no, of }` |
| Year / date | `year`, `date` |
| Genre | `genre` |
| Duration | `format.duration` (seconds) |
| Codec / container | `format.container`, `format.codec`, bitrate, sampleRate |
| Compilation flag | `compilation` |
| Embedded cover | `picture` (skip on bulk scan; optional later job) |

**Sequential / bounded concurrency:** library docs explicitly warn against firing all `parseFile` calls in parallel; use `for…of` + `await` or a concurrency pool.

**Parse errors:** treat unknown/corrupt files as non-fatal: record path + error, continue scan. Error types include undetermined type, unsupported type, unexpected content (typed union in modern versions).

### Alternatives (not primary)

| Library | Notes |
|---------|--------|
| `jsmediatags` | Older; browser-oriented; narrower format coverage for a full library |
| `music-tag-native` (napi + lofty) | Fast native reader/writer; stronger if write-back is needed; heavier deploy (native bindings) |
| `node-id3` | ID3 write/read focused; not a multi-format library indexer |

**Recommendation:** Use **`music-metadata`** for Spinbox indexing. Pure JS/ESM, broad format/tag coverage, TypeScript-friendly, mature. Revisit native bindings only if profiling shows tag parse as a hard bottleneck on the always-on host.

---

## 4. Reconciling tags vs path metadata

### Policy (aligned with map leanings)

**Prefer tags when present and non-empty; fall back to path.** Never invent online agent matches.

Suggested merge order per field:

| Field | Source priority |
|-------|-----------------|
| Title | tag `title` → filename stem (strip track prefix) |
| Track number | tag `track.no` → leading number in filename (`01 - …`, `101 - …`) |
| Disc number | tag `disk.no` → filename disc prefix (`302` → disc 3) → parent folder `Disc N` / `CD N` |
| Album | tag `album` → parent album folder name |
| Album artist | tag `albumartist` → artist folder name (or `Various Artists` folder) |
| Artist (track) | tag `artist` → album artist → artist folder |
| Year | tag `year`/`date` → optional `(YYYY)` in album folder name if present |

### Path parsing assumptions (Plex-compatible)

Relative to library root:

```
{Artist}/{Album}/{optional Disc folder}/{file}
```

Filename patterns to accept:

1. `TrackNumber - Title.ext` (e.g. `01 - Shine On….m4a`)
2. `DiscTrack - Title.ext` where disc is prepended (e.g. `101 - In the Flesh.mp3`) — Plex multi-disc
3. Loose variants: `01. Title`, `01_Title`, `Track 01 - Title` (best-effort; tags still win)

Normalize:

- Trim whitespace; collapse runs of spaces.
- Strip trailing `.` / Windows-illegal residue if any.
- Treat artist folder name `Various Artists` as compilation album-artist default when tags missing.

### Identity keys for the index

Stable identity for upsert/delete:

1. **Primary:** absolute or library-relative path (normalized separators, NFC Unicode if cross-platform).
2. **Optional secondary:** musicbrainz IDs from tags when present (`musicbrainz_recordingid`, etc.) — useful later, not required for v1 play.

When a file moves, path identity breaks → treat as delete + insert unless a content hash is maintained (expensive; optional future).

### Conflicting tags vs path

- Do **not** hard-fail on mismatch; store **resolved** display fields + retain **raw path parts** and optionally raw tag snapshot for debug/admin.
- If album folder groups tracks with differing tag `album` values, prefer **per-track tags** for display; optional future “folder as album” browse mode can group by path.

---

## 5. Ignoring non-music clutter

### Allowlist audio extensions (default)

Spinbox map: mp3, m4a, wav, flac, ogg, aac (+ recommend opus, mp4 audio, aiff if encountered).

```
.mp3 .m4a .mp4 .flac .ogg .opus .wav .aac .aiff .aif .wma
```

**Only allowlisted extensions become tracks.** Renaming a file to `.mp3.bak`, `.hidden`, `.jpg`, or a nonsense extension **hides it** — matching household “hide from Plex” practice and Plex’s extension-based discovery.

### Deny / skip without parsing

| Category | Examples |
|----------|----------|
| Images | `.jpg` `.jpeg` `.png` `.tbn` `.gif` `.webp` |
| Lyrics sidecars | `.lrc` `.txt` (same basename as a track may be linked later) |
| Playlists / cues | `.m3u` `.m3u8` `.pls` `.cue` |
| OS junk | `.DS_Store`, `Thumbs.db`, `desktop.ini` |
| Partial / temp | `.part`, `.tmp`, files starting with `._` (AppleDouble) |
| Dotdirs / system | `.@__thumb`, `#recycle`, `@eaDir` (Synology), `.git` |

### Directory skip list (configurable)

Default skip directory **names** (case-insensitive):

- `@eaDir`, `#recycle`, `#snapshot`, `.SyncArchive`, `lost+found`
- Optionally: `Artwork`, `Scans`, `extras` if the household uses those for non-audio

Configurable **glob ignore** (admin later): e.g. `**/Incomplete/**`.

### Hidden-from-index by deliberate rename

Document for admins: to exclude a track without deleting it, change the extension off the allowlist (or move under a skipped folder). Do not require special “ignore tags” for v1.

### Optional: content sniff

For allowlisted extensions that fail parse, do not reclassify as music. Optionally use `file-type` (dependency of music-metadata’s ecosystem) only if extension spoofing becomes an issue — usually unnecessary if the library is trusted household media.

---

## 6. Incremental rescan patterns

### Fingerprint per file (cheap)

Store for each indexed path:

- `mtimeMs` (from `stat`)
- `size`
- optional `ctimeMs` (less reliable on some mounts)

On rescan:

| Condition | Action |
|-----------|--------|
| Path new | parse + insert |
| Path known, same mtime+size | skip parse |
| Path known, mtime or size changed | re-parse + update |
| Path in DB missing on disk | soft-delete / remove from library (playlists: orphan policy TBD) |

**Do not rely on mtime alone** on all NAS setups; pairing with `size` reduces false skips. Content hashing (xxhash/blake3 of whole file) is more correct but expensive over SMB — reserve for “verify library” admin action.

### Full vs incremental

| Mode | When |
|------|------|
| **Incremental (default periodic + Scan now)** | Walk tree, fingerprint compare, parse subset |
| **Full reindex** | Admin recovery: re-parse all allowlisted files; rebuild derived tables |
| **Watch-based** | Optional later: `fs.watch` / chokidar on mount — **fragile over network mounts**; prefer poll/cron for Synology share |

### Scheduling (product leanings)

- Automatic periodic scan (interval config).
- Manual “Scan now” for admins.
- Single-flight: only one scan job at a time; queue or ignore concurrent requests.
- Progress: counts of seen / parsed / skipped / errors for admin UX.

### Transactional upsert sketch

1. Begin scan run record (`started_at`, mode).
2. Stream walk → for each candidate, compare fingerprint → parse if needed → upsert track row.
3. After walk completes, mark tracks not seen in this run as missing (if full walk guaranteed).
4. Complete scan run (`finished_at`, stats).

For very large libraries, commit in batches so a crash mid-scan leaves partial progress and the next run continues via fingerprints.

### Network mount caveats (Synology)

- Latency dominates; keep parse concurrency low–moderate.
- Mount may disconnect mid-scan → treat I/O errors as abort/retry, not mass-delete (require N consecutive “missing” scans or only prune when walk completed successfully).
- Unicode normalization: NFC paths for storage keys.

---

## 7. Recommended architecture for Spinbox

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│ Walk library    │────▶│ Filter allowlist │────▶│ Fingerprint vs  │
│ root (Dirent)   │     │ + dir ignores    │     │ DB (mtime/size) │
└─────────────────┘     └──────────────────┘     └────────┬────────┘
                                                          │ changed/new
                                                          ▼
                                                 ┌─────────────────┐
                                                 │ parseFile       │
                                                 │ skipCovers:true │
                                                 │ pool N workers  │
                                                 └────────┬────────┘
                                                          ▼
                                                 ┌─────────────────┐
                                                 │ Resolve fields  │
                                                 │ tags ≻ path     │
                                                 │ upsert tracks   │
                                                 └─────────────────┘
```

### Concrete stack choices

| Concern | Choice |
|---------|--------|
| Tree walk | `fs/promises` `opendir` / `readdir({ withFileTypes: true })` |
| Tags | `music-metadata` `parseFile`, `skipCovers: true` |
| Field merge | tags first, path fallback (Plex-shaped parser) |
| Discovery filter | extension allowlist + Synology/OS dir denylist |
| Rescan | mtime+size fingerprint; full walk each job; prune only on successful completion |
| Trigger | periodic timer + admin Scan now; no FS watch required for v1 |

### Path layout support matrix

| Layout | Support |
|--------|---------|
| `Artist/Album/01 - Track.ext` | Yes (canonical) |
| Multi-disc `101 - Track.ext` in one album folder | Yes (Plex doc) |
| `Artist/Album/Disc 1/01 - Track.ext` | Yes (path disc fallback) |
| `Various Artists/Compilation/…` | Yes |
| Flat `Artist/*.mp3` without album folders | Best-effort via tags only; album may be “Unknown Album” |
| Mixed non-audio sidecars | Ignored as tracks |

---

## 8. Open decisions (out of this research ticket)

- Exact DB schema for artists/albums/tracks and whether albums are path-derived entities or tag-derived groups.
- Playlist orphan behavior when a track path disappears.
- Whether to index embedded covers in a second-phase job vs serve folder `cover.jpg` first.
- Scan job host (Remix request path vs background worker process).
- Concurrency defaults tuned on the real Synology mount.

These belong to later design/task tickets once indexing research is accepted.

---

## 9. Source index (primary)

| Source | Use |
|--------|-----|
| [Plex: Adding Music Media From Folders](https://support.plex.tv/articles/200265296-adding-music-media-from-folders/) | Artist/Album/Track layout, multi-disc filenames, Various Artists |
| [Plex: Identifying Music Using Embedded Metadata](https://support.plex.tv/articles/200381093-identifying-music-media-using-embedded-metadata/) | Prefer-local-metadata caveats; tag completeness |
| [Plex: Multi-disc support](https://support.plex.tv/articles/205748387-how-do-i-use-multi-disc-support-for-my-music-libraries/) | Disc numbers at first scan; tag disc info |
| [Plex: Local lyrics and artwork](https://support.plex.tv/articles/215916117-adding-local-lyrics/) | Sidecar names/extensions to ignore as tracks |
| [Borewit/music-metadata README](https://github.com/Borewit/music-metadata) | parseFile, options, sequential parsing FAQ, formats |
| [music-metadata common tags](https://github.com/Borewit/music-metadata/blob/master/doc/common_metadata.md) | Normalized field mapping (Picard-inspired) |
| [Node.js fs documentation](https://nodejs.org/api/fs.html) | readdir Dirent, opendir, stat, promises API |

---

## 10. One-line gist

Prefer extension-allowlisted tree walk + mtime/size incremental parse with **music-metadata**; resolve display fields **tags ≻ Plex-style path**; ignore sidecars/Synology junk and renamed-off-allowlist files.
