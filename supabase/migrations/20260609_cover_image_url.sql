-- Restaurant cover photo for the public booking page.
-- The 2026-06 audit flagged the booking left-card (burgundy gradient + name
-- watermark) as the platform's biggest emotional-connection miss — diners
-- booking through /book/:slug never see the actual space. This column stores
-- the public URL of an owner-uploaded photo living in the `restaurant-photos`
-- storage bucket (public-read, 5 MB cap, jpeg/png/webp only — bucket created
-- 2026-06-09 via service-role API).
--
-- NULL = no photo uploaded; the booking page falls back to the existing
-- gradient + cuisine-emoji treatment.

ALTER TABLE restaurant.restaurant_config
  ADD COLUMN IF NOT EXISTS cover_image_url TEXT;

COMMENT ON COLUMN restaurant.restaurant_config.cover_image_url IS
  'Public URL of the owner-uploaded cover photo (restaurant-photos bucket). Shown on the public booking page. NULL falls back to gradient + cuisine emoji.';
