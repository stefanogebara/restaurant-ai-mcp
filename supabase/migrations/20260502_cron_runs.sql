-- cron_runs (H1)
-- ----------------------------------------------------------------------------
-- 43 cron files write to this table via api/_lib/cron-tracker.js (logCronRun
-- and logCronError). api/cron/health.js reads it to expose per-job freshness
-- + error rate. api/cron/health-alert.js (daily 10am UTC) escalates via
-- WhatsApp when overall status is 'degraded' or 'critical'.
--
-- Until this migration ran, the table didn't exist: every logCronRun() call
-- silently no-op'd, and /api/cron/health returned all jobs as "never_run".
-- A silently-broken cron could go undetected indefinitely.

BEGIN;

CREATE TABLE IF NOT EXISTS public.cron_runs (
  id BIGSERIAL PRIMARY KEY,

  -- The cron identifier matches what cron-tracker.js writes (e.g. 'check-late-reservations',
  -- 'manager-briefings', 'proactive-comms'). Used by health.js to look up freshness.
  job_name TEXT NOT NULL,

  -- When the cron run completed (success OR error log)
  ran_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Free-form metadata. logCronRun puts stats; logCronError puts
  -- { status: 'error', error_message: ... } so health checks can count failures.
  meta JSONB NOT NULL DEFAULT '{}'::jsonb
);

-- Health check uses this index for "latest run per job" + "errors in last 14d"
CREATE INDEX IF NOT EXISTS idx_cron_runs_job_ran
  ON public.cron_runs (job_name, ran_at DESC);

-- For purging old rows (we don't need history beyond ~30 days of operational data)
CREATE INDEX IF NOT EXISTS idx_cron_runs_ran_at
  ON public.cron_runs (ran_at);

-- RLS — only service role writes; no direct user access
ALTER TABLE public.cron_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS cron_runs_service_all ON public.cron_runs;
CREATE POLICY cron_runs_service_all
  ON public.cron_runs
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- No authenticated/anon read — cron health is internal observability,
-- not customer-facing.

GRANT SELECT, INSERT, UPDATE, DELETE ON public.cron_runs TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.cron_runs_id_seq TO service_role;

COMMIT;
