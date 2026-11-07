-- Active AI phone assignments must be canonical. Otherwise an exact inbound
-- lookup can miss an owner and fall through to another restaurant's business
-- number. A CHECK expression must explicitly reject NULL (CHECK accepts it).
ALTER TABLE restaurant.restaurant_config
  ADD CONSTRAINT restaurant_config_active_voice_phone_e164
  CHECK (
    (ai_config #>> '{phone,status}') IS DISTINCT FROM 'active'
    OR (
      COALESCE((ai_config #>> '{phone,number}') ~ '^[+][1-9][0-9]{7,14}$', FALSE)
      AND NULLIF(ai_config #>> '{phone,number_id}', '') IS NOT NULL
    )
  );
