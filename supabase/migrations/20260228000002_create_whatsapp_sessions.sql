-- Migration: Create whatsapp_sessions table
-- Purpose: Stateful conversation sessions for WhatsApp AI agent
-- One session per phone number, expires after inactivity (TTL managed at app level)

CREATE TABLE IF NOT EXISTS public.whatsapp_sessions (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_phone          text        NOT NULL,
  conversation_id       text,                                           -- WhatsApp conversation thread ID
  restaurant_id         uuid        REFERENCES public.restaurant_registry(id) ON DELETE SET NULL,
  restaurant_confirmed  boolean     NOT NULL DEFAULT false,             -- Whether user has confirmed which restaurant they're contacting
  conversation_history  jsonb       NOT NULL DEFAULT '[]'::jsonb,       -- OpenRouter-format message array
  last_message_at       timestamptz NOT NULL DEFAULT now(),
  expires_at            timestamptz NOT NULL,                           -- Session TTL (typically now() + 24h)
  created_at            timestamptz NOT NULL DEFAULT now()
);

-- Primary lookup: find active session for a phone number
CREATE INDEX IF NOT EXISTS whatsapp_sessions_phone_expires_idx
  ON public.whatsapp_sessions(sender_phone, expires_at DESC);

-- Lookup by WhatsApp conversation ID (used for threading)
CREATE INDEX IF NOT EXISTS whatsapp_sessions_conversation_id_idx
  ON public.whatsapp_sessions(conversation_id)
  WHERE conversation_id IS NOT NULL;
