-- 20260724_prospect_ganho.sql — 'ganho': the terminal WON state the FSM never had
-- =============================================================================
-- Authored 2026-07-23; DATED 07-24 on purpose. A sibling migration landed the
-- same day — 20260723_prospect_porteiro.sql — and BOTH rewrite the single
-- constraint prospect_leads_state_check (DROP + ADD). This file must run AFTER
-- porteiro's, or a fresh replay would end on porteiro's list (which predates
-- 'ganho') and silently drop the WON state. The 07-24 prefix guarantees the
-- ordering; the CHECK below is the reconciled UNION of both (…, 'porteiro',
-- 'ganho'). Prod was reconciled to this exact list by hand on 2026-07-23.
--
-- The prospect FSM could express every way a deal DIES (optout, recusou, pausada,
-- porteiro) but not the way it WINS. So a lead the founder closed offline — via
-- the daily digest's wa.me link — stayed in 'handoff' forever, and the cold-
-- handoff reclaim sweep (sequencer.reclaimColdHandoffs) would re-warm a paying
-- customer with a sales template 4 days later. The mitigation was to park the
-- reclaim OFF and ask the founder to mark closed leads as 'pausada' — a kill
-- switch borrowed to mean "won", which no report can read back.
--
-- 'ganho' is terminal + SILENT (prospect-state.SILENT_STATES): the agent stops
-- talking, every proactive selector already whitelists ACTIVE states so it drops
-- out of nudge / re-engage / follow-up / intro automatically, and the reclaim
-- sweep only ever selects prospect_state = 'handoff'. Reversible by the operator
-- (cockpit "Reativar" → 'conversando') — only 'optout' is DB-enforced terminal.
--
-- Two additive, live-safe changes:
--   1) widen the state CHECK to allow 'ganho' (keeping 'porteiro' from the sibling)
--   2) fire the outcome-capture trigger on it, so a WIN lands in prospect_outcomes
--      next to the losses (it is the one outcome the funnel most needs to count)
--
-- Apply BEFORE deploying the code that writes 'ganho', or the CHECK rejects the
-- UPDATE (prospect-admin ?action=won and /api/prospect-close both write it).
-- =============================================================================

ALTER TABLE public.prospect_leads
  DROP CONSTRAINT IF EXISTS prospect_leads_state_check;

ALTER TABLE public.prospect_leads
  ADD CONSTRAINT prospect_leads_state_check
  CHECK (prospect_state IN
    ('aguardando', 'conversando', 'agendando', 'agendado', 'handoff',
     'optout', 'pausada', 'recusou', 'porteiro', 'ganho'));

-- Outcome capture: same trigger function, widened WHEN. 'ganho' joins the
-- terminal set so prospect_outcomes (and prospect_outcomes_agg / the cockpit
-- funnel) can finally report wins, not just how conversations ended badly.
-- (porteiro is NOT terminal — a human can still take over — so it is not added
-- here; the sibling migration deliberately left this trigger untouched.)
drop trigger if exists trg_prospect_capture_outcome on public.prospect_leads;
create trigger trg_prospect_capture_outcome
  after update of prospect_state on public.prospect_leads
  for each row
  when (
    NEW.prospect_state in ('agendado', 'handoff', 'optout', 'pausada', 'ganho')
    and NEW.prospect_state is distinct from OLD.prospect_state
  )
  execute function public.prospect_capture_outcome();
