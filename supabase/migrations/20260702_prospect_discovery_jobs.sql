-- 20260702_prospect_discovery_jobs.sql — Phase 9: mass discovery jobs
-- =============================================================================
-- A discovery job expands a territory (bairro | cidade | estado) into a list of
-- Google Places Text Search queries (IBGE districts/municipalities drive the
-- fan-out) and is executed in batches by a self-chaining worker
-- (api/prospect-discovery-worker.js) within serverless time budgets. Counters
-- give the console live progress; `cursor` advances atomically so overlapping
-- worker invocations never double-process a query. Service-role only.
-- =============================================================================

create table if not exists public.prospect_discovery_jobs (
  id            uuid primary key default gen_random_uuid(),
  territory     jsonb not null,            -- {mode, uf, city, bairro, query}
  queries       jsonb not null,            -- expanded [{q, city}] list
  cursor        int not null default 0,    -- next query index (atomic advance)
  status        text not null default 'running'
                check (status in ('running','done','cancelled','error')),
  only_sendable boolean not null default true,
  found         int not null default 0,
  inserted      int not null default 0,
  sendable      int not null default 0,
  discarded     int not null default 0,
  error_detail  text,
  created_by    text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
alter table public.prospect_discovery_jobs enable row level security;
create index if not exists prospect_discovery_jobs_created on public.prospect_discovery_jobs (created_at desc);
