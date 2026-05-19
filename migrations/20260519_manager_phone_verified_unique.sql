-- Phase Q.1: Prevent OTP phone collision between restaurants.
--
-- Before this index, two restaurants could each verify the same WhatsApp
-- number — the second confirm() in api/manager-whatsapp-verify.js would
-- silently overwrite the first restaurant's `manager_phone` link and
-- inbound manager messages would route to the wrong tenant.
--
-- The API now does a pre-check before the confirm UPDATE, but the
-- partial unique index below is the atomic safety net that catches even
-- a race between two simultaneous confirms.
--
-- Partial — only enforced for rows where the phone is actually verified.
-- Unverified pending rows can still collide on `manager_phone` during
-- the OTP send window without blocking the legitimate verify path.
--
-- Applied to prod 2026-05-19 via Supabase MCP.

CREATE UNIQUE INDEX IF NOT EXISTS manager_phone_verified_unique
  ON restaurant.restaurant_config (manager_phone)
  WHERE manager_whatsapp_verified = true
    AND manager_phone IS NOT NULL;
