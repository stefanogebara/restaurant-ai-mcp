-- Phase C tables created via Supabase MCP `apply_migration` (which calls
-- the management API) didn't get the service_role grants that the older
-- migrations in this repo all include explicitly. Vercel functions use
-- supabaseAdmin (service_role) and got 403 "permission denied for table"
-- on every read — surfaced by the C.E2E full-platform audit on
-- /host-dashboard/voice-settings.
--
-- This migration backfills the missing GRANTs for all three tables. Also
-- ALSO defines schema-level default privileges so any future CREATE TABLE
-- in `restaurant` auto-gets the same grants without us forgetting again.

-- C.15: scheduled_instagram_posts
GRANT SELECT, INSERT, UPDATE, DELETE
  ON restaurant.scheduled_instagram_posts
  TO service_role;

-- C.19: instagram_video_jobs
GRANT SELECT, INSERT, UPDATE, DELETE
  ON restaurant.instagram_video_jobs
  TO service_role;

-- C.22: ai_generation_events
GRANT SELECT, INSERT, UPDATE, DELETE
  ON restaurant.ai_generation_events
  TO service_role;

-- Schema-level defaults so the next Phase C table that lands doesn't
-- silently 403 in prod. Anything CREATEd in `restaurant` by `postgres`
-- from this point on gets service_role full DML access by default.
ALTER DEFAULT PRIVILEGES IN SCHEMA restaurant
  GRANT SELECT, INSERT, UPDATE, DELETE
  ON TABLES TO service_role;

NOTIFY pgrst, 'reload schema';
