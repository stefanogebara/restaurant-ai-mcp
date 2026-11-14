-- Read-only view of SQL function sources for the migration check
-- (scripts/audit-migrations-applied.js, run by the live smoke workflow).
--
-- Why: that check only proved that tables exist. A migration that replaces a
-- function was invisible to it (2026-11-11: the keypad confirmation function
-- was merged but not applied). CI reaches the database only through the REST
-- API with the service key, and the REST API does not expose pg_catalog, so
-- the check reads function bodies through this function.
--
-- Only service_role may call it: function bodies are internal code and must
-- not be readable from the browser (anon, authenticated).

create or replace function public.audit_function_sources(p_keys text[])
returns table (key text, identity_args text, source text)
language sql
stable
security invoker
set search_path = ''
as $$
  select n.nspname || '.' || p.proname,
         pg_catalog.pg_get_function_identity_arguments(p.oid),
         p.prosrc
  from pg_catalog.pg_proc p
  join pg_catalog.pg_namespace n on n.oid = p.pronamespace
  where n.nspname || '.' || p.proname = any (p_keys)
  order by 1, 2;
$$;

revoke all on function public.audit_function_sources(text[]) from public, anon, authenticated;
grant execute on function public.audit_function_sources(text[]) to service_role;
