-- #32 Dated-callback queue.
--
-- The conversion study (72 real threads) found 5 accepted-but-dropped callbacks:
-- a lead says "me chama amanhã" / "liga segunda", or Olímpia promises "segunda
-- retomo", and nothing fires. R6: promessa datada é contrato.
--
-- retorno_em     = when to reach back (set by the agendar_retorno tool, cleared
--                  on the lead's next inbound or once the retomada fires)
-- retorno_motivo = short "what was said" for the cockpit timeline
--
-- Applied to seatable-eu (ckforlwdhewexyqljsaf) on 2026-07-07 via the Supabase
-- MCP apply_migration.

ALTER TABLE public.prospect_leads
  ADD COLUMN IF NOT EXISTS retorno_em     timestamptz,
  ADD COLUMN IF NOT EXISTS retorno_motivo text;

-- Partial index: the flush cron scans only leads with a pending callback.
CREATE INDEX IF NOT EXISTS idx_prospect_leads_retorno_em
  ON public.prospect_leads (retorno_em)
  WHERE retorno_em IS NOT NULL;
