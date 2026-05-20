-- Phase U.3: Cron kill switch table.
--
-- Per-cron toggle that any cron handler can consult at the top and exit
-- gracefully when ops flips the bit. Ops can disable a misbehaving cron
-- via Supabase Studio in ~5 seconds -- no deploy, no waiting for the
-- next cron tick.
--
-- Default-enabled when no row exists (preserves backward compat for
-- crons that have not been migrated to consult this table yet).
--
-- Applied to prod 2026-05-20 via Supabase MCP.

CREATE TABLE IF NOT EXISTS public.cron_config (
  job_name text PRIMARY KEY,
  enabled boolean NOT NULL DEFAULT true,
  max_tenants_per_run integer,
  notes text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by text
);

COMMENT ON TABLE public.cron_config IS
  'Per-cron kill switch + light tunables. Each cron handler SELECTs enabled before doing work and exits 200 with skipped:disabled_by_ops if false.';

INSERT INTO public.cron_config (job_name, enabled, notes) VALUES
  ('manager-briefings',      true, 'Daily morning + EOD AI briefings to opted-in managers'),
  ('manager-alerts',         true, 'Per-day alert events to opted-in managers'),
  ('send-reminders',         true, 'Pre-visit WhatsApp reminders at 9 AM UTC'),
  ('send-campaigns',         true, 'Retention campaigns (every 15 min)'),
  ('send-feedback',          true, 'Post-visit feedback requests'),
  ('send-surveys',           true, 'Customer surveys'),
  ('update-churn-scores',    true, 'Daily churn + LTV recompute'),
  ('generate-reflections',   true, 'Daily Manager AI memory reflections'),
  ('proactive-comms',        true, 'Weekly proactive outreach drafts'),
  ('pre-reservation-upsell', true, 'Dish recommendations before visit'),
  ('demo-nurture',           true, 'Demo conversion email drip'),
  ('report-usage',           true, 'Daily Stripe metered usage report')
ON CONFLICT (job_name) DO NOTHING;
