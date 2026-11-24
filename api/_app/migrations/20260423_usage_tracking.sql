-- Metered-billing usage tracking.
--
-- trackUsage() in api/_lib/usage-tracking.js calls increment_usage() via RPC,
-- then falls back to a direct INSERT — but the table never existed, so every
-- write logged "relation 'usage_tracking' does not exist" and metered billing
-- silently degraded. This migration creates the table + the RPC.
--
-- Columns match the queries in stripe-usage-reporter.js (id, metric_type,
-- count, period, restaurant_id, reported_to_stripe).

CREATE TABLE IF NOT EXISTS public.usage_tracking (
  id          uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid       NOT NULL,
  metric_type text         NOT NULL,
  period      date         NOT NULL,
  count       integer      NOT NULL DEFAULT 0,
  reported_to_stripe timestamptz,
  created_at  timestamptz  NOT NULL DEFAULT now(),
  updated_at  timestamptz  NOT NULL DEFAULT now(),
  UNIQUE (restaurant_id, metric_type, period)
);

CREATE INDEX IF NOT EXISTS idx_usage_tracking_restaurant_period
  ON public.usage_tracking (restaurant_id, period DESC);

CREATE INDEX IF NOT EXISTS idx_usage_tracking_unreported
  ON public.usage_tracking (restaurant_id, period)
  WHERE reported_to_stripe IS NULL;

-- Intentional: no policies. RLS enabled + zero policies means only
-- service_role (which bypasses RLS) can read/write. All current callers
-- (trackUsage, stripe-usage-reporter, manager-usage, whatsapp-settings)
-- use supabaseAdmin. If any user-JWT code path is added later, grant an
-- explicit SELECT policy for the restaurant owner to avoid silent empties.
ALTER TABLE public.usage_tracking ENABLE ROW LEVEL SECURITY;

-- Atomic increment: upsert a row and add to its count in one statement.
-- Called as: supabase.rpc('increment_usage', { p_restaurant_id, p_metric_type, p_period })
CREATE OR REPLACE FUNCTION public.increment_usage(
  p_restaurant_id uuid,
  p_metric_type   text,
  p_period        date
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO public.usage_tracking (restaurant_id, metric_type, period, count)
  VALUES (p_restaurant_id, p_metric_type, p_period, 1)
  ON CONFLICT (restaurant_id, metric_type, period)
  DO UPDATE SET
    count      = public.usage_tracking.count + 1,
    updated_at = now();
END;
$$;

GRANT EXECUTE ON FUNCTION public.increment_usage(uuid, text, date) TO service_role;
