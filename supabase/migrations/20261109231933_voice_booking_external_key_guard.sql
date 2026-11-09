-- Production already has this POS/WhatsApp uniqueness contract. Record it for
-- fresh environments too: a provider retry must never create another booking.
set local lock_timeout = '5s';
set local statement_timeout = '30s';
alter table public.reservations add column if not exists external_id text;
create unique index if not exists idx_reservations_external
  on public.reservations (restaurant_id, source, external_id)
  where external_id is not null;

-- IF NOT EXISTS must not silently accept an invalid or differently scoped key.
do $$
declare key_columns text[];
begin
  select array_agg(a.attname::text order by k.ordinality)
    into key_columns
    from pg_index i
    join pg_class idx on idx.oid = i.indexrelid
    join pg_namespace ns on ns.oid = idx.relnamespace
    cross join lateral unnest(i.indkey) with ordinality k(attnum, ordinality)
    join pg_attribute a on a.attrelid = i.indrelid and a.attnum = k.attnum
   where ns.nspname = 'public' and idx.relname = 'idx_reservations_external'
     and i.indrelid = 'public.reservations'::regclass
     and i.indisunique and i.indisvalid and i.indisready
     and i.indnkeyatts = 3
     and pg_get_expr(i.indpred, i.indrelid) = '(external_id IS NOT NULL)';
  if key_columns is distinct from array['restaurant_id', 'source', 'external_id']::text[] then
    raise exception 'Reservation external-key uniqueness is missing or incompatible';
  end if;
end $$;
