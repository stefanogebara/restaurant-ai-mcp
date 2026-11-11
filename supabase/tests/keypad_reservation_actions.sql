-- Run with psql -X -v ON_ERROR_STOP=1 -f <this file> on a fresh, disposable
-- PostgreSQL cluster with dblink installed and local connections enabled.
\set ON_ERROR_STOP on

CREATE ROLE anon;
CREATE ROLE authenticated;
CREATE ROLE service_role;
CREATE SCHEMA restaurant;

CREATE TABLE restaurant.restaurant_config (
  id uuid PRIMARY KEY,
  is_active boolean NOT NULL DEFAULT true,
  timezone text NOT NULL DEFAULT 'UTC',
  reservation_settings jsonb NOT NULL DEFAULT '{}',
  business_hours jsonb NOT NULL,
  average_dining_duration_minutes integer DEFAULT 90
);

CREATE TABLE public.reservations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES restaurant.restaurant_config,
  reservation_id text NOT NULL,
  customer_name text NOT NULL DEFAULT 'Fixture Guest',
  customer_phone text NOT NULL DEFAULT '+1 (202) 555-0100',
  date date NOT NULL DEFAULT current_date + 2,
  time time NOT NULL DEFAULT '18:00',
  party_size integer NOT NULL DEFAULT 2,
  status text NOT NULL DEFAULT 'confirmed',
  table_ids uuid[] NOT NULL DEFAULT '{}',
  special_requests text
);

CREATE TABLE public.tables (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES restaurant.restaurant_config,
  capacity integer NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  is_fixed boolean NOT NULL DEFAULT false,
  adjacent_tables jsonb NOT NULL DEFAULT '[]',
  combination_group text,
  location text
);

GRANT USAGE ON SCHEMA restaurant TO service_role;
GRANT SELECT, UPDATE ON restaurant.restaurant_config, public.reservations, public.tables TO service_role;
-- Reproduce broad default grants so this exercises the migration's revokes.
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO anon, authenticated, service_role;

\ir ../migrations/20261110180955_retain_guest_reservation_table_assignment.sql
\ir ../migrations/20261111004327_sandbox_keypad_reservation_actions.sql

INSERT INTO restaurant.restaurant_config (id, business_hours)
SELECT '0761e937-6eec-44be-b1d7-34b4209c7f30',
  jsonb_object_agg(day, '{"open":"12:00","close":"23:00"}'::jsonb)
FROM unnest(ARRAY['monday','tuesday','wednesday','thursday','friday','saturday','sunday']) AS days(day);
INSERT INTO public.tables (restaurant_id, capacity)
VALUES ('0761e937-6eec-44be-b1d7-34b4209c7f30', 100);

INSERT INTO public.reservations (restaurant_id, reservation_id)
SELECT '0761e937-6eec-44be-b1d7-34b4209c7f30', code
FROM unnest(ARRAY[
  'modify', 'cancel', 'press-2', 'other-digit', 'empty', 'hangup',
  'expired', 'conflict', 'unavailable', 'idempotent', 'race', 'lock-expiry'
]) AS cases(code);

SET ROLE service_role;
INSERT INTO public.keypad_reservation_actions (
  account_sid, call_sid, caller, called, restaurant_id, reservation_code,
  reservation_snapshot, action, changes, readback, expires_at
)
SELECT 'AC-fixture', 'CA-' || r.reservation_id, '+12025550100', '+12025550101',
  r.restaurant_id, r.reservation_id, to_jsonb(r),
  CASE WHEN r.reservation_id IN ('modify', 'unavailable', 'idempotent') THEN 'modify' ELSE 'cancel' END,
  CASE r.reservation_id
    WHEN 'modify' THEN '{"party_size":3}'::jsonb
    WHEN 'unavailable' THEN '{"time":"06:00"}'::jsonb
    WHEN 'idempotent' THEN '{"party_size":2}'::jsonb
    ELSE '{}'::jsonb
  END,
  'Frozen ' || r.reservation_id,
  clock_timestamp() + CASE WHEN r.reservation_id = 'expired' THEN interval '-1 second' ELSE interval '10 minutes' END
FROM public.reservations r;

