-- Append-only log of every booking deposit PaymentIntent we mint, tagged
-- with whether it routed through Stripe Connect (connect_account_id set)
-- or settled on the platform (NULL). Drives the "Connect adoption rate"
-- product metric — what fraction of deposit volume is landing on the
-- restaurant vs Seatable's platform account.
--
-- restaurant_id is NOT FK-constrained so a restaurant delete doesn't take
-- the analytics with it (these are aggregate metrics, not user data).

CREATE TABLE IF NOT EXISTS public.stripe_deposit_routing_events (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id        uuid NOT NULL,
  payment_intent_id    text NOT NULL,
  routed_to            text NOT NULL CHECK (routed_to IN ('connect', 'platform')),
  connect_account_id   text,
  amount_cents         integer NOT NULL CHECK (amount_cents >= 0),
  currency             text NOT NULL,
  party_size           integer,
  created_at           timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS stripe_deposit_routing_events_restaurant_created_idx
  ON public.stripe_deposit_routing_events (restaurant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS stripe_deposit_routing_events_routed_to_created_idx
  ON public.stripe_deposit_routing_events (routed_to, created_at DESC);

-- Unique on payment_intent_id so a retry-storm on create-deposit-intent
-- can't double-count adoption. INSERT ON CONFLICT DO NOTHING on the
-- write path.
CREATE UNIQUE INDEX IF NOT EXISTS stripe_deposit_routing_events_pi_unique_idx
  ON public.stripe_deposit_routing_events (payment_intent_id);

COMMENT ON TABLE public.stripe_deposit_routing_events IS
  'Append-only adoption analytics: which deposits routed via Stripe Connect (connect_account_id NOT NULL) vs the platform.';
