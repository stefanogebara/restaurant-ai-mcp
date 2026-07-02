-- 20260702_prospect_platform.sql — Phase 8: best-in-class prospecting platform
-- =============================================================================
-- Feature substrate for the Olímpia Ops console, synthesized from a research
-- sweep of Instantly/Smartlead/Apollo/Chatwoot/BR-disparo tools + Meta policy:
--   F1 Triagem       — AI intent labels on inbound replies (work-the-queue UX)
--   F2 Abordagens    — A/B intro variants (Meta-approved templates) + funnel
--   F3 Receipts      — per-message delivered/read/failed status (tick marks)
--   F4 Multi-touch   — bump D+3 / breakup D+8 for never-repliers
--   F5 Number health — quality events + circuit breaker audit trail
--   F6 Workbench     — snooze, private notes, activity timeline (sys rows)
--   F7 Insights      — aggregation RPCs over already-collected outcome data
--   F8 Canned        — slash-command reply macros
-- All tables are service-role only (RLS on, no public policy) — the prospecting
-- subsystem is an internal single-tenant tool. Additive + idempotent.
-- =============================================================================

-- ---- F3: per-message delivery receipts -------------------------------------
alter table public.prospect_messages
  add column if not exists status text
    check (status in ('sent', 'delivered', 'read', 'failed')),
  add column if not exists status_at timestamptz,
  add column if not exists error_detail text;

-- ---- F1: intent labels -------------------------------------------------------
alter table public.prospect_messages
  add column if not exists intent text;
alter table public.prospect_leads
  add column if not exists last_intent text,
  add column if not exists last_intent_at timestamptz,
  add column if not exists last_in_at timestamptz; -- last inbound (24h window + triage ordering)
create index if not exists prospect_leads_last_intent on public.prospect_leads (last_intent)
  where last_intent is not null;

-- ---- F2: intro variants (Meta-APPROVED template registry) -------------------
-- Compliance note: cold touches happen OUTSIDE the 24h service window, so every
-- variant/touch body must be a Meta-approved template. This table REGISTERS
-- approved templates (name + preview for the console); approval itself happens
-- in WhatsApp Manager.
create table if not exists public.prospect_templates (
  id            uuid primary key default gen_random_uuid(),
  variant_label text not null,              -- 'A', 'B', ...
  touch_number  int  not null default 1,    -- 1 = intro, 2 = bump, 3 = breakup
  meta_template_name text not null,         -- approved template name in WhatsApp Manager
  template_lang text not null default 'pt_BR',
  body_preview  text,                       -- what the operator sees in the console
  active        boolean not null default true,
  updated_at    timestamptz not null default now(),
  unique (touch_number, variant_label)
);
alter table public.prospect_templates enable row level security;

alter table public.prospect_leads
  add column if not exists intro_variant text;

-- ---- F4: multi-touch sequence ------------------------------------------------
alter table public.prospect_leads
  add column if not exists touch_count int not null default 1,
  add column if not exists next_touch_at timestamptz;
create index if not exists prospect_leads_next_touch on public.prospect_leads (next_touch_at)
  where next_touch_at is not null;

-- ---- F5: number health events -------------------------------------------------
create table if not exists public.prospect_number_events (
  id         uuid primary key default gen_random_uuid(),
  event_type text not null,                 -- quality_update | failed_rate_breaker | auto_pause | manual
  rating     text,                          -- GREEN | YELLOW | RED (when quality_update)
  detail     text,
  payload    jsonb,
  created_at timestamptz not null default now()
);
alter table public.prospect_number_events enable row level security;
create index if not exists prospect_number_events_created on public.prospect_number_events (created_at desc);

-- ---- F6: workbench --------------------------------------------------------------
alter table public.prospect_leads
  add column if not exists snoozed_until timestamptz;
create index if not exists prospect_leads_snoozed on public.prospect_leads (snoozed_until)
  where snoozed_until is not null;

-- sys rows (notes + events) share the messages table → one timeline, one renderer.
alter table public.prospect_messages drop constraint if exists prospect_messages_direcao_check;
alter table public.prospect_messages
  add constraint prospect_messages_direcao_check check (direcao in ('in', 'out', 'sys'));

-- ---- F8: canned responses -------------------------------------------------------
create table if not exists public.prospect_canned (
  id         uuid primary key default gen_random_uuid(),
  short_code text not null unique,
  body       text not null,
  updated_at timestamptz not null default now()
);
alter table public.prospect_canned enable row level security;

-- ---- F2 report: per-variant funnel ------------------------------------------------
create or replace function public.prospect_variant_funnel()
returns jsonb
language sql stable security definer
set search_path = public, pg_temp
as $$
  with base as (
    select l.id, l.intro_variant, l.reuniao_at, l.prospect_state,
           exists (select 1 from public.prospect_messages m
                   where m.lead_id = l.id and m.direcao = 'in') as replied,
           exists (select 1 from public.prospect_messages m
                   where m.lead_id = l.id and m.direcao = 'out' and m.status in ('delivered','read')) as delivered,
           exists (select 1 from public.prospect_messages m
                   where m.lead_id = l.id and m.direcao = 'out' and m.status = 'read') as read_any,
           (select avg(o.quality_score) from public.prospect_outcomes o
            where o.lead_id = l.id and o.quality_score is not null) as quality
    from public.prospect_leads l
    where l.intro_variant is not null
  )
  select coalesce(jsonb_agg(row_.j order by row_.variant), '[]'::jsonb) from (
    select intro_variant as variant, jsonb_build_object(
      'variant', intro_variant,
      'sent', count(*),
      'delivered', count(*) filter (where delivered),
      'read', count(*) filter (where read_any),
      'replied', count(*) filter (where replied),
      'booked', count(*) filter (where reuniao_at is not null),
      'optout', count(*) filter (where prospect_state = 'optout'),
      'avg_quality', round(avg(quality)::numeric, 2)
    ) as j
    from base group by intro_variant
  ) row_;
