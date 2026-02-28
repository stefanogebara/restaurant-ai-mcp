-- Migration: Create restaurant_registry table
-- Purpose: Central registry for multi-tenant WhatsApp routing
-- Each row represents one restaurant tenant registered with Seatable

CREATE TABLE IF NOT EXISTS public.restaurant_registry (
  id                      uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id           uuid,                                         -- FK to tenant's own Supabase project (nullable for central-DB tenants)
  restaurant_name         text        NOT NULL,
  restaurant_aliases      text[]      NOT NULL DEFAULT '{}',            -- Alternative names for fuzzy matching in WhatsApp conversations
  supabase_url            text,                                         -- Tenant's own Supabase URL (null = use central DB)
  supabase_anon_key       text,                                         -- Tenant's anon key
  supabase_service_role_key text,                                       -- Tenant's service role key
  customer_email          text,
  subscription_status     text        NOT NULL DEFAULT 'active',        -- active | cancelled | past_due
  plan_name               text,                                         -- starter | growth | scale
  voice_id                text,                                         -- ElevenLabs voice ID for this restaurant
  language                text        NOT NULL DEFAULT 'en',
  timezone                text        NOT NULL DEFAULT 'Europe/Madrid',
  is_active               boolean     NOT NULL DEFAULT true,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now()
);

-- Index for active restaurant lookup (hot path: WhatsApp webhook on every message)
CREATE INDEX IF NOT EXISTS restaurant_registry_active_idx
  ON public.restaurant_registry(is_active)
  WHERE is_active = true;
