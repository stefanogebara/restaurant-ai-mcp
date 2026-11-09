-- Service-owned outbound reservation confirmations. Historical sends remain unknown.
CREATE TABLE public.reservation_whatsapp_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES restaurant.restaurant_config(id) ON DELETE CASCADE,
  reservation_id uuid NOT NULL REFERENCES public.reservations(id) ON DELETE CASCADE,
  recipient_phone text NOT NULL,
  sender_id text NOT NULL,
  provider_message_id text UNIQUE,
  status text NOT NULL DEFAULT 'requested' CHECK (status IN ('requested','accepted','sent','delivered','read','failed','unknown')),
  error_message text,
  requested_at timestamptz NOT NULL DEFAULT now(),
  status_updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON public.reservation_whatsapp_messages (restaurant_id, reservation_id, requested_at DESC);
ALTER TABLE public.reservation_whatsapp_messages ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.reservation_whatsapp_messages FROM anon, authenticated;
GRANT ALL ON public.reservation_whatsapp_messages TO service_role;

-- One atomic update prevents late HTTP responses / sent events from undoing delivery.
CREATE FUNCTION public.advance_reservation_whatsapp_message(
  p_id uuid, p_message_id text, p_status text, p_sender text, p_recipient text, p_error text DEFAULT NULL
) RETURNS void LANGUAGE sql SECURITY INVOKER SET search_path = public AS $$
  WITH changed AS (UPDATE public.reservation_whatsapp_messages SET
    provider_message_id = COALESCE(provider_message_id, p_message_id),
    status = p_status,
    error_message = CASE WHEN p_status IN ('failed','unknown') THEN left(p_error,500) ELSE NULL END,
    status_updated_at = now()
  WHERE (id = p_id OR (p_id IS NULL AND provider_message_id = p_message_id))
    AND sender_id = p_sender AND recipient_phone = p_recipient
    AND (provider_message_id IS NULL OR provider_message_id = p_message_id OR p_message_id IS NULL)
    AND CASE p_status
      WHEN 'read' THEN status <> 'read'
      WHEN 'delivered' THEN status NOT IN ('read','delivered')
      WHEN 'failed' THEN status IN ('requested','unknown','accepted','sent')
      WHEN 'sent' THEN status IN ('requested','unknown','accepted')
      WHEN 'accepted' THEN status IN ('requested','unknown')
      WHEN 'unknown' THEN status = 'requested'
      ELSE false END
    RETURNING reservation_id, restaurant_id)
  UPDATE public.reservations r SET updated_at = now()
  FROM changed c WHERE r.id=c.reservation_id AND r.restaurant_id=c.restaurant_id;
$$;
REVOKE ALL ON FUNCTION public.advance_reservation_whatsapp_message(uuid,text,text,text,text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.advance_reservation_whatsapp_message(uuid,text,text,text,text,text) TO service_role;
