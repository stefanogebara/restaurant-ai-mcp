-- Referral leads: registrar_responsavel now turns a referred owner number into
-- its own prospect lead (source='indicacao') and auto-dispatches the intro
-- template (sequencer.dispatchReferralIntros). The first live campaign captured
-- 5 owner numbers and all 5 died inside handoff_motivo waiting for a human.
--
-- Additive-only: extends the source CHECK with 'indicacao'. No data change.

alter table public.prospect_leads
  drop constraint if exists prospect_leads_source_check;

alter table public.prospect_leads
  add constraint prospect_leads_source_check
  check (source = any (array[
    'google_places'::text,
    'manual'::text,
    'import'::text,
    'indicacao'::text
  ]));
