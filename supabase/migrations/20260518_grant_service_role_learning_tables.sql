-- The 2026-05-18 migration that created restaurant.learning_interviews and
-- restaurant.restaurant_intelligence omitted the GRANT statements that
-- Supabase's PostgREST layer requires for SERVICE_ROLE_KEY to access them.
-- Postgres-level service_role had no privileges on the new tables, so every
-- supabase-js insert through the lambda returned "permission denied for
-- table learning_interviews". Direct SQL via the dashboard worked because
-- that runs as postgres superuser.
--
-- Pinpointed during 2026-05-18 audit via step-by-step bisection of /research:
--   - debug=2 (after first Supabase update) → 200
--   - debug=3 (before startOrResumeInterview) → 200
--   - debug=4 (after startOrResumeInterview) → 500
-- Wrapping the insert's catch with the actual error.message surfaced
-- "permission denied for table learning_interviews".
-- Applied to prod via Supabase MCP same day; /research went 500 → 201
-- immediately.

GRANT USAGE ON SCHEMA restaurant TO service_role, authenticated, anon;

GRANT ALL ON restaurant.learning_interviews TO service_role;
GRANT ALL ON restaurant.restaurant_intelligence TO service_role;

GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA restaurant TO service_role;
