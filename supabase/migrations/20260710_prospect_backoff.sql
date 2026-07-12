-- Prospecting backoff (2026-07): stop the "invasive" over-pursuit that the
-- live data exposed (61% of messages asked questions; leads nudged the day
-- after a polite "no"). Two additive, live-safe changes:
--
--   1) widen prospect_state to allow 'recusou' — a soft, REVERSIBLE decline
--      park for a polite "não é o caso / já temos solução". Unlike 'optout'
--      (LGPD, terminal) it is NOT silent: the responder still answers a later
--      inbound and estadoAposAcao('responder') revives it to 'conversando'.
--      Every proactive selector whitelists active states, so parking here drops
--      the lead from nudge / re-engage / cold-touch / intro automatically.
--
--   2) add nudge_count — the engagement-taper counter. Two consecutive terse,
--      non-advancing replies + already nudged once → stop nudging (one last
--      gentle touch, then back off).
--
-- Apply BEFORE deploying the code that writes 'recusou' / nudge_count, or the
-- state CHECK (and the missing column) will reject the UPDATE.

ALTER TABLE public.prospect_leads
  DROP CONSTRAINT IF EXISTS prospect_leads_state_check;

ALTER TABLE public.prospect_leads
  ADD CONSTRAINT prospect_leads_state_check
  CHECK (prospect_state IN
    ('aguardando', 'conversando', 'agendando', 'agendado', 'handoff', 'optout', 'pausada', 'recusou'));

ALTER TABLE public.prospect_leads
  ADD COLUMN IF NOT EXISTS nudge_count INT NOT NULL DEFAULT 0;
