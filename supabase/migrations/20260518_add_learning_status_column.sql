-- research.js writes restaurant_config.learning_status to track interview progress
-- ('pending' → 'scraping' → 'scraped' → 'interviewing' → 'complete'). Column never
-- existed — the previous 500 was a PostgREST "column not found", surfaced as
-- FUNCTION_INVOCATION_FAILED through the unhandled rejection from a chained .eq().
-- Applied to prod via Supabase MCP 2026-05-18 after the learning_interviews
-- migration unblocked the original table-not-found 500.

ALTER TABLE restaurant.restaurant_config
  ADD COLUMN IF NOT EXISTS learning_status TEXT DEFAULT 'pending'
    CHECK (learning_status IN ('pending', 'scraping', 'scraped', 'interviewing', 'complete'));
