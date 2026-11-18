CREATE ROLE authenticator LOGIN NOINHERIT;
GRANT anon, authenticated, service_role TO authenticator;
CREATE TABLE restaurant.stripe_connect_accounts (
  restaurant_id uuid PRIMARY KEY,
  stripe_account_id text NOT NULL,
  status text NOT NULL,
  charges_enabled boolean NOT NULL,
  default_currency text
);
CREATE TABLE public.stripe_webhook_events_processed (
  event_id text PRIMARY KEY,
  event_type text NOT NULL
);
GRANT SELECT ON restaurant.stripe_connect_accounts TO service_role;
GRANT SELECT, INSERT ON public.stripe_webhook_events_processed TO service_role;
