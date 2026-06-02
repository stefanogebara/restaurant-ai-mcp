-- Instagram Graph API connection state per restaurant. One row per
-- restaurant; a re-connect refreshes the existing row rather than
-- creating duplicates.
--
-- access_token is a Meta long-lived (60-day) token. It is stored as plain
-- text under the same row-level access controls as the other vendor
-- secrets (Square access tokens, Stripe Connect API keys). The pos_connections
-- table set the precedent; we follow it for consistency. If we tighten
-- secret-at-rest later, both tables move together.
--
-- token_expires_at is set 60 days out at write time. A cron in C2 will
-- pre-emptively refresh tokens that fall under a 14-day window so we
-- never serve a 401 during a content-generation call.

create table if not exists restaurant.instagram_connections (
  id                          uuid primary key default gen_random_uuid(),
  restaurant_id               uuid not null references restaurant.restaurant_config(id) on delete cascade,
  -- Facebook Page that owns the Instagram Business Account
  fb_page_id                  text,
  fb_page_name                text,
  -- The IG Business Account id used in all Graph API calls (/{ig-user-id}/...)
  ig_business_account_id      text,
  ig_username                 text,
  ig_profile_picture_url      text,
  ig_followers_count          integer,
  -- Long-lived user access token (60 days). Refresh before expiry via cron.
  access_token                text,
  token_expires_at            timestamptz,
  -- 'active'     — token healthy, tone-of-voice profile ready
  -- 'expired'    — token past expiry; user must re-connect
  -- 'revoked'    — user disconnected at app or platform level
  -- 'restricted' — Meta returned a permission error on last call
  status                      text not null default 'active'
    check (status in ('active', 'expired', 'revoked', 'restricted')),
  -- Last successful call to /me/accounts or /{ig-user-id}/media
  last_sync_at                timestamptz,
  -- Last error message bubbled from a Graph API call. Truncated to 500 chars.
  last_error                  text,
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now()
);

-- One active connection per restaurant (allow disconnected/revoked history
-- so we can audit re-connects). Mirrors pos_connections partial-unique pattern.
create unique index if not exists instagram_connections_restaurant_active_idx
  on restaurant.instagram_connections (restaurant_id)
  where status in ('active', 'restricted');

create index if not exists instagram_connections_restaurant_idx
  on restaurant.instagram_connections (restaurant_id);

create index if not exists instagram_connections_token_expires_idx
  on restaurant.instagram_connections (token_expires_at)
  where status = 'active';

comment on table restaurant.instagram_connections is
  'Instagram Graph API connection state per restaurant — token, IG Business Account id, sync metadata.';

-- Tone-of-voice profile derived from the connected IG account's recent
-- captions. Populated by the C2 worker. Shape (see api/instagram/tone-profile.js):
--   {
--     "formality": 4,
--     "emoji_density": "medium",
--     "hashtag_style": "descriptive",
--     "recurring_themes": ["sourdough", "natural wine", "neighborhood"],
--     "signature_phrases": ["come hang", "fresh out the oven"],
--     "voice_summary": "Warm, casual neighborhood vibe...",
--     "computed_at": "2026-06-02T15:00:00Z",
--     "source_post_count": 28
--   }
alter table restaurant.restaurant_config
  add column if not exists instagram_tone_profile jsonb;