CREATE FUNCTION pg_temp.expect_step(
  p_case text, p_phase text, p_state text, p_digit text DEFAULT NULL,
  p_readback text DEFAULT NULL, p_binding_mismatch text DEFAULT NULL
)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  v_id uuid;
  v_actual jsonb;
  v_expected jsonb := jsonb_build_object('state', p_state);
BEGIN
  SELECT id INTO STRICT v_id FROM public.keypad_reservation_actions WHERE call_sid = 'CA-' || p_case;
  v_actual := public.advance_keypad_reservation(
    CASE WHEN p_binding_mismatch = 'id' THEN gen_random_uuid() ELSE v_id END,
    CASE WHEN p_binding_mismatch = 'account' THEN 'AC-wrong' ELSE 'AC-fixture' END,
    CASE WHEN p_binding_mismatch = 'call' THEN 'CA-wrong' ELSE 'CA-' || p_case END,
    CASE WHEN p_binding_mismatch = 'from' THEN '+12025550102' ELSE '+12025550100' END,
    CASE WHEN p_binding_mismatch = 'to' THEN '+12025550103' ELSE '+12025550101' END,
    p_phase, p_digit
  );
  IF p_readback IS NOT NULL THEN
    v_expected := v_expected || jsonb_build_object('readback', p_readback);
  END IF;
  IF v_actual IS DISTINCT FROM v_expected THEN
    RAISE EXCEPTION '% / %: expected %, got %', p_case, p_phase, v_expected, v_actual;
  END IF;
END;
$$;

DO $$
DECLARE
  v_case text;
  v_binding text;
