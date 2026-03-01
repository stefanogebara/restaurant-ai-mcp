-- Create referrals table and ensure converted_at / rewarded_at columns exist (idempotent)

CREATE TABLE IF NOT EXISTS public.referrals (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  referral_code TEXT        NOT NULL,
  referrer_id   UUID        NOT NULL,
  referee_id    UUID        NOT NULL,
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

-- Indexes for common lookup patterns
CREATE INDEX IF NOT EXISTS referrals_referee_id_idx   ON public.referrals (referee_id);
CREATE INDEX IF NOT EXISTS referrals_referrer_id_idx  ON public.referrals (referrer_id);
CREATE INDEX IF NOT EXISTS referrals_referral_code_idx ON public.referrals (referral_code);
