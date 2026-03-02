-- Migration: deposit columns
-- Phase 10: Stripe deposit support

-- Add deposit columns to reservations
ALTER TABLE public.reservations
  ADD COLUMN IF NOT EXISTS deposit_payment_intent_id TEXT,
  ADD COLUMN IF NOT EXISTS deposit_amount NUMERIC(10,2);

-- Add deposit config to restaurant_config
ALTER TABLE restaurant.restaurant_config
  ADD COLUMN IF NOT EXISTS deposit_config JSONB DEFAULT '{"enabled": false}'::jsonb;
