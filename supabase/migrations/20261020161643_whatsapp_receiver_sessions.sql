-- Inbound identity is the provider's receiving account PLUS the guest, not
-- the guest's phone alone. Legacy rows remain unscoped and are never read by
-- inbound webhooks after the corresponding code deploy.
ALTER TABLE public.whatsapp_sessions
  ADD COLUMN inbound_provider text,
  ADD COLUMN inbound_receiver text;

ALTER TABLE public.whatsapp_sessions
  ADD CONSTRAINT whatsapp_sessions_inbound_scope_check
  CHECK ((inbound_provider IS NULL AND inbound_receiver IS NULL) OR
         (inbound_provider IS NOT NULL AND inbound_provider IN ('meta', 'twilio', 'waha') AND
          inbound_receiver IS NOT NULL AND length(inbound_receiver) BETWEEN 1 AND 80));

CREATE UNIQUE INDEX whatsapp_sessions_inbound_identity_unique
  ON public.whatsapp_sessions (inbound_provider, inbound_receiver, sender_phone)
  WHERE inbound_provider IS NOT NULL;

COMMENT ON COLUMN public.whatsapp_sessions.inbound_receiver IS
  'Verified Meta phone number ID, Twilio receiving phone, or WAHA session. Never infer from guest phone.';

-- A token prevents a timed-out Lambda from deleting the next Lambda's lock.
ALTER TABLE public.whatsapp_processing_lock ADD COLUMN owner_token uuid;

-- The rate-limiter code has called whatsapp_rate_bump for months, but this
-- function/table was never present in production. A per-Lambda Map therefore
-- provided the only protection. Count once per receiver-scoped key, atomically.
CREATE TABLE public.whatsapp_rate_buckets (
  rate_key text NOT NULL,
  bucket_start timestamptz NOT NULL,
  message_count integer NOT NULL DEFAULT 0,
  PRIMARY KEY (rate_key, bucket_start)
);
CREATE INDEX whatsapp_rate_buckets_bucket_start_idx
  ON public.whatsapp_rate_buckets (bucket_start);
ALTER TABLE public.whatsapp_rate_buckets ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.whatsapp_rate_buckets FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.whatsapp_rate_buckets TO service_role;

CREATE FUNCTION public.whatsapp_rate_bump(p_phone text, p_janela_seg integer)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  start_at timestamptz;
  result_count integer;
BEGIN
  IF p_phone IS NULL OR length(p_phone) NOT BETWEEN 1 AND 200 OR
     p_janela_seg NOT BETWEEN 1 AND 3600 THEN
    RAISE EXCEPTION 'Invalid rate-limit input';
  END IF;
  start_at := to_timestamp(floor(extract(epoch FROM clock_timestamp()) / p_janela_seg) * p_janela_seg);
  INSERT INTO public.whatsapp_rate_buckets (rate_key, bucket_start, message_count)
  VALUES (p_phone, start_at, 1)
  ON CONFLICT (rate_key, bucket_start) DO UPDATE
    SET message_count = public.whatsapp_rate_buckets.message_count + 1
  RETURNING message_count INTO result_count;
  RETURN result_count;
END;
$$;
REVOKE ALL ON FUNCTION public.whatsapp_rate_bump(text, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.whatsapp_rate_bump(text, integer) TO service_role;

CREATE FUNCTION public.whatsapp_rate_limpar(p_manter_horas integer)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  deleted_count integer;
BEGIN
  IF p_manter_horas NOT BETWEEN 1 AND 168 THEN
    RAISE EXCEPTION 'Invalid rate-limit retention';
  END IF;
  DELETE FROM public.whatsapp_rate_buckets
    WHERE bucket_start < clock_timestamp() - make_interval(hours => p_manter_horas);
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;
REVOKE ALL ON FUNCTION public.whatsapp_rate_limpar(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.whatsapp_rate_limpar(integer) TO service_role;

-- Persist the exact reply before an external send. If Meta explicitly rejects
-- it, a webhook retry resends this text without rerunning AI tools or writing
-- a feedback/survey rating twice. Unknown send outcomes remain quarantined.
CREATE TABLE public.whatsapp_inbound_replies (
  inbound_key text PRIMARY KEY,
  reply_text text NOT NULL CHECK (length(reply_text) BETWEEN 1 AND 10000),
  purpose text NOT NULL CHECK (length(purpose) BETWEEN 1 AND 40),
  restaurant_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX whatsapp_inbound_replies_created_at_idx
  ON public.whatsapp_inbound_replies (created_at);
ALTER TABLE public.whatsapp_inbound_replies ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.whatsapp_inbound_replies FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, DELETE ON public.whatsapp_inbound_replies TO service_role;

-- A rating and its inbound key must commit in the SAME row update/insert.
-- If writing the separate reply intent then fails, the webhook can recover
-- the saved rating by key instead of treating the guest's "5" as a new AI turn.
ALTER TABLE public.guest_feedback ADD COLUMN whatsapp_inbound_key text;
CREATE UNIQUE INDEX guest_feedback_whatsapp_inbound_key_unique
  ON public.guest_feedback (whatsapp_inbound_key)
  WHERE whatsapp_inbound_key IS NOT NULL;

ALTER TABLE restaurant.survey_responses ADD COLUMN whatsapp_inbound_key text;
CREATE UNIQUE INDEX survey_responses_whatsapp_inbound_key_unique
  ON restaurant.survey_responses (whatsapp_inbound_key)
  WHERE whatsapp_inbound_key IS NOT NULL;
