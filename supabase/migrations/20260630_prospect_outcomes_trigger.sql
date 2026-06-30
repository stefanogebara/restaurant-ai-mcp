-- 20260630_prospect_outcomes_trigger.sql — capture + aggregate conversation outcomes
-- =============================================================================
-- Phase 5. "Train after every prospect": record an outcome row whenever a lead
-- reaches a terminal state (agendado/handoff/optout/pausada). Captured by a
-- TRIGGER on prospect_leads so it catches EVERY path (responder, booking,
-- admin/cockpit, future crons) without editing each one (DRY, leak-proof).
--
-- quality_score + theme_tags are left NULL here; the daily prospect-score-outcomes
-- cron fills them (1–5 + tags via Haiku). Strategy/prompt changes stay HUMAN —
-- this is dashboard INPUT only, never auto-mutation. The prospect_outcomes table
-- already exists (20260626_prospecting.sql). Additive + idempotent.
-- =============================================================================

create or replace function public.prospect_capture_outcome()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_n int;
begin
  select count(*) into v_n from public.prospect_messages where lead_id = NEW.id;
  insert into public.prospect_outcomes (lead_id, outcome, n_messages, handoff_motivo)
  values (NEW.id, NEW.prospect_state, coalesce(v_n, 0), NEW.handoff_motivo);
  return NEW;
end $$;

drop trigger if exists trg_prospect_capture_outcome on public.prospect_leads;
create trigger trg_prospect_capture_outcome
  after update of prospect_state on public.prospect_leads
  for each row
  when (
    NEW.prospect_state in ('agendado', 'handoff', 'optout', 'pausada')
    and NEW.prospect_state is distinct from OLD.prospect_state
  )
  execute function public.prospect_capture_outcome();

-- Dashboard aggregates in one call. Window in days; default 30. Service-role only
-- (prospecting is an internal single tenant; the cockpit reads via service role).
create or replace function public.prospect_outcomes_agg(p_dias int default 30)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with janela as (
    select * from public.prospect_outcomes
    where created_at >= now() - make_interval(days => greatest(p_dias, 1))
  )
  select jsonb_build_object(
    'desde_dias', greatest(p_dias, 1),
    'total', (select count(*) from janela),
    'por_outcome', coalesce(
      (select jsonb_object_agg(outcome, c) from (select outcome, count(*) c from janela group by outcome) t),
      '{}'::jsonb),
    'media_mensagens', coalesce((select round(avg(n_messages), 1) from janela), 0),
    'media_qualidade', (select round(avg(quality_score), 2) from janela where quality_score is not null),
    'temas_top', coalesce(
      (select jsonb_agg(jsonb_build_object('tema', tema, 'n', c))
         from (select unnest(theme_tags) tema, count(*) c from janela group by 1 order by c desc limit 10) t),
      '[]'::jsonb)
  );
$$;

revoke execute on function public.prospect_outcomes_agg(int) from public, anon;
grant execute on function public.prospect_outcomes_agg(int) to service_role;
