-- Migration: Create cron_runs table for cron health monitoring
-- Date: 2026-03-13
-- Part of: 12E-7 Cron health monitoring

-- Table to track cron job executions
CREATE TABLE IF NOT EXISTS public.cron_runs (
  id BIGSERIAL PRIMARY KEY,
  job_name TEXT NOT NULL,
  ran_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  meta JSONB DEFAULT '{}'::jsonb
);

-- Index for fast lookups by job name + time
CREATE INDEX IF NOT EXISTS idx_cron_runs_job_name_ran_at
  ON public.cron_runs (job_name, ran_at DESC);

-- Auto-cleanup: keep only last 30 days of runs
-- (can be called by a separate cleanup cron or manually)
CREATE OR REPLACE FUNCTION public.cleanup_old_cron_runs()
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM public.cron_runs
  WHERE ran_at < now() - INTERVAL '30 days';
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- RPC function to get latest run per job (used by /api/cron/health)
CREATE OR REPLACE FUNCTION public.get_latest_cron_runs()
RETURNS TABLE(job_name TEXT, last_ran_at TIMESTAMPTZ, meta JSONB) AS $$
  SELECT DISTINCT ON (job_name)
    job_name,
    ran_at AS last_ran_at,
    meta
  FROM public.cron_runs
  ORDER BY job_name, ran_at DESC;
$$ LANGUAGE sql;

-- Grant access to service role (used by supabaseAdmin)
GRANT ALL ON public.cron_runs TO service_role;
GRANT USAGE, SELECT ON SEQUENCE cron_runs_id_seq TO service_role;
GRANT EXECUTE ON FUNCTION public.get_latest_cron_runs() TO service_role;
GRANT EXECUTE ON FUNCTION public.cleanup_old_cron_runs() TO service_role;
