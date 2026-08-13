CREATE TABLE tracks (
  id TEXT PRIMARY KEY,
  path TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  artist TEXT NOT NULL,
  album TEXT NOT NULL,
  album_artist TEXT NOT NULL,
  disc_number INTEGER,
  track_number INTEGER,
  duration_ms INTEGER,
  mime TEXT NOT NULL,
  mtime_ms INTEGER NOT NULL,
  size INTEGER NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE scan_runs (
  id TEXT PRIMARY KEY,
  status TEXT NOT NULL CHECK (status IN ('running', 'succeeded', 'failed')),
  started_at TEXT NOT NULL,
  finished_at TEXT,
  started_by TEXT NOT NULL,
  tracks_seen INTEGER,
  tracks_upserted INTEGER,
  tracks_pruned INTEGER,
  error TEXT
);
