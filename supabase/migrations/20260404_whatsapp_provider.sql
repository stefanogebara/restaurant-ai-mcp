-- Add whatsapp_provider column to restaurant_config
-- Allows per-restaurant selection of WhatsApp provider: 'meta' (default) or 'twilio'
ALTER TABLE restaurant.restaurant_config
  ADD COLUMN IF NOT EXISTS whatsapp_provider TEXT DEFAULT 'meta';

COMMENT ON COLUMN restaurant.restaurant_config.whatsapp_provider
  IS 'WhatsApp message provider: meta (Cloud API) or twilio. Default meta.';
