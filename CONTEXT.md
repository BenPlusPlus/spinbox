# Spinbox

Household self-hosted web music player: one shared **Library**, invite-only **Household members**, vinyl-inspired **Now playing**.

## Language

### Household

**Household member**:
A person with a Spinbox account who may sign in and use the Library. Identity is a unique email; password authenticates; display name is optional.
_Avoid_: user, account, seat

**Admin**:
A Household member with elevated capability: invites, member lifecycle, promote/demote, and library scan control. A deployment always has at least one Admin.
_Avoid_: owner, superuser, root

**Invite**:
A single-use, time-limited token an Admin mints so a new Household member can join. May optionally hard-bind an email. Redeeming an Invite creates a non-Admin member who sets their own password.
_Avoid_: invitation code, signup link (generic)

**Disable** (member):
Admin action that blocks sign-in and ends sessions while retaining that member's app data. Reversible by re-enable.
_Avoid_: ban, suspend (unless we later need a distinct sense)

**Hard delete** (member):
Admin action that permanently removes a Household member and their app data. Not the default remove path.
_Avoid_: remove (ambiguous with Disable)

### Library

**Library**:
The household's single music collection on disk (Plex-structured tree under a configured root). One Library per deployment.
_Avoid_: catalog, collection (ambiguous), multi-library

**Track**:
One playable audio file in the Library, as recognized by membership rules (extension allowlist and ignore policy). Identity is its library-relative path; a move or rename is a different Track.
_Avoid_: song, file (unless meaning the bytes on disk)

**Artist**:
The resolved performing-artist display name on a Track (tags when present, else path). A browse grouping, not a first-class record with its own identity in v1.
_Avoid_: performer, band (unless UI copy)

**Album artist**:
The resolved album-level artist display name on a Track (tags when present, else path). Compilations typically use a string such as "Various Artists"; not a separate entity type.
_Avoid_: album performer, release artist (unless matching a tag label in ops docs)

**Album**:
The resolved album display name on a Track (tags when present, else path). A browse grouping, not a first-class record with its own identity in v1. Multi-disc releases stay one Album; disc number lives on the Track.
_Avoid_: release, record (ambiguous with vinyl UI)

**Scan run**:
One Admin-visible library index job (manual or scheduled): walking the Library, updating Tracks, and reporting status. At most one Scan run is active; a second start is rejected while one is in progress. Tracks are removed for missing paths only after a successful full walk.
_Avoid_: job (alone), reindex, crawl

### Playback

**Playlist**:
A named, ordered list of Tracks owned by one Household member and visible only to that owner. Not the same as the Play queue.
_Avoid_: mix, station, shared playlist (v1 has none)

**Missing track** (playlist):
A Playlist entry whose Track no longer exists in the index (for example after a successful Scan run pruned the path). Kept on the Playlist, shown as missing, skipped during play until the owner removes it.
_Avoid_: orphan (implementation tone), broken link (generic)

**Listening session**:
The per-member playback state shared across that member's devices: current Track, playhead, play/pause, shuffle, repeat, and the Play queue. Concurrent device updates use last-write-wins.
_Avoid_: player session, device session (implies one device)

**Play queue**:
The ordered Tracks lined up for upcoming playback inside a Listening session. Not durable curated lists (those are Playlists).
_Avoid_: queue (alone), up next (UI copy only)

**Listen resume**:
Per Household member, the last playback position for each Track they have progressed, plus which Track is the last-active continue target. Positions may outlive the Recently played list.
_Avoid_: scrobble, history (broader than this)

**Recently played**:
A per-member ring of the last 50 distinct Tracks played, for light continue-listening UI—not a full play-history log.
_Avoid_: history, scrobbles, play log

**Now playing**:
The surface showing the Track currently in playback (full route and/or mini-dock), including the vinyl centerpiece UI.
_Avoid_: player (alone), now playing bar (one chrome variant only)
