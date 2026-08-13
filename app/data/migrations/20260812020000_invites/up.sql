CREATE TABLE invites (
  id TEXT PRIMARY KEY,
  token_hash TEXT NOT NULL,
  email TEXT COLLATE NOCASE,
  created_by TEXT NOT NULL REFERENCES members (id),
  expires_at TEXT NOT NULL,
  revoked_at TEXT,
  accepted_at TEXT,
  accepted_by TEXT REFERENCES members (id),
  created_at TEXT NOT NULL
);

CREATE UNIQUE INDEX invites_token_hash_uq ON invites (token_hash);
