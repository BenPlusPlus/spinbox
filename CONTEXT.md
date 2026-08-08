# Spinbox

Household self-hosted web music player: one shared **Library**, invite-only **Household members**, vinyl-inspired **Now playing**.

## Language

**Library**:
The household's single music collection on disk (Plex-structured tree under a configured root). One Library per deployment.
_Avoid_: catalog, collection (ambiguous), multi-library

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

**Track**:
One playable audio file in the Library, as recognized by membership rules (extension allowlist and ignore policy).
_Avoid_: song, file (unless meaning the bytes on disk)

**Playlist**:
A named, member-owned ordered list of Tracks for later playback. Not the same as the Play queue.
_Avoid_: mix, station

**Play queue**:
The ordered Tracks lined up for upcoming playback in the current listening session. Ephemeral relative to Playlists.
_Avoid_: queue (alone), up next (UI copy only)

**Now playing**:
The surface showing the Track currently in playback (full route and/or mini-dock), including the vinyl centerpiece UI.
_Avoid_: player (alone), now playing bar (one chrome variant only)
