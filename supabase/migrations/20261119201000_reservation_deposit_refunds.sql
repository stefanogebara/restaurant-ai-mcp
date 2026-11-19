ALTER TABLE public.reservations
  ADD COLUMN deposit_captured_payment_intent_id text,
  ADD COLUMN deposit_refunded_amount numeric(12, 2)
    CHECK (deposit_refunded_amount IS NULL OR
      (deposit_refunded_amount > 0 AND deposit_amount IS NOT NULL AND deposit_refunded_amount <= deposit_amount));

CREATE UNIQUE INDEX reservations_captured_deposit_intent_key
  ON public.reservations (deposit_captured_payment_intent_id)
  WHERE deposit_captured_payment_intent_id IS NOT NULL;
