CREATE TABLE playlists (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES members (id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE playlist_items (
  playlist_id TEXT NOT NULL REFERENCES playlists (id) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  track_id TEXT REFERENCES tracks (id) ON DELETE SET NULL,
  path TEXT NOT NULL,
  title TEXT NOT NULL,
  artist TEXT NOT NULL,
  album TEXT NOT NULL,
  PRIMARY KEY (playlist_id, position)
);
