ALTER TABLE tracks ADD COLUMN artwork_kind TEXT NULL CHECK (artwork_kind IN ('folder', 'embedded'));
ALTER TABLE tracks ADD COLUMN artwork_path TEXT NULL;
ALTER TABLE tracks ADD COLUMN artwork_checked INTEGER NOT NULL DEFAULT 0;
