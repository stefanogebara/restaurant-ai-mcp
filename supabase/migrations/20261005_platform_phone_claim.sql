-- The platform has one shared Twilio number. A transaction-scoped advisory lock
-- serializes claims, including checks against assignments made before this table.
create table if not exists public.platform_phone_claims (
  phone_number text primary key,
  restaurant_id uuid not null references restaurant.restaurant_config(id) on delete cascade,
  claim_token uuid not null,
  updated_at timestamptz not null default now()
);

alter table public.platform_phone_claims enable row level security;
revoke all on public.platform_phone_claims from public, anon, authenticated;

create or replace function public.claim_platform_phone(p_restaurant_id uuid, p_phone_number text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_token uuid := gen_random_uuid();
  v_config jsonb;
begin
  if p_restaurant_id is null or nullif(trim(p_phone_number), '') is null then
    raise exception 'invalid phone claim' using errcode = 'P0001';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_phone_number, 0));

  -- Legacy ai_config rows remain authoritative until migrated. Reject even a
  -- second pre-existing active row rather than choosing an arbitrary owner.
  if exists (
    select 1 from restaurant.restaurant_config
    where id <> p_restaurant_id
      and ai_config->'phone'->>'number' = p_phone_number
      and ai_config->'phone'->>'status' in ('active', 'pending')
  ) or exists (
    select 1 from public.platform_phone_claims
    where phone_number = p_phone_number and restaurant_id <> p_restaurant_id
  ) then
    raise exception 'platform phone already claimed' using errcode = 'P0001';
  end if;

  select ai_config into v_config from restaurant.restaurant_config
    where id = p_restaurant_id for update;
  if not found then
    raise exception 'restaurant not found' using errcode = 'P0001';
  end if;
  if v_config->'phone'->>'status' = 'pending' then
    raise exception 'phone registration already pending' using errcode = 'P0001';
  end if;

  insert into public.platform_phone_claims as claims(phone_number, restaurant_id, claim_token)
    values (p_phone_number, p_restaurant_id, v_token)
    on conflict (phone_number) do update
      set claim_token = excluded.claim_token, updated_at = now()
      where claims.restaurant_id = p_restaurant_id;
  if not found then
    raise exception 'platform phone already claimed' using errcode = 'P0001';
  end if;

  update restaurant.restaurant_config
    set ai_config = jsonb_set(coalesce(ai_config, '{}'::jsonb), '{phone}',
      jsonb_build_object('status', 'pending', 'number', p_phone_number,
                        'claim_token', v_token::text)),
        updated_at = now()
    where id = p_restaurant_id;
  return v_token;
end;
$$;

create or replace function public.activate_platform_phone(
  p_restaurant_id uuid, p_phone_number text, p_claim_token uuid, p_number_id text
)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  perform pg_advisory_xact_lock(hashtextextended(p_phone_number, 0));
  if not exists (
    select 1 from public.platform_phone_claims
    where phone_number = p_phone_number and restaurant_id = p_restaurant_id
      and claim_token = p_claim_token
  ) then return false; end if;

  update restaurant.restaurant_config
    set ai_config = jsonb_set(coalesce(ai_config, '{}'::jsonb), '{phone}',
      jsonb_build_object('status', 'active', 'number', p_phone_number,
                        'number_id', p_number_id, 'configured_at', now())),
        updated_at = now()
    where id = p_restaurant_id
      and ai_config->'phone'->>'status' = 'pending'
      and ai_config->'phone'->>'claim_token' = p_claim_token::text;
  return found;
end;
$$;

create or replace function public.release_platform_phone(p_restaurant_id uuid, p_phone_number text)
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  v_status text;
  v_number text;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_phone_number, 0));
  select ai_config->'phone'->>'status', ai_config->'phone'->>'number' into v_status, v_number
    from restaurant.restaurant_config where id = p_restaurant_id for update;
  if not found then return false; end if;
  if v_number is not null and v_number <> p_phone_number then return false; end if;
  if v_status = 'pending' then
    raise exception 'phone registration in progress' using errcode = 'P0001';
  end if;
  if exists (
    select 1 from public.platform_phone_claims
    where phone_number = p_phone_number and restaurant_id <> p_restaurant_id
  ) then return false; end if;

  update restaurant.restaurant_config
    set ai_config = coalesce(ai_config, '{}'::jsonb) - 'phone', updated_at = now()
    where id = p_restaurant_id;
  delete from public.platform_phone_claims
    where phone_number = p_phone_number and restaurant_id = p_restaurant_id;
  return true;
end;
$$;

create or replace function public.fail_platform_phone_claim(
  p_restaurant_id uuid, p_phone_number text, p_claim_token uuid
)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  perform pg_advisory_xact_lock(hashtextextended(p_phone_number, 0));
  if not exists (
    select 1 from public.platform_phone_claims
    where phone_number = p_phone_number and restaurant_id = p_restaurant_id
      and claim_token = p_claim_token
  ) then return false; end if;
  update restaurant.restaurant_config
    set ai_config = jsonb_set(coalesce(ai_config, '{}'::jsonb), '{phone}',
      jsonb_build_object('status', 'error', 'number', p_phone_number,
                        'error', 'Phone registration failed')),
        updated_at = now()
    where id = p_restaurant_id
      and ai_config->'phone'->>'status' = 'pending'
      and ai_config->'phone'->>'claim_token' = p_claim_token::text;
  return found;
end;
$$;

revoke all on function public.claim_platform_phone(uuid, text) from public, anon, authenticated;
revoke all on function public.activate_platform_phone(uuid, text, uuid, text) from public, anon, authenticated;
revoke all on function public.release_platform_phone(uuid, text) from public, anon, authenticated;
revoke all on function public.fail_platform_phone_claim(uuid, text, uuid) from public, anon, authenticated;
grant execute on function public.claim_platform_phone(uuid, text) to service_role;
grant execute on function public.activate_platform_phone(uuid, text, uuid, text) to service_role;
grant execute on function public.release_platform_phone(uuid, text) to service_role;
grant execute on function public.fail_platform_phone_claim(uuid, text, uuid) to service_role;
