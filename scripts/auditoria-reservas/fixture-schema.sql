-- Disposable audit fixture: production column shapes (11/nov/2026) for the
-- three tables the guest-reservation functions read and write.
CREATE EXTENSION IF NOT EXISTS pgcrypto;
DO $$ BEGIN
  CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN BYPASSRLS;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE SCHEMA IF NOT EXISTS restaurant;
CREATE TYPE public.table_status AS ENUM ('available','occupied','reserved','cleaning','maintenance');
CREATE TABLE restaurant.restaurant_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL DEFAULT gen_random_uuid(),
  restaurant_name varchar NOT NULL DEFAULT 'Casa Teste', restaurant_type text NOT NULL DEFAULT 'casual_dining',
  city varchar NOT NULL DEFAULT 'São Paulo', country varchar NOT NULL DEFAULT 'BR', email varchar NOT NULL DEFAULT 'casa@example.test',
  phone varchar NOT NULL DEFAULT '+551100000000', business_hours jsonb NOT NULL,
  reservation_settings jsonb NOT NULL DEFAULT '{"max_party_size": 12, "advance_booking_days": 30}',
  average_dining_duration_minutes integer NOT NULL DEFAULT 90, max_concurrent_reservations integer DEFAULT 50,
  is_active boolean NOT NULL DEFAULT true, timezone text NOT NULL DEFAULT 'America/Sao_Paulo', slug varchar,
  elevenlabs_agent_id text, elevenlabs_webhook_secret text, is_demo boolean NOT NULL DEFAULT false,
  ai_config jsonb DEFAULT '{}', whatsapp_enabled boolean DEFAULT false, deposit_config jsonb DEFAULT '{"enabled": false}',
  onboarding_completed boolean NOT NULL DEFAULT true, agent_language text NOT NULL DEFAULT 'pt'
);
CREATE TABLE public.tables (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), table_number integer NOT NULL, capacity integer NOT NULL,
  location varchar DEFAULT 'Main', status public.table_status DEFAULT 'available', current_service_id uuid,
  is_active boolean DEFAULT true, is_fixed boolean DEFAULT false, combination_group varchar,
  adjacent_tables uuid[] DEFAULT '{}', min_capacity integer DEFAULT 1, max_capacity integer,
  is_joinable boolean DEFAULT false, joinable_with uuid[] DEFAULT '{}', restaurant_id uuid NOT NULL,
  created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now()
);
CREATE TABLE public.reservations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), reservation_id text NOT NULL UNIQUE, customer_name text NOT NULL,
  customer_phone text, customer_email text, party_size integer NOT NULL DEFAULT 2, date date NOT NULL,
  time time without time zone NOT NULL, special_requests text, status text NOT NULL DEFAULT 'pending', table_ids text[],
  checked_in_at timestamptz, notes text, source varchar DEFAULT 'manual',
  restaurant_id uuid NOT NULL REFERENCES restaurant.restaurant_config(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now(),
  deposit_payment_intent_id text, deposit_amount numeric, reminder_sent boolean DEFAULT false, external_id text
);
CREATE UNIQUE INDEX idx_reservations_external ON public.reservations (restaurant_id, source, external_id) WHERE external_id IS NOT NULL;
ALTER TABLE public.reservations ENABLE ROW LEVEL SECURITY;
CREATE POLICY service_role_full_access ON public.reservations TO service_role USING (true);
GRANT USAGE ON SCHEMA restaurant TO service_role;
GRANT ALL ON ALL TABLES IN SCHEMA public, restaurant TO service_role;
-- Columns the restaurant loader selects (production shapes).
ALTER TABLE restaurant.restaurant_config
  ADD COLUMN IF NOT EXISTS website varchar, ADD COLUMN IF NOT EXISTS voice_id varchar NOT NULL DEFAULT 'default',
  ADD COLUMN IF NOT EXISTS voice_engine text NOT NULL DEFAULT 'elevenlabs', ADD COLUMN IF NOT EXISTS voice_engine_status text DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS openai_voice_id text DEFAULT 'alloy', ADD COLUMN IF NOT EXISTS persona_prompt_override text,
  ADD COLUMN IF NOT EXISTS voice_ws_endpoint text, ADD COLUMN IF NOT EXISTS agent_name text, ADD COLUMN IF NOT EXISTS agent_greeting text,
  ADD COLUMN IF NOT EXISTS table_configuration jsonb NOT NULL DEFAULT '[]', ADD COLUMN IF NOT EXISTS team_members jsonb DEFAULT '[]';
ALTER TABLE public.reservations ADD COLUMN IF NOT EXISTS ml_risk_score numeric, ADD COLUMN IF NOT EXISTS ml_risk_level text,
  ADD COLUMN IF NOT EXISTS ml_confidence numeric, ADD COLUMN IF NOT EXISTS ml_model_version text,
  ADD COLUMN IF NOT EXISTS ml_prediction_timestamp timestamptz;
ALTER TABLE public.tables ADD COLUMN IF NOT EXISTS shape varchar DEFAULT 'square', ADD COLUMN IF NOT EXISTS position_x integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS position_y integer DEFAULT 0, ADD COLUMN IF NOT EXISTS width integer DEFAULT 1, ADD COLUMN IF NOT EXISTS height integer DEFAULT 1,
  ADD COLUMN IF NOT EXISTS rotation integer DEFAULT 0, ADD COLUMN IF NOT EXISTS is_fixed_seating boolean DEFAULT false;
