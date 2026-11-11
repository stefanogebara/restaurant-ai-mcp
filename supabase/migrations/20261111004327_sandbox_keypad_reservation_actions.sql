BEGIN;

CREATE TABLE public.keypad_reservation_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_sid text NOT NULL CHECK (btrim(account_sid) <> ''),
  call_sid text NOT NULL UNIQUE CHECK (btrim(call_sid) <> ''),
  caller text NOT NULL CHECK (caller ~ '^\+?[1-9][0-9]{7,14}$'),
  called text NOT NULL CHECK (btrim(called) <> ''),
  restaurant_id uuid NOT NULL CHECK (restaurant_id = '0761e937-6eec-44be-b1d7-34b4209c7f30'::uuid),
  reservation_code text NOT NULL CHECK (
    length(reservation_code) BETWEEN 1 AND 120 AND reservation_code !~ '[[:space:]]'
  ),
  reservation_snapshot jsonb NOT NULL CHECK (jsonb_typeof(reservation_snapshot) = 'object'),
  action text NOT NULL CHECK (action IN ('modify', 'cancel')),
  changes jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (
    jsonb_typeof(changes) = 'object' AND ((action = 'cancel') = (changes = '{}'::jsonb))
  ),
  readback text NOT NULL CHECK (btrim(readback) <> ''),
  expires_at timestamptz NOT NULL CHECK (isfinite(expires_at)),
  state text NOT NULL DEFAULT 'prepared' CHECK (state IN (
    'prepared', 'reading', 'armed', 'committed', 'no_change', 'expired', 'conflict', 'unavailable'
  ))
);

ALTER TABLE public.keypad_reservation_actions ENABLE ROW LEVEL SECURITY;
CREATE POLICY keypad_reservation_actions_service_role
  ON public.keypad_reservation_actions TO service_role USING (true) WITH CHECK (true);

REVOKE ALL ON TABLE public.keypad_reservation_actions FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, UPDATE (state) ON TABLE public.keypad_reservation_actions TO service_role;
GRANT INSERT (
  id, account_sid, call_sid, caller, called, restaurant_id, reservation_code,
  reservation_snapshot, action, changes, readback, expires_at
) ON TABLE public.keypad_reservation_actions TO service_role;

CREATE FUNCTION public.advance_keypad_reservation(
  p_id uuid, p_account_sid text, p_call_sid text, p_from text, p_to text,
  p_phase text, p_digit text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_action public.keypad_reservation_actions%ROWTYPE;
  v_state text;
  v_phone text;
  v_snapshot jsonb;
  v_result jsonb;
BEGIN
  IF p_phase IS NULL OR p_phase NOT IN ('read', 'arm', 'result', 'end') THEN
    RETURN jsonb_build_object('state', 'denied');
  END IF;

  -- Serialize callbacks for the same proposal, including result versus hangup.
  SELECT a.* INTO v_action
  FROM public.keypad_reservation_actions a
  WHERE a.id = p_id AND a.account_sid = p_account_sid AND a.call_sid = p_call_sid
    AND a.caller = p_from AND a.called = p_to
    AND a.restaurant_id = '0761e937-6eec-44be-b1d7-34b4209c7f30'::uuid
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('state', 'denied');
  END IF;

  v_state := v_action.state;
  IF v_state NOT IN ('prepared', 'reading', 'armed') THEN
    RETURN jsonb_build_object('state', v_state);
  END IF;

  -- Out-of-order callbacks leave the action untouched, even past expiry.
  IF (p_phase = 'read' AND v_state = 'armed')
    OR (p_phase = 'arm' AND v_state = 'prepared')
    OR (p_phase = 'result' AND v_state <> 'armed')
  THEN
    RETURN jsonb_build_object('state', v_state);
  END IF;

  IF p_phase = 'end' THEN
    v_state := 'no_change';
  ELSIF v_action.expires_at <= clock_timestamp() THEN
    v_state := 'expired';
  ELSIF p_phase = 'read' AND v_state = 'prepared' THEN
    v_state := 'reading';
  ELSIF p_phase = 'arm' AND v_state = 'reading' THEN
    v_state := 'armed';
  ELSIF p_phase = 'result' AND v_state = 'armed' THEN
    IF p_digit IS DISTINCT FROM '1' THEN
      v_state := 'no_change';
    ELSE
      -- Match mutate_guest_reservation's lock order and ownership predicate.
      -- Keep both locks through the snapshot check and the mutation.
      PERFORM 1 FROM restaurant.restaurant_config c
      WHERE c.id = v_action.restaurant_id AND c.is_active = true
      FOR UPDATE;

      IF v_action.expires_at <= clock_timestamp() THEN
        v_state := 'expired';
      ELSIF NOT FOUND THEN
        v_state := 'unavailable';
      ELSE
        v_phone := ltrim(v_action.caller, '+');
        BEGIN
          SELECT to_jsonb(r) INTO STRICT v_snapshot
          FROM public.reservations r
          WHERE r.restaurant_id = v_action.restaurant_id
            AND r.reservation_id = v_action.reservation_code
            AND length(r.customer_phone) <= 40 AND r.customer_phone ~ '^\+?[0-9 ().-]+$'
            AND regexp_replace(r.customer_phone, '[^0-9]', '', 'g') = v_phone
          FOR UPDATE;
        EXCEPTION WHEN no_data_found OR too_many_rows THEN
          v_snapshot := NULL;
        END;

        IF v_action.expires_at <= clock_timestamp() THEN
          v_state := 'expired';
        ELSIF v_snapshot IS DISTINCT FROM v_action.reservation_snapshot THEN
          v_state := 'conflict';
        ELSE
          BEGIN
            v_result := public.mutate_guest_reservation(
              v_action.restaurant_id, v_phone, v_action.reservation_code,
              v_action.action, v_action.changes
            );
            -- The mutation can also wait for table metadata. Roll it back
            -- if that wait carries the confirmation past its deadline.
            IF v_action.expires_at <= clock_timestamp() THEN
              RAISE SQLSTATE 'PZ001';
            END IF;
            v_state := CASE
              WHEN v_result->>'success' IS DISTINCT FROM 'true' THEN 'unavailable'
              WHEN v_result->>'changed' = 'true' THEN 'committed'
              ELSE 'no_change'
            END;
          EXCEPTION WHEN SQLSTATE 'PZ001' THEN
            v_state := 'expired';
          END;
        END IF;
      END IF;
    END IF;
  END IF;

  IF v_state <> v_action.state THEN
    UPDATE public.keypad_reservation_actions SET state = v_state WHERE id = v_action.id;
  END IF;

  IF p_phase = 'read' AND v_state = 'reading' THEN
    RETURN jsonb_build_object('state', v_state, 'readback', v_action.readback);
  END IF;
  RETURN jsonb_build_object('state', v_state);
END;
$$;

REVOKE ALL ON FUNCTION public.advance_keypad_reservation(uuid, text, text, text, text, text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.advance_keypad_reservation(uuid, text, text, text, text, text, text)
  TO service_role;

COMMIT;
