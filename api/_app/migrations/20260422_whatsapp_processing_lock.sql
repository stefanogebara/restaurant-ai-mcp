-- Cross-Lambda per-phone processing lock for WhatsApp webhooks.
--
-- Problem: acquireProcessingLock() in rate-limit.js relied on Redis SET NX,
-- which silently fails on Vercel (see 20260422_whatsapp_message_dedup.sql
-- for context — same reliability issue). When the lock fails open, two
-- Lambdas processing two messages from the same phone both pass through,
-- run the LLM in parallel, both call tools, and both send replies. The
-- user perceives this as the agent "running twice" or duplicate replies.
--
-- Fix: Supabase-backed lock with TTL. Same atomic unique-constraint pattern
-- as whatsapp_message_dedup, but with an expires_at column so locks that
-- outlive a crashed Lambda get released automatically by the next acquirer.

CREATE TABLE IF NOT EXISTS public.whatsapp_processing_lock (
  phone      text        PRIMARY KEY,
  expires_at timestamptz NOT NULL
);

-- Used by the cleanup pass to find+delete expired locks before re-acquiring.
CREATE INDEX IF NOT EXISTS idx_whatsapp_processing_lock_expires
  ON public.whatsapp_processing_lock (expires_at);

-- Service role only; no RLS needed (admin-only access).
ALTER TABLE public.whatsapp_processing_lock ENABLE ROW LEVEL SECURITY;
