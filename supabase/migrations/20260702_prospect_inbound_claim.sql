-- 20260702_prospect_inbound_claim.sql — atomic per-inbound reply claim
-- =============================================================================
-- Phase 6 (Olivia fine-tuning port). One wamid = one reply: the responder does
--   UPDATE prospect_leads SET last_in_wamid = :wamid
--   WHERE id = :lead AND (last_in_wamid IS NULL OR last_in_wamid <> :wamid)
-- and only the caller that gets a row back answers. Closes the flush-vs-webhook
-- race and burst re-invocations (ported from olivia_claim_inbound, migration
-- 0035 in prospectautomation). Additive + idempotent.
-- =============================================================================

alter table public.prospect_leads
  add column if not exists last_in_wamid text;
