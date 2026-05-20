-- Phase T.1: Downgrade grace period column.
--
-- When a customer downgrades plans mid-cycle (e.g. Growth -> Starter)
-- and their current month's usage already exceeds the new plan's limit,
-- we extend grace until the current Stripe billing period ends. During
-- the grace window, overage continues to be soft-billed (status quo).
-- After the grace window passes, the middleware hard-blocks new bookings
-- at the new plan's limit instead of silently flagging overage.
--
-- NULL means no downgrade pending -- middleware uses the normal
-- soft-overage path (status quo).
--
-- Applied to prod 2026-05-20 via Supabase MCP.

ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS downgrade_grace_until timestamptz;

COMMENT ON COLUMN public.subscriptions.downgrade_grace_until IS
  'When a downgrade is detected mid-cycle, set to current_period_end. Middleware soft-bills overages until this passes, then hard-blocks at the new plan limit.';
