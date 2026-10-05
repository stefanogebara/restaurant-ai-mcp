-- The platform has one shared Twilio number. This table
-- records an unambiguous owner for the Twilio webhook and status API.
create table if not exists public.platform_phone_claims (
  phone_number text primary key,
  restaurant_id uuid not null references restaurant.restaurant_config(id) on delete cascade,
  updated_at timestamptz not null default now()
);

alter table public.platform_phone_claims enable row level security;
revoke all on public.platform_phone_claims from public, anon, authenticated;
-- The inbound webhook reads the owner directly with the service-role client.
-- Self-service claim mutations are intentionally unavailable.
grant select on public.platform_phone_claims to service_role;

-- Preserve only unambiguous active assignments. Ambiguous legacy rows get no
-- claim, so the Twilio webhook rejects them. Native provider routing still
-- requires a separate ownership audit before this migration is deployed.
insert into public.platform_phone_claims(phone_number, restaurant_id)
select cfg.ai_config->'phone'->>'number', cfg.id
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

revoke all on function public.platform_phone_availability(uuid, text) from public, anon, authenticated;
grant execute on function public.platform_phone_availability(uuid, text) to service_role;
