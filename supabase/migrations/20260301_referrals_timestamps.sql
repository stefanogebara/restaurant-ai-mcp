-- Create referrals table and ensure converted_at / rewarded_at columns exist (idempotent)

CREATE TABLE IF NOT EXISTS public.referrals (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  referral_code TEXT        NOT NULL,
  referrer_id   UUID        NOT NULL REFERENCES restaurant.restaurant_config(id) ON DELETE CASCADE,
  referee_id    UUID        NOT NULL REFERENCES restaurant.restaurant_config(id) ON DELETE CASCADE,
  status        TEXT        NOT NULL DEFAULT 'pending'
                            CHECK (status IN ('pending', 'converted', 'rewarded')),
  converted_at  TIMESTAMPTZ,
  rewarded_at   TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Add columns idempotently in case the table already existed without them
ALTER TABLE public.referrals
  ADD COLUMN IF NOT EXISTS converted_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS rewarded_at   TIMESTAMPTZ;

-- A restaurant can only be referred once
ALTER TABLE public.referrals ADD CONSTRAINT referrals_referee_id_unique UNIQUE (referee_id);

-- Indexes for common lookup patterns
-- Note: referrals_referee_id_idx is omitted — the UNIQUE constraint above creates an equivalent index
CREATE INDEX IF NOT EXISTS referrals_referrer_id_idx  ON public.referrals (referrer_id);
CREATE INDEX IF NOT EXISTS referrals_referral_code_idx ON public.referrals (referral_code);

-- Row-level security: each restaurant can only see its own rows as referrer or referee
ALTER TABLE public.referrals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "referrer_read_own" ON public.referrals FOR SELECT
  USING (referrer_id = (current_setting('request.jwt.claims', true)::jsonb->>'restaurant_id')::uuid);

CREATE POLICY "referee_read_own" ON public.referrals FOR SELECT
  USING (referee_id = (current_setting('request.jwt.claims', true)::jsonb->>'restaurant_id')::uuid);
