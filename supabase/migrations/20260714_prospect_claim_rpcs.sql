-- PostgREST on this project deterministically rejects any UPDATE that carries
-- an or= filter: 42703 "column prospect_leads.<or-column> does not exist",
-- while the SAME or= on GET succeeds (verified empirically 2026-07-14 with
-- no-op probes; NOTIFY pgrst reload does not help). Both of the prospecting
-- pipeline's atomic claims used exactly that construct:
--
--   claimInbound  UPDATE + or(last_in_wamid...)  → failed on EVERY inbound
--                 since Jul 3 (degrade-open masked it — 309 logged errors;
--                 the per-inbound dedup safety net was effectively off)
--   re-engage     UPDATE + or(snoozed_until...)  → claim always lost, so no
--                 'resgate' template was EVER dispatched
--
-- These SQL RPCs replace the failing construct with a plain UPDATE ... WHERE
-- ... OR ... in SQL, which is untouched by the PostgREST bug. Service-role
-- only (deliberately not callable by anon/authenticated).

create or replace function public.claim_prospect_inbound(p_lead_id uuid, p_wamid text)
returns boolean
language sql
security definer
set search_path = public
as $$
  update prospect_leads
     set last_in_wamid = p_wamid
   where id = p_lead_id
     and (last_in_wamid is null or last_in_wamid <> p_wamid)
  returning true;
$$;

-- States kept in sync with REENGAGE_STATES (prospect-store.js).
create or replace function public.claim_prospect_reengage(p_lead_id uuid, p_until timestamptz, p_now timestamptz)
returns boolean
language sql
security definer
set search_path = public
as $$
  update prospect_leads
     set snoozed_until = p_until
   where id = p_lead_id
     and prospect_state in ('conversando', 'agendando')
     and (snoozed_until is null or snoozed_until < p_now)
  returning true;
$$;

revoke all on function public.claim_prospect_inbound(uuid, text) from public, anon, authenticated;
revoke all on function public.claim_prospect_reengage(uuid, timestamptz, timestamptz) from public, anon, authenticated;
