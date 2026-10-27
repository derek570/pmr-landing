-- Review comments left on the PMR website in review mode.
CREATE TABLE IF NOT EXISTS comments (
  id            TEXT PRIMARY KEY,
  page          TEXT NOT NULL,           -- e.g. "services.html"
  section       TEXT NOT NULL,           -- data-review key, e.g. "services-storage"
  section_label TEXT NOT NULL,
  target        TEXT,                    -- what was double-tapped, e.g. "Photo: Bike on track"
  kind          TEXT NOT NULL CHECK (kind IN ('comment', 'content')),
  author        TEXT NOT NULL,
  body          TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved')),
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS comments_page ON comments (page, section);
