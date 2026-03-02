-- Migration: customer_push_subscriptions
-- Phase 10: PWA push notification subscriptions

CREATE TABLE IF NOT EXISTS public.customer_push_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id UUID NOT NULL,
  reservation_id UUID REFERENCES public.reservations(id) ON DELETE CASCADE,
  subscription JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for lookups by reservation
CREATE INDEX IF NOT EXISTS idx_push_subs_reservation_id
  ON public.customer_push_subscriptions(reservation_id);

-- Index for lookups by restaurant (for cleanup/admin)
CREATE INDEX IF NOT EXISTS idx_push_subs_restaurant_id
  ON public.customer_push_subscriptions(restaurant_id);

-- RLS: allow service role only (no direct client access)
ALTER TABLE public.customer_push_subscriptions ENABLE ROW LEVEL SECURITY;
