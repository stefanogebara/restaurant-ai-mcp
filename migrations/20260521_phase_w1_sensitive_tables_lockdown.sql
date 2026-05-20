-- Phase W.1: lock down the four highest-blast-radius advisor findings.
--
-- Supabase advisors flagged:
--   1. public.api_keys                      — RLS DISABLED, but contains tenant API keys
--   2. public.pos_connections               — RLS DISABLED + sensitive access_token / refresh_token columns
--   3. public.cron_config                   — RLS DISABLED, my new V.5 ops table
--   4. public.stripe_webhook_events_processed — RLS DISABLED, reveals webhook event IDs
--
-- Verification before this migration:
--   - public.api_keys has 0 rows; restaurant.api_keys has 2 rows (real data).
--   - public.pos_connections has 0 rows; restaurant.pos_connections has 0 rows.
--   - All application code paths use supabaseAdmin (service_role) AND go through
--     the restaurant.* schema variant. The public.* variants are unused.
--   - No FKs, views, or triggers reference the public.* duplicates.
--
-- Strategy:
--   - public.api_keys + public.pos_connections: DROP. They are dead duplicates of
--     restaurant.* tables; keeping them is pure liability (someone could write a
--     token into the wrong one and never notice).
--   - public.cron_config + public.stripe_webhook_events_processed: ENABLE RLS
--     with NO policies. Service-role bypasses RLS, so the cron + webhook code
--     keeps working. Anon and authenticated lose access — which is what we want.

-- ----------------------------------------------------------------------------
-- 1. Drop the zombie tables.
--    Use IF EXISTS so re-running the migration is safe.
-- ----------------------------------------------------------------------------
DROP TABLE IF EXISTS public.api_keys;
DROP TABLE IF EXISTS public.pos_connections;

-- ----------------------------------------------------------------------------
-- 2. Lock cron_config. Created by Phase V; no API code reads it via PostgREST,
--    only the server-side cron-config helper via supabaseAdmin.
-- ----------------------------------------------------------------------------
ALTER TABLE public.cron_config ENABLE ROW LEVEL SECURITY;
-- Defense-in-depth: explicitly revoke API access for anon/authenticated roles
-- so even an accidentally-added FORCE-bypass policy can't leak the table.
REVOKE ALL ON public.cron_config FROM anon, authenticated;

COMMENT ON TABLE public.cron_config IS
  'Phase U.3 + V.5 + W.1: per-cron kill switch. Service-role-only via RLS. '
  'Ops manage rows through Supabase Studio (admin) or supabaseAdmin from cron-config.js.';

-- ----------------------------------------------------------------------------
-- 3. Lock stripe_webhook_events_processed. Only written by api/stripe-webhook.js
--    using supabaseAdmin; only read by the same handler for idempotency checks.
-- ----------------------------------------------------------------------------
ALTER TABLE public.stripe_webhook_events_processed ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.stripe_webhook_events_processed FROM anon, authenticated;

COMMENT ON TABLE public.stripe_webhook_events_processed IS
  'Phase S.1 + W.1: Stripe webhook idempotency dedup. Service-role-only via RLS.';
