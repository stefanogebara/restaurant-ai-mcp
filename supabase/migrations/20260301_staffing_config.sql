ALTER TABLE restaurant.restaurant_config
  ADD COLUMN IF NOT EXISTS staffing_config JSONB DEFAULT '{"roles": [
    {"name": "FOH", "covers_per_staff": 15},
    {"name": "BOH", "covers_per_staff": 20},
    {"name": "Bar", "covers_per_staff": 25}
  ]}'::jsonb;