BEGIN
  FOREACH v_binding IN ARRAY ARRAY['id', 'account', 'call', 'from', 'to'] LOOP
    PERFORM pg_temp.expect_step('modify', 'read', 'denied', p_binding_mismatch => v_binding);
  END LOOP;
  PERFORM pg_temp.expect_step('modify', 'unknown', 'denied');
  PERFORM pg_temp.expect_step('modify', 'arm', 'prepared');
  PERFORM pg_temp.expect_step('modify', 'result', 'prepared', '1');
  PERFORM pg_temp.expect_step('modify', 'read', 'reading', p_readback => 'Frozen modify');
  PERFORM pg_temp.expect_step('modify', 'read', 'reading', p_readback => 'Frozen modify');
  PERFORM pg_temp.expect_step('modify', 'result', 'reading', '1');
  PERFORM pg_temp.expect_step('modify', 'arm', 'armed');
  PERFORM pg_temp.expect_step('modify', 'arm', 'armed');
  PERFORM pg_temp.expect_step('modify', 'read', 'armed');
  IF (SELECT party_size FROM public.reservations WHERE reservation_id = 'modify') <> 2 THEN
    RAISE EXCEPTION 'reservation modified before confirmation';
  END IF;
  PERFORM pg_temp.expect_step('modify', 'result', 'committed', '1');
  PERFORM pg_temp.expect_step('modify', 'result', 'committed', '2');
  PERFORM pg_temp.expect_step('modify', 'end', 'committed');
  PERFORM pg_temp.expect_step('modify', 'read', 'committed');
  IF (SELECT party_size FROM public.reservations WHERE reservation_id = 'modify') <> 3 THEN
    RAISE EXCEPTION 'confirmed modification did not apply';
  END IF;

  FOREACH v_case IN ARRAY ARRAY[
    'cancel', 'press-2', 'other-digit', 'empty', 'hangup', 'conflict', 'unavailable', 'idempotent', 'race', 'lock-expiry'
  ] LOOP
    PERFORM pg_temp.expect_step(v_case, 'read', 'reading', p_readback => 'Frozen ' || v_case);
    PERFORM pg_temp.expect_step(v_case, 'arm', 'armed');
  END LOOP;
  PERFORM pg_temp.expect_step('cancel', 'result', 'committed', '1');
  PERFORM pg_temp.expect_step('press-2', 'result', 'no_change', '2');
  PERFORM pg_temp.expect_step('other-digit', 'result', 'no_change', '9');
  PERFORM pg_temp.expect_step('empty', 'result', 'no_change');
  PERFORM pg_temp.expect_step('hangup', 'end', 'no_change');
  PERFORM pg_temp.expect_step('hangup', 'end', 'no_change');
  PERFORM pg_temp.expect_step('expired', 'result', 'prepared', '1');
  PERFORM pg_temp.expect_step('expired', 'read', 'expired');
  PERFORM pg_temp.expect_step('expired', 'end', 'expired');
  UPDATE public.reservations SET special_requests = 'Changed after readback' WHERE reservation_id = 'conflict';
  PERFORM pg_temp.expect_step('conflict', 'result', 'conflict', '1');
  PERFORM pg_temp.expect_step('unavailable', 'result', 'unavailable', '1');
  PERFORM pg_temp.expect_step('idempotent', 'result', 'no_change', '1');
  FOREACH v_case IN ARRAY ARRAY['press-2', 'other-digit', 'empty', 'hangup'] LOOP
    PERFORM pg_temp.expect_step(v_case, 'result', 'no_change', '1');
  END LOOP;

  IF EXISTS (SELECT 1 FROM public.reservations WHERE reservation_id <> 'cancel' AND status <> 'confirmed')
    OR (SELECT status FROM public.reservations WHERE reservation_id = 'cancel') <> 'cancelled' THEN
    RAISE EXCEPTION 'unexpected cancellation';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.reservations r JOIN public.keypad_reservation_actions a
      ON a.reservation_code = r.reservation_id
    WHERE r.reservation_id NOT IN ('cancel', 'modify', 'conflict') AND to_jsonb(r) <> a.reservation_snapshot
  ) THEN
    RAISE EXCEPTION 'reservation changed without a successful mutation';
  END IF;

  BEGIN
    INSERT INTO public.keypad_reservation_actions (
      account_sid, call_sid, caller, called, restaurant_id, reservation_code,
      reservation_snapshot, action, changes, readback, expires_at
    )
    SELECT 'AC-other', call_sid, caller, called, restaurant_id, reservation_code,
      reservation_snapshot, action, changes, readback, expires_at
    FROM public.keypad_reservation_actions WHERE call_sid = 'CA-modify';
    RAISE EXCEPTION 'duplicate call SID accepted';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;

  BEGIN
    INSERT INTO public.keypad_reservation_actions (
      account_sid, call_sid, caller, called, restaurant_id, reservation_code,
      reservation_snapshot, action, changes, readback, expires_at
    )
    SELECT account_sid, 'CA-other-tenant', caller, called, gen_random_uuid(), reservation_code,
      reservation_snapshot, action, changes, readback, expires_at
    FROM public.keypad_reservation_actions WHERE call_sid = 'CA-modify';
    RAISE EXCEPTION 'another tenant accepted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  BEGIN
    UPDATE public.keypad_reservation_actions SET readback = 'changed' WHERE call_sid = 'CA-modify';
    RAISE EXCEPTION 'readback was mutable';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END;
$$;
RESET ROLE;

DO $$
DECLARE
  v_role text;
BEGIN
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.keypad_reservation_actions'::regclass) THEN
    RAISE EXCEPTION 'keypad actions RLS is disabled';
  END IF;
  FOREACH v_role IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF has_any_column_privilege(v_role, 'public.keypad_reservation_actions', 'SELECT,INSERT,UPDATE,REFERENCES')
      OR has_table_privilege(v_role, 'public.keypad_reservation_actions', 'DELETE,TRUNCATE,TRIGGER')
      OR has_function_privilege(v_role,
        'public.advance_keypad_reservation(uuid,text,text,text,text,text,text)', 'EXECUTE') THEN
      RAISE EXCEPTION 'unexpected keypad privilege for %', v_role;
    END IF;
  END LOOP;
END;
$$;

CREATE EXTENSION dblink;
SELECT dblink_connect('keypad_first', format('host=%L port=%L dbname=%L user=%L',
  current_setting('unix_socket_directories'), current_setting('port'), current_database(), current_user));
SELECT dblink_connect('keypad_second', format('host=%L port=%L dbname=%L user=%L',
  current_setting('unix_socket_directories'), current_setting('port'), current_database(), current_user));
SELECT dblink_exec('keypad_first', 'SET ROLE service_role');
SELECT dblink_exec('keypad_second', 'SET ROLE service_role');