$$;
revoke execute on function public.prospect_variant_funnel() from public, anon;
grant execute on function public.prospect_variant_funnel() to service_role;

-- ---- F7: insights RPC ---------------------------------------------------------------
create or replace function public.prospect_insights(p_dias int default 30)
returns jsonb
language sql stable security definer
set search_path = public, pg_temp
as $$
  with janela as (
    select * from public.prospect_outcomes
    where created_at >= now() - make_interval(days => greatest(p_dias, 1))
  ),
  janela_prev as (
    select * from public.prospect_outcomes
    where created_at >= now() - make_interval(days => 2 * greatest(p_dias, 1))
      and created_at <  now() - make_interval(days => greatest(p_dias, 1))
  ),
  temas as (
    select tema, count(*) as n from (select unnest(theme_tags) as tema from janela) t
    group by tema order by n desc limit 12
  ),
  temas_prev as (
    select tema, count(*) as n from (select unnest(theme_tags) as tema from janela_prev) t
    group by tema
  ),
  contactados as (
    select l.*, exists (select 1 from public.prospect_messages m
                        where m.lead_id = l.id and m.direcao = 'in') as replied
    from public.prospect_leads l
    where l.whatsapp_sent_at >= now() - make_interval(days => greatest(p_dias, 1))
  ),
  primeiras as (
    -- time from intro send to first inbound, per replied lead
    select l.id, extract(epoch from (min(m.enviada_em) - l.whatsapp_sent_at)) / 3600.0 as horas
    from public.prospect_leads l
    join public.prospect_messages m on m.lead_id = l.id and m.direcao = 'in'
    where l.whatsapp_sent_at is not null
      and l.whatsapp_sent_at >= now() - make_interval(days => greatest(p_dias, 1))
    group by l.id, l.whatsapp_sent_at
  ),
  segmentos as (
    select coalesce(l.intro_variant, '—') as variant,
           case when coalesce(l.lead_score, 0) <= 2 then '0-2'
                when coalesce(l.lead_score, 0) <= 4 then '3-4'
                else '5-7' end as score_band,
           count(*) as leads,
           count(*) filter (where l.reuniao_at is not null) as booked,
           round(avg(o.quality_score)::numeric, 2) as avg_quality
    from public.prospect_leads l
    left join public.prospect_outcomes o on o.lead_id = l.id and o.quality_score is not null
    where l.whatsapp_sent_at is not null
    group by 1, 2
  )
  select jsonb_build_object(
    'dias', greatest(p_dias, 1),
    'temas', coalesce((select jsonb_agg(jsonb_build_object(
        'tema', t.tema, 'n', t.n,
        'delta', t.n - coalesce((select p.n from temas_prev p where p.tema = t.tema), 0)
      ) order by t.n desc) from temas t), '[]'::jsonb),
    'contactados', (select count(*) from contactados),
    'responderam', (select count(*) filter (where replied) from contactados),
    'taxa_resposta', (select case when count(*) = 0 then null
        else round(100.0 * count(*) filter (where replied) / count(*), 1) end from contactados),
    'mediana_horas_primeira_resposta', (select round(percentile_cont(0.5)
        within group (order by horas)::numeric, 1) from primeiras),
    'mediana_msgs_ate_reuniao', (select percentile_cont(0.5)
        within group (order by n_messages) from janela where outcome = 'agendado'),
    'segmentos', coalesce((select jsonb_agg(to_jsonb(s)) from segmentos s), '[]'::jsonb)
  );
$$;
revoke execute on function public.prospect_insights(int) from public, anon;
grant execute on function public.prospect_insights(int) to service_role;

-- ---- Seed canned responses (idempotent) ---------------------------------------------
insert into public.prospect_canned (short_code, body) values
  ('preco', 'Sobre valores: depende do tamanho da operação, por isso a conversa rápida de 30 min vale a pena — te mostro o que faz sentido pro {{restaurante}} e você decide. Que dia fica bom?'),
  ('caderno', 'Entendo perfeitamente — muita casa roda no caderno! A diferença é o que se perde sem perceber: reserva que não volta, mesa vazia em horário de pico. Posso te mostrar em 30 min como o {{restaurante}} pode testar sem mudar sua rotina?'),
  ('material', 'Te mando sim! Mas material genérico diz pouco — em 30 min online te mostro funcionando com a realidade do {{restaurante}}, que é bem mais útil. Topa?'),
  ('ifood', 'Boa pergunta — a gente cuida das RESERVAS e do salão (WhatsApp, telefone, fila), complementando o delivery. São operações diferentes. Quer ver como conversa com o que você já usa?'),
  ('depois', 'Claro, sem pressa! Te procuro mais pra frente então. Se mudar de ideia antes, é só me chamar por aqui. 😊'),
  ('socio', 'Perfeito — quer que eu fale direto com essa pessoa? Se puder compartilhar o contato, eu me apresento e você não precisa fazer meio de campo.'),
  ('quanto-tempo', 'A implantação é rápida: em geral no mesmo dia já está atendendo. A demo de 30 min mostra o caminho todo. Que dia funciona melhor?'),
  ('obrigada', 'Eu que agradeço! Qualquer coisa é só chamar por aqui. 😊')
on conflict (short_code) do nothing;
