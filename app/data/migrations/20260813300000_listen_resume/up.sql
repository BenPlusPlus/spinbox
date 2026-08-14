CREATE TABLE listen_resume (
  member_id TEXT NOT NULL REFERENCES members (id) ON DELETE CASCADE,
  track_id TEXT NOT NULL REFERENCES tracks (id) ON DELETE CASCADE,
  position_ms INTEGER NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (member_id, track_id)
);

CREATE TABLE listen_resume_target (
  member_id TEXT PRIMARY KEY REFERENCES members (id) ON DELETE CASCADE,
  track_id TEXT REFERENCES tracks (id) ON DELETE SET NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE recently_played (
  member_id TEXT NOT NULL REFERENCES members (id) ON DELETE CASCADE,
  track_id TEXT NOT NULL REFERENCES tracks (id) ON DELETE CASCADE,
  played_at TEXT NOT NULL,
  seq INTEGER NOT NULL,
  PRIMARY KEY (member_id, track_id)
);
