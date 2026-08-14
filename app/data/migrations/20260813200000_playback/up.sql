CREATE TABLE listening_sessions (
  member_id TEXT PRIMARY KEY REFERENCES members (id) ON DELETE CASCADE,
  current_track_id TEXT REFERENCES tracks (id) ON DELETE SET NULL,
  playhead_ms INTEGER NOT NULL DEFAULT 0,
  playing INTEGER NOT NULL DEFAULT 0 CHECK (playing IN (0, 1)),
  shuffle INTEGER NOT NULL DEFAULT 0 CHECK (shuffle IN (0, 1)),
  repeat_mode TEXT NOT NULL DEFAULT 'off' CHECK (repeat_mode IN ('off', 'all', 'one')),
  updated_at TEXT NOT NULL
);

CREATE TABLE play_queue_items (
  member_id TEXT NOT NULL REFERENCES members (id) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  track_id TEXT NOT NULL REFERENCES tracks (id) ON DELETE CASCADE,
  PRIMARY KEY (member_id, position)
);
