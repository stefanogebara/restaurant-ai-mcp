-- Add whatsapp_phone_number_id to restaurant_registry for per-restaurant routing.
-- Allows direct routing when a restaurant has its own dedicated WhatsApp number.
ALTER TABLE restaurant_registry
  ADD COLUMN IF NOT EXISTS whatsapp_phone_number_id TEXT;

CREATE INDEX IF NOT EXISTS idx_registry_whatsapp_phone_number_id
  ON restaurant_registry (whatsapp_phone_number_id)
  WHERE whatsapp_phone_number_id IS NOT NULL;
