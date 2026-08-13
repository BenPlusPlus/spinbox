CREATE TABLE members (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL COLLATE NOCASE,
  display_name TEXT,
  role TEXT NOT NULL CHECK (role IN ('admin', 'member')),
  disabled_at TEXT,
  created_at TEXT NOT NULL
);

CREATE UNIQUE INDEX members_email_uq ON members (email);

CREATE TABLE credentials (
  member_id TEXT PRIMARY KEY REFERENCES members (id) ON DELETE CASCADE,
  password_hash TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
