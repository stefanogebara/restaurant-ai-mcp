BEGIN;

ALTER TABLE public.hosted_reservation_deposits ADD COLUMN checkout_expired_at timestamptz;

CREATE INDEX hosted_reservation_deposits_latest
  ON public.hosted_reservation_deposits (restaurant_id, booking_id, expires_at DESC, superseded_at DESC, id DESC);

-- Record the Stripe observation and stop reusing the expired link in one write.
CREATE FUNCTION public.expire_hosted_deposit_link(p_id uuid, p_session_id text)
RETURNS void LANGUAGE sql SECURITY INVOKER SET search_path = '' AS $$
  UPDATE public.hosted_reservation_deposits
     SET checkout_session_id = p_session_id,
         checkout_params = NULL,
         checkout_expired_at = now(),
         superseded_at = coalesce(superseded_at, now())
   WHERE id = p_id AND state = 'pending' AND checkout_expired_at IS NULL
     AND (checkout_session_id IS NULL OR checkout_session_id = p_session_id);
$$;

CREATE FUNCTION public.list_hosted_deposit_link_statuses(p_restaurant_id uuid, p_booking_ids uuid[])
RETURNS TABLE (booking_id uuid, link_status text)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $$
  SELECT booking.id,
         CASE WHEN attempt.expired THEN 'expired' ELSE 'awaiting_authorization' END
    FROM public.reservations AS booking
    CROSS JOIN LATERAL (
      SELECT link.state, link.checkout_session_id, link.superseded_at,
             link.checkout_expired_at IS NOT NULL OR link.expires_at <= extract(epoch FROM now()) AS expired
        FROM public.hosted_reservation_deposits AS link
       WHERE link.restaurant_id = booking.restaurant_id AND link.booking_id = booking.id
         AND link.reservation_code = booking.reservation_id
         AND ROW(link.booking_date, link.booking_time, link.party_size) = ROW(booking.date, booking.time, booking.party_size)
       ORDER BY link.expires_at DESC, link.superseded_at DESC, link.id DESC
       LIMIT 1
    ) AS attempt
   WHERE booking.restaurant_id = p_restaurant_id AND booking.id = ANY(p_booking_ids)
     AND lower(booking.status) IN ('confirmed', 'pending') AND booking.checked_in_at IS NULL
     AND booking.deposit_payment_intent_id IS NULL AND coalesce(booking.deposit_amount, 0) <= 0
     AND attempt.state = 'pending' AND attempt.checkout_session_id IS NOT NULL
     AND (attempt.superseded_at IS NULL OR attempt.expired);
$$;

REVOKE ALL ON FUNCTION public.expire_hosted_deposit_link(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.expire_hosted_deposit_link(uuid, text) TO service_role;
REVOKE ALL ON FUNCTION public.list_hosted_deposit_link_statuses(uuid, uuid[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.list_hosted_deposit_link_statuses(uuid, uuid[]) TO service_role;

COMMIT;
