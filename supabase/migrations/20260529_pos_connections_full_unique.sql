-- Replace the partial unique index (WHERE status != 'disconnected') with a
-- full UNIQUE constraint on (restaurant_id, pos_provider). Enables
-- INSERT ON CONFLICT upserts on the OAuth callback path and mirrors the
-- restaurant.stripe_connect_accounts pattern where the row stays with
-- status='revoked'/'disconnected' instead of being deleted.

DROP INDEX IF EXISTS restaurant.pos_connections_restaurant_provider_idx;

ALTER TABLE restaurant.pos_connections
  ADD CONSTRAINT pos_connections_restaurant_provider_unique
  UNIQUE (restaurant_id, pos_provider);
