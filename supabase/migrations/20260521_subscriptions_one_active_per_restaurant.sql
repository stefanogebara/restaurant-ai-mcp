-- One active or trialing subscription per restaurant.
-- Background: onboarding inserts a synthetic 'Free / status=active' row for
-- Brazilian restaurants. When the customer later upgrades, the Stripe webhook
-- inserts the paid row. Without this index, both rows stay active and
-- application lookups like manager-usage.maybeSingle() picked nondeterministically,
-- silently rolling paying customers back to free-tier limits.
--
-- The webhook (commit 60c1216b, customer.subscription.created handler) now
-- cancels the Free row before inserting the paid row, so this index will not
-- conflict with legitimate upgrade flows.
CREATE UNIQUE INDEX IF NOT EXISTS subscriptions_one_active_per_restaurant
  ON public.subscriptions (restaurant_id)
  WHERE status IN ('active', 'trialing');