CREATE FUNCTION pg_temp.confirm_sql(p_case text)
RETURNS text LANGUAGE sql AS $$
  SELECT format(
    'SELECT public.advance_keypad_reservation(%L, %L, %L, %L, %L, %L, %L)',
    id, account_sid, call_sid, caller, called, 'result', '1'
  )
  FROM public.keypad_reservation_actions WHERE reservation_code = p_case;
$$;

CREATE TABLE public.fixture_race_updates (updates integer NOT NULL);
INSERT INTO public.fixture_race_updates VALUES (0);
CREATE FUNCTION public.fixture_count_race_update()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  UPDATE public.fixture_race_updates SET updates = updates + 1;
  RETURN NULL;
END;
$$;
CREATE TRIGGER fixture_count_race_update AFTER UPDATE ON public.reservations
FOR EACH ROW WHEN (NEW.reservation_id = 'race') EXECUTE FUNCTION public.fixture_count_race_update();

-- Both confirmations contend for the same proposal. Each sees the same
-- terminal state, and the real mutation updates the reservation once.
BEGIN;
SELECT id FROM public.keypad_reservation_actions WHERE reservation_code = 'race' FOR UPDATE;
SELECT dblink_send_query('keypad_first', pg_temp.confirm_sql('race'));
SELECT dblink_send_query('keypad_second', pg_temp.confirm_sql('race'));
COMMIT;

DO $$
DECLARE
  v_conn text;
  v_result jsonb;
BEGIN
  FOREACH v_conn IN ARRAY ARRAY['keypad_first', 'keypad_second'] LOOP
    SELECT reply INTO STRICT v_result FROM dblink_get_result(v_conn) AS result(reply jsonb);
    IF v_result IS DISTINCT FROM '{"state":"committed"}'::jsonb THEN
      RAISE EXCEPTION 'concurrent confirmation returned %', v_result;
    END IF;
    -- Drain the end-of-results marker before reusing a connection.
    PERFORM reply FROM dblink_get_result(v_conn) AS result(reply jsonb);
  END LOOP;
  IF (SELECT updates FROM public.fixture_race_updates) <> 1 THEN
    RAISE EXCEPTION 'concurrent confirmation did not update exactly once';
  END IF;
END;
$$;

-- Start confirmation before expiry and hold the restaurant lock past expiry.
-- A transaction-start clock would still allow the cancellation after release.
UPDATE public.keypad_reservation_actions SET expires_at = clock_timestamp() + interval '3 seconds'
WHERE reservation_code = 'lock-expiry';
BEGIN;
SELECT id FROM restaurant.restaurant_config FOR UPDATE;
SELECT dblink_send_query('keypad_first', pg_temp.confirm_sql('lock-expiry'));
DO $$
BEGIN
  LOOP
    PERFORM pg_stat_clear_snapshot();
    EXIT WHEN EXISTS (
      SELECT 1 FROM pg_stat_activity
      WHERE pid <> pg_backend_pid() AND query = pg_temp.confirm_sql('lock-expiry')
        AND wait_event_type = 'Lock'
    );
    IF clock_timestamp() >= (SELECT expires_at FROM public.keypad_reservation_actions
                             WHERE reservation_code = 'lock-expiry') THEN
      RAISE EXCEPTION 'confirmation did not reach the restaurant lock before expiry';
    END IF;
    PERFORM pg_sleep(0.01);
  END LOOP;
END;
$$;
SELECT pg_sleep_until(expires_at + interval '50 milliseconds')
FROM public.keypad_reservation_actions WHERE reservation_code = 'lock-expiry';
COMMIT;

DO $$
DECLARE
  v_result jsonb;
BEGIN
  SELECT reply INTO STRICT v_result FROM dblink_get_result('keypad_first') AS result(reply jsonb);
  IF v_result IS DISTINCT FROM '{"state":"expired"}'::jsonb
    OR (SELECT status FROM public.reservations WHERE reservation_id = 'lock-expiry') <> 'confirmed' THEN
    RAISE EXCEPTION 'confirmation after lock wait returned % or mutated the reservation', v_result;
  END IF;
END;
$$;

SELECT dblink_disconnect('keypad_first');
SELECT dblink_disconnect('keypad_second');
