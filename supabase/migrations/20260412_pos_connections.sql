-- POS Connections table for Square (and future POS providers)
create table if not exists restaurant.pos_connections (
  id                uuid primary key default gen_random_uuid(),
  restaurant_id     uuid not null references restaurant.restaurant_config(id) on delete cascade,
  pos_provider      text not null default 'square',
  merchant_id       text,
  location_id       text,
  access_token      text,
  refresh_token     text,
  token_expires_at  timestamptz,
  status            text not null default 'active' check (status in ('active', 'expired', 'disconnected')),
  last_sync_at      timestamptz,
  sync_error        text,
  menu_items_synced integer not null default 0,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- Only one active connection per restaurant per provider
create unique index if not exists pos_connections_restaurant_provider_idx
  on restaurant.pos_connections (restaurant_id, pos_provider)
  where status != 'disconnected';

comment on table restaurant.pos_connections is 'POS system OAuth connections (Square, Toast, etc.)';
