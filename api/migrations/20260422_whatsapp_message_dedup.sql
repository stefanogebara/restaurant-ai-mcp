-- Cross-Lambda dedup for WhatsApp webhooks.
-- Redis-based dedup (rate-limit.js) is silently failing on Vercel despite
-- UPSTASH_REDIS_REST_URL/TOKEN env vars being present (confirmed via
-- /api/diag-session on 2026-04-22: dbsize stays at 0 regardless of traffic).
--
-- This table gives us atomic cross-Lambda dedup via the UNIQUE constraint:
-- every incoming webhook does INSERT ... ON CONFLICT DO NOTHING. If inserted,
-- this Lambda processes; if conflict, another Lambda already owns it and we
-- return early.

CREATE TABLE IF NOT EXISTS public.whatsapp_message_dedup (
  message_id text PRIMARY KEY,
  seen_at    timestamptz NOT NULL DEFAULT now()
);

-- Cleanup index — old rows get GC'd by a cron (see api/cron/cleanup-dedup.js)
CREATE INDEX IF NOT EXISTS idx_whatsapp_message_dedup_seen_at
  ON public.whatsapp_message_dedup (seen_at);

-- Service role needs INSERT/DELETE; no RLS needed (admin-only writes).
ALTER TABLE public.whatsapp_message_dedup ENABLE ROW LEVEL SECURITY;
