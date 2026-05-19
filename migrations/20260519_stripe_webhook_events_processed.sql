-- Phase R.2: Stripe webhook idempotency table.
--
-- Before this table, only customer.subscription.created had idempotency.
-- Stripe retries every webhook for up to 3 days on a 5xx response — so a
-- duplicate customer.subscription.deleted would mark a tenant cancelled
-- TWICE, customer.subscription.updated would re-run the plan transition
-- (and any downgrade side effects), invoice.paid would send the receipt
-- email twice + claim a referral reward twice.
--
-- INSERT-then-check pattern: handler tries to INSERT (event_id, type),
-- if it succeeds we process; if it fails with 23505 (unique violation)
-- we skip — the event was already processed by an earlier invocation.
--
-- Applied to prod 2026-05-19 via Supabase MCP.

CREATE TABLE IF NOT EXISTS public.stripe_webhook_events_processed (
  event_id text PRIMARY KEY,
  event_type text NOT NULL,
  processed_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS stripe_webhook_events_processed_processed_at_idx
  ON public.stripe_webhook_events_processed (processed_at);
