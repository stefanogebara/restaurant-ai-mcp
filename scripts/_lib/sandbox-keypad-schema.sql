-- Banco local descartável para scripts/sandbox-keypad-call-test.cjs. Só as
-- colunas que a confirmação por tecla e mutate_guest_reservation usam.
-- Nunca rode isto num banco do Supabase.
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN BYPASSRLS;
CREATE SCHEMA restaurant;
CREATE TABLE restaurant.restaurant_config (
  id uuid PRIMARY KEY, restaurant_name text NOT NULL, is_active boolean NOT NULL,
  timezone text, reservation_settings jsonb, business_hours jsonb,
  average_dining_duration_minutes integer
);
CREATE TABLE public.reservations (
  id uuid PRIMARY KEY, restaurant_id uuid NOT NULL, reservation_id text NOT NULL,
  customer_phone text NOT NULL, customer_name text, date date, time time,
  party_size integer, status text, table_ids uuid[], special_requests text,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.tables (
  id uuid PRIMARY KEY, restaurant_id uuid NOT NULL, is_active boolean,
  capacity integer, is_fixed boolean, adjacent_tables uuid[], combination_group text, location text
);
GRANT USAGE ON SCHEMA restaurant TO service_role;
GRANT SELECT, UPDATE ON restaurant.restaurant_config, public.reservations, public.tables TO service_role;
INSERT INTO restaurant.restaurant_config VALUES (
  '0761e937-6eec-44be-b1d7-34b4209c7f30','Seatable CI Sandbox',true,'America/Sao_Paulo',
  '{"max_party_size":8,"advance_booking_days":14}',
  (SELECT jsonb_object_agg(d, '{"open":"10:00","close":"23:00"}'::jsonb) FROM unnest(ARRAY['monday','tuesday','wednesday','thursday','friday','saturday','sunday']) d),90
);
INSERT INTO public.tables VALUES ('a61fb25d-70ae-44a7-a624-7c43aeed928d','0761e937-6eec-44be-b1d7-34b4209c7f30',true,4,false,'{}',NULL,'Salão');
