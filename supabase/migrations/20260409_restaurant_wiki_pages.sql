-- Restaurant Wiki Pages
-- LLM-compiled knowledge articles per restaurant (Karpathy wiki pattern)
-- Knowledge compiled once, served many times — replaces repeated vector search

CREATE TABLE IF NOT EXISTS restaurant_wiki_pages (
  id             UUID         DEFAULT gen_random_uuid() PRIMARY KEY,
  restaurant_id  UUID         NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  slug           TEXT         NOT NULL,        -- overview | customers | patterns | performance | operations
  title          TEXT         NOT NULL,
  content        TEXT         NOT NULL,
  source_hash    TEXT,                          -- MD5 of input data; skip recompile if unchanged
  compiled_at    TIMESTAMPTZ  DEFAULT now(),
  created_at     TIMESTAMPTZ  DEFAULT now(),
  UNIQUE (restaurant_id, slug)
);

CREATE INDEX IF NOT EXISTS idx_wiki_restaurant ON restaurant_wiki_pages (restaurant_id);

-- RLS: only service-role reads (no user-facing API needed)
ALTER TABLE restaurant_wiki_pages ENABLE ROW LEVEL SECURITY;
