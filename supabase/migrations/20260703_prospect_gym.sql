-- 20260703_prospect_gym.sql — Phase 10: Olímpia Gym (simulation + style training)
-- =============================================================================
-- Three pieces make "training" real without weight fine-tuning:
--   prospect_style_pack     — versioned ESTILO blocks appended to the production
--                             system prompt; editing + activating a pack changes
--                             the live brain instantly (no deploy). One active.
--   prospect_sim_scenarios  — LLM-as-lead persona specs (perfil/humor/estilo/
--                             objetivo/curveballs) exercising the REAL brain in
--                             a sandbox (no sends, no lead rows).
--   prospect_sim_runs       — transcripts + judge rubric scores per style
--                             version, so drafts are A/B-able before promotion.
-- Seeds: style pack v1 (humanization + multi-bubble writing) + 10 scenarios
-- (busy owner in bubble bursts, price skeptic, "manda material", wrong-person
-- referral, eager booker, rude opt-out, bot-detector, monosyllabic, off-topic
-- chatterbox, technical negotiator). Service-role only. Additive + idempotent.
-- =============================================================================

create table if not exists public.prospect_style_pack (
  id         uuid primary key default gen_random_uuid(),
  version    int not null,
  label      text,
  body       text not null,
  active     boolean not null default false,
  notes      text,
  created_at timestamptz not null default now(),
  unique (version)
);
alter table public.prospect_style_pack enable row level security;
create unique index if not exists prospect_style_pack_one_active
  on public.prospect_style_pack (active) where active;

create table if not exists public.prospect_sim_scenarios (
  id         uuid primary key default gen_random_uuid(),
  nome       text not null unique,
  descricao  text,
  persona    jsonb not null,
  lead       jsonb not null,
  turns      int not null default 6,
  active     boolean not null default true,
  created_at timestamptz not null default now()
);
alter table public.prospect_sim_scenarios enable row level security;

create table if not exists public.prospect_sim_runs (
  id            uuid primary key default gen_random_uuid(),
  scenario_id   uuid references public.prospect_sim_scenarios(id) on delete cascade,
  style_version int,
  transcript    jsonb not null,
  scores        jsonb,
  media         numeric(3,2),
  created_at    timestamptz not null default now()
);
alter table public.prospect_sim_runs enable row level security;
create index if not exists prospect_sim_runs_scenario on public.prospect_sim_runs (scenario_id, created_at desc);

-- (Seed data — style pack v1 + 10 scenarios — applied directly in prod via the
-- 20260703 apply_migration/execute_sql calls; reproduced in ops docs.)
