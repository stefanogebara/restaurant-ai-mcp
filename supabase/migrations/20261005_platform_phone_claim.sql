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

-- Preserve only unambiguous active assignments. Ambiguous legacy rows get no
-- claim and cannot receive calls or use self-service registration.
insert into public.platform_phone_claims(phone_number, restaurant_id, claim_token)
select cfg.ai_config->'phone'->>'number', cfg.id, gen_random_uuid()
from restaurant.restaurant_config cfg
where cfg.ai_config->'phone'->>'status' = 'active'
  and nullif(cfg.ai_config->'phone'->>'number', '') is not null
  and not exists (
    select 1 from restaurant.restaurant_config other
    where other.id <> cfg.id
      and (
        other.phone = cfg.ai_config->'phone'->>'number'
        or (
          other.ai_config->'phone'->>'number' = cfg.ai_config->'phone'->>'number'
          and other.ai_config->'phone'->>'status' in ('active', 'pending')
        )
      )
  )
on conflict (phone_number) do nothing;

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
      and (phone = p_phone_number or (
        ai_config->'phone'->>'number' = p_phone_number
        and ai_config->'phone'->>'status' in ('active', 'pending')
      ))
  ) then
    raise exception 'platform phone already claimed' using errcode = 'P0001';
  end if;

  -- No restaurant may take this shared line through self-service. Existing
  -- unambiguous owners were backfilled above; transfers require human review.
  if not exists (
    select 1 from public.platform_phone_claims
    where phone_number = p_phone_number and restaurant_id = p_restaurant_id
  ) then
    raise exception 'platform phone ownership not established' using errcode = 'P0001';
  end if;

  select ai_config into v_config from restaurant.restaurant_config
    where id = p_restaurant_id for update;
  if not found then
    raise exception 'restaurant not found' using errcode = 'P0001';
  end if;
  if v_config->'phone'->>'status' = 'pending' then
    raise exception 'phone registration already pending' using errcode = 'P0001';
  end if;

  update public.platform_phone_claims
    set claim_token = v_token, updated_at = now()
    where phone_number = p_phone_number and restaurant_id = p_restaurant_id;
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

create or replace function public.platform_phone_availability(p_restaurant_id uuid, p_phone_number text)
returns text language plpgsql security definer set search_path = '' as $$
declare
  v_owners uuid[];
begin
  if p_restaurant_id is null or nullif(trim(p_phone_number), '') is null then
    return 'unknown';
  end if;
  select array_agg(distinct owner_id) into v_owners
  from (
    select restaurant_id as owner_id from public.platform_phone_claims
      where phone_number = p_phone_number
    union all
    select id as owner_id from restaurant.restaurant_config
      where phone = p_phone_number
         or (ai_config->'phone'->>'number' = p_phone_number
             and ai_config->'phone'->>'status' in ('active', 'pending'))
  ) owners;
  if coalesce(array_length(v_owners, 1), 0) = 0 then return 'available'; end if;
  if array_length(v_owners, 1) > 1 then return 'unknown'; end if;
  if v_owners[1] = p_restaurant_id then
    if exists (
      select 1 from public.platform_phone_claims
      where phone_number = p_phone_number and restaurant_id = p_restaurant_id
    ) then return 'owned_by_this_restaurant'; end if;
    return 'unknown';
  end if;
  return 'unavailable';
end;
$$;

revoke all on function public.claim_platform_phone(uuid, text) from public, anon, authenticated;
revoke all on function public.activate_platform_phone(uuid, text, uuid, text) from public, anon, authenticated;
revoke all on function public.fail_platform_phone_claim(uuid, text, uuid) from public, anon, authenticated;
revoke all on function public.platform_phone_availability(uuid, text) from public, anon, authenticated;
grant execute on function public.claim_platform_phone(uuid, text) to service_role;
grant execute on function public.activate_platform_phone(uuid, text, uuid, text) to service_role;
grant execute on function public.fail_platform_phone_claim(uuid, text, uuid) to service_role;
grant execute on function public.platform_phone_availability(uuid, text) to service_role;
