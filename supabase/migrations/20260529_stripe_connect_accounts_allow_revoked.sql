-- Allow 'revoked' status on restaurant.stripe_connect_accounts.
-- The Connect webhook handler sets this on account.application.deauthorized
-- events (when a restaurant uninstalls the platform). Without this the
-- handler returned 500 instead of marking the row revoked.

ALTER TABLE restaurant.stripe_connect_accounts
  DROP CONSTRAINT IF EXISTS stripe_connect_accounts_status_check;

ALTER TABLE restaurant.stripe_connect_accounts
  ADD CONSTRAINT stripe_connect_accounts_status_check
  CHECK (status = ANY (ARRAY[
    'pending'::text, 'active'::text, 'restricted'::text,
    'disabled'::text, 'revoked'::text
  ]));
