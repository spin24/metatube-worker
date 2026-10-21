-- MetaTube (slim Workers port) — D1 schema.
-- Mirrors model.MovieInfo from metatube-sdk-go, flattened for SQLite:
-- string arrays (actors / genres / preview_images) are stored as JSON text.
-- No image-processing columns are needed: the slim port stores URLs only.

CREATE TABLE IF NOT EXISTS movie_metadata (
  provider               TEXT    NOT NULL,
  id                     TEXT    NOT NULL,
  number                 TEXT    NOT NULL DEFAULT '',
  title                  TEXT    NOT NULL DEFAULT '',
  summary                TEXT    NOT NULL DEFAULT '',
  homepage               TEXT    NOT NULL DEFAULT '',
  director               TEXT    NOT NULL DEFAULT '',
  actors                 TEXT    NOT NULL DEFAULT '[]',
  thumb_url              TEXT    NOT NULL DEFAULT '',
  cover_url              TEXT    NOT NULL DEFAULT '',
  preview_video_url      TEXT    NOT NULL DEFAULT '',
  preview_video_hls_url  TEXT    NOT NULL DEFAULT '',
  preview_images         TEXT    NOT NULL DEFAULT '[]',
  maker                  TEXT    NOT NULL DEFAULT '',
  label                  TEXT    NOT NULL DEFAULT '',
  series                 TEXT    NOT NULL DEFAULT '',
  genres                 TEXT    NOT NULL DEFAULT '[]',
  score                  REAL    NOT NULL DEFAULT 0,
  runtime                INTEGER NOT NULL DEFAULT 0,
  release_date           TEXT    NOT NULL DEFAULT '',
  created_at             INTEGER NOT NULL DEFAULT 0,
  updated_at             INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (provider, id)
);

-- Lookups by (provider, number) back the fallback search path.
CREATE INDEX IF NOT EXISTS idx_movie_metadata_number
  ON movie_metadata (provider, number);
