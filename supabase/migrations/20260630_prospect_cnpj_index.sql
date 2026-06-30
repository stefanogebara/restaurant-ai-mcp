-- 20260630_prospect_cnpj_index.sql — LOCAL CNPJ index (Receita Federal open data)
-- =============================================================================
-- Phase 3 (BR enrichment). Generates CNPJ candidates by NAME+city WITHOUT
-- Google/Scrapingdog (the biggest cause of a blank CNPJ was the SERP not
-- returning the number for short/generic names). A denormalized index of
-- Receita ESTABELECIMENTOS, bulk-loaded by scripts/load-rf-cnpj.mjs, searchable
-- by name trigram. The data is ALREADY official → it skips the confirmation step
-- and goes straight to the deterministic score (name/phone/city) + judge.
--
-- Service-role only (no authenticated policy): the prospecting subsystem is an
-- internal, single-tenant tool. The buscar_cnpj_local RPC is invoked by
-- supabaseAdmin (service role), which bypasses RLS. Empty index (before the ETL)
-- → the RPC returns 0 rows and prospect-enrich.js degrades to the SERP path.
-- =============================================================================

create extension if not exists pg_trgm;
create extension if not exists unaccent;

-- unaccent is STABLE; wrap it IMMUTABLE so it can be indexed / used in the RPC.
create or replace function public.imm_unaccent(text)
returns text language sql immutable parallel safe as $$
  select lower(public.unaccent('public.unaccent', $1))
$$;

create table if not exists public.cnpj_index (
  cnpj          text primary key,            -- 14 digits
  razao_social  text,
  nome_fantasia text,
  nome_busca    text not null,               -- unaccent(lower(fantasia ' ' razao)) for trigram
  cep           text,
  municipio     text,                        -- municipality NAME (resolved from code in the ETL, normalized)
  uf            text,
  bairro        text,
  logradouro    text,
  situacao      text,                         -- ATIVA / BAIXADA / ...
  cnae          text,                         -- main activity (code or description)
  telefone      text,                         -- registered DDD+phone
  porte         text,
  mei           boolean,
  socios        jsonb,                         -- [{nome, qualificacao}] (no CPF — LGPD)
  updated_at    timestamptz not null default now()
);

-- Name trigram (similarity search) + city/CEP/(uf,cnae) filters.
create index if not exists cnpj_index_nome_trgm on public.cnpj_index using gin (nome_busca gin_trgm_ops);
create index if not exists cnpj_index_municipio on public.cnpj_index (municipio);
create index if not exists cnpj_index_cep on public.cnpj_index (cep);
create index if not exists cnpj_index_uf_cnae on public.cnpj_index (uf, cnae);

-- RLS on, service-role only (matches the prospect_* tables — no public policy).
alter table public.cnpj_index enable row level security;

-- Name search (trigram) + optional city. Returns the best candidates with the
-- similarity score — the caller still runs them through the match funnel.
create or replace function public.buscar_cnpj_local(
  p_nome text,
  p_municipio text default null,
  p_limit int default 8
)
returns table (
  cnpj text, razao_social text, nome_fantasia text, cep text, municipio text,
  uf text, bairro text, situacao text, cnae text, telefone text, porte text,
  mei boolean, socios jsonb, sim real
)
language sql stable parallel safe as $$
  select i.cnpj, i.razao_social, i.nome_fantasia, i.cep, i.municipio, i.uf,
         i.bairro, i.situacao, i.cnae, i.telefone, i.porte, i.mei, i.socios,
         similarity(i.nome_busca, public.imm_unaccent(p_nome)) as sim
  from public.cnpj_index i
  where i.nome_busca % public.imm_unaccent(p_nome)
    and (p_municipio is null or i.municipio = public.imm_unaccent(p_municipio))
  order by sim desc
  limit greatest(p_limit, 1)
$$;
