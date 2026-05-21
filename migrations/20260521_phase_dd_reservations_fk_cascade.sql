-- Phase DD.3 — DB integrity migration.
--
-- Cleanup: 81 orphan reservations across 9 deleted restaurants. These
-- accumulated because there was no FK constraint on
-- public.reservations.restaurant_id → restaurant.restaurant_config.id,
-- so cleanup-expired-demos failures (mid-run crashes, manual deletes)
-- silently leaked children.
--
-- Idempotent: the DELETE is a no-op once orphans are cleared; the
-- ALTER TABLE is guarded by IF EXISTS check that the constraint isn't
-- already there.

-- 1. Clean up any orphan rows (no-op after first run).
DELETE FROM public.reservations r
WHERE NOT EXISTS (
  SELECT 1 FROM restaurant.restaurant_config c WHERE c.id = r.restaurant_id
);

-- 2. Add the FK with ON DELETE CASCADE so future restaurant deletions
--    automatically clean up children. Cron logic stays unchanged — it
--    already deletes reservations before restaurant_config, so cascade
--    is a safety net, not the primary path.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'reservations_restaurant_id_fkey'
      AND conrelid = 'public.reservations'::regclass
  ) THEN
    ALTER TABLE public.reservations
      ADD CONSTRAINT reservations_restaurant_id_fkey
      FOREIGN KEY (restaurant_id)
      REFERENCES restaurant.restaurant_config(id)
      ON DELETE CASCADE;
  END IF;
END $$;
