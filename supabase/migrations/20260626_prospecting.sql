-- Prospecting agent ("Olivia for Seatable") — Phase 0 schema
-- ----------------------------------------------------------------------------
-- Seatable's OWN outbound sales pipeline: an autonomous WhatsApp agent that
-- discovers restaurants as leads, cold-pitches Seatable, converses, and books
-- demos. This is a SINGLE INTERNAL TENANT — these rows are leads (prospects),
-- NOT customers/guests, and have NO restaurant_id. They are deliberately kept
-- out of the per-restaurant JWT-RLS tenant model: access is service_role-only
-- (crons/webhooks via supabaseAdmin) and an internal-admin auth gate exposes
-- the UI. Do NOT add restaurant_id RLS here, and do NOT copy the source repo's
-- using(true) shared-workspace policy.
--
-- Mirrors the prospectautomation ("Squad · Olivia") data model:
--   prospect_leads      — the single source of truth (fat lead row + conv state)
--   prospect_messages   — append-only WhatsApp conversation log (wamid-deduped)
--   prospect_outcomes   — terminal-state scoring (dashboard input only)
--   prospect_optout     — LGPD suppression list (terminal, never resurrected)

BEGIN;

-- ===========================================================================
-- prospect_leads — single fat lead table (discovery → enrichment → conversation)
-- ===========================================================================
CREATE TABLE IF NOT EXISTS public.prospect_leads (
  id                   UUID         PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Identity / discovery
  name                 TEXT         NOT NULL,
  sector               TEXT,
  address              TEXT,
  neighborhood         TEXT,
  city                 TEXT,
  uf                   TEXT,
  lat                  DOUBLE PRECISION,
  lng                  DOUBLE PRECISION,
  -- google_place_id is the load-bearing upsert/dedup key for discovery. UNIQUE
  -- in Postgres still permits multiple NULLs, so manually-added leads (no place
  -- id) don't collide.
  google_place_id      TEXT         UNIQUE,
  source               TEXT         NOT NULL DEFAULT 'manual',

  -- Contact / signals
  phone                TEXT,
  website              TEXT,
  rating               NUMERIC,
  reviews_count        INTEGER,
  instagram_handle     TEXT,
  instagram_followers  INTEGER,
  owner_name           TEXT,

  -- BR enrichment (Receita Federal). socios is jsonb {nome, qualificacao} —
  -- NEVER store CPF (LGPD). Populated in Phase 3.
  cnpj                 TEXT,
  razao_social         TEXT,
  socios               JSONB,
  porte                TEXT,
  mei                  BOOLEAN,

  lead_score           INTEGER,
  enrich_status        JSONB        NOT NULL DEFAULT '{}'::jsonb,

  -- WhatsApp discovery + send tracking
  whatsapp_phone       TEXT,        -- E.164
  whatsapp_status      TEXT         NOT NULL DEFAULT 'pending',
  whatsapp_source      TEXT,
  whatsapp_checked_at  TIMESTAMPTZ,
  whatsapp_send_status TEXT,
  whatsapp_sent_at     TIMESTAMPTZ,
  whatsapp_msg_id      TEXT,        -- wamid of the outbound intro; maps status webhooks back

  -- Pipeline status (coarse funnel stage)
  status               TEXT         NOT NULL DEFAULT 'descoberto',

  -- Conversation facts/memory (declared facts + rolling summary)
  conversa_fatos       JSONB        NOT NULL DEFAULT '{}'::jsonb,
  conversa_resumo      TEXT,

  -- Conversation state machine (denormalized onto the lead, mirrors olivia_estado)
  prospect_state       TEXT         NOT NULL DEFAULT 'aguardando',
  lock_token           TEXT,        -- CAS concurrency lock; stealable when stale (>90s)
  lock_at              TIMESTAMPTZ,
  reply_apos           TIMESTAMPTZ, -- defer-to-business-hours timestamp (flush cron resumes)
  nudge_em             TIMESTAMPTZ,
  followup_enviado_em  TIMESTAMPTZ, -- one-shot CAS stamp
  pending_slot_iso     TEXT,
  slots                JSONB,
  slots_at             TIMESTAMPTZ,
  handoff_motivo       TEXT,

  -- Booking (Phase 4 — Google Calendar). Denormalized like the source repo.
  prospect_email       TEXT,
  assigned_rep_email   TEXT,
  reuniao_at           TIMESTAMPTZ,
  reuniao_link         TEXT,
  calendar_event_id    TEXT,

  created_at           TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ  NOT NULL DEFAULT now(),

  CONSTRAINT prospect_leads_source_check
    CHECK (source IN ('google_places', 'manual', 'import')),
  CONSTRAINT prospect_leads_whatsapp_status_check
    CHECK (whatsapp_status IN ('pending', 'found', 'missing', 'invalid')),
  CONSTRAINT prospect_leads_whatsapp_send_status_check
    CHECK (whatsapp_send_status IS NULL OR whatsapp_send_status IN
      ('queued', 'sent', 'delivered', 'read', 'replied', 'failed', 'invalid')),
  CONSTRAINT prospect_leads_state_check
    CHECK (prospect_state IN
      ('aguardando', 'conversando', 'agendando', 'agendado', 'handoff', 'optout', 'pausada'))
);

CREATE INDEX IF NOT EXISTS idx_prospect_leads_state        ON public.prospect_leads (prospect_state);
CREATE INDEX IF NOT EXISTS idx_prospect_leads_status       ON public.prospect_leads (status);
CREATE INDEX IF NOT EXISTS idx_prospect_leads_wa_phone     ON public.prospect_leads (whatsapp_phone);
CREATE INDEX IF NOT EXISTS idx_prospect_leads_reply_apos   ON public.prospect_leads (reply_apos) WHERE reply_apos IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_prospect_leads_nudge_em     ON public.prospect_leads (nudge_em)   WHERE nudge_em   IS NOT NULL;

-- ===========================================================================
-- prospect_messages — append-only conversation log (history assembly source)
-- ===========================================================================
CREATE TABLE IF NOT EXISTS public.prospect_messages (
  id           BIGSERIAL    PRIMARY KEY,
  -- nullable so an inbound from an unknown number still gets stored (we may not
  -- have a lead row yet); backfilled when the lead is matched/created.
  lead_id      UUID         REFERENCES public.prospect_leads(id) ON DELETE CASCADE,
  direcao      TEXT         NOT NULL,            -- 'in' | 'out'
  -- Meta re-delivers webhooks; UNIQUE wamid + ON CONFLICT DO NOTHING dedupes.
  -- Nullable because outbound rows are written before Meta returns the id in
  -- some paths; multiple NULLs are allowed by Postgres UNIQUE.
  wamid        TEXT         UNIQUE,
  tipo         TEXT         NOT NULL DEFAULT 'text',
  corpo        TEXT,
  raw          JSONB,
  enviada_em   TIMESTAMPTZ  NOT NULL DEFAULT now(),
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT now(),

  CONSTRAINT prospect_messages_direcao_check CHECK (direcao IN ('in', 'out'))
);

CREATE INDEX IF NOT EXISTS idx_prospect_messages_lead ON public.prospect_messages (lead_id, enviada_em);

-- ===========================================================================
-- prospect_outcomes — terminal-state scoring (dashboard input ONLY; never prompt)
-- ===========================================================================
CREATE TABLE IF NOT EXISTS public.prospect_outcomes (
  id             BIGSERIAL    PRIMARY KEY,
  lead_id        UUID         REFERENCES public.prospect_leads(id) ON DELETE CASCADE,
  outcome        TEXT         NOT NULL,          -- agendado | handoff | optout | pausada
  n_messages     INTEGER,
  handoff_motivo TEXT,
  quality_score  INTEGER,                        -- 1..5, scored by daily cron (Phase 5)
  theme_tags     TEXT[],
  created_at     TIMESTAMPTZ  NOT NULL DEFAULT now(),

  CONSTRAINT prospect_outcomes_quality_check
    CHECK (quality_score IS NULL OR quality_score BETWEEN 1 AND 5)
);

CREATE INDEX IF NOT EXISTS idx_prospect_outcomes_lead ON public.prospect_outcomes (lead_id);

-- ===========================================================================
-- prospect_optout — LGPD suppression list (E.164). Terminal: see trigger below.
-- ===========================================================================
CREATE TABLE IF NOT EXISTS public.prospect_optout (
  id          BIGSERIAL    PRIMARY KEY,
  phone       TEXT         NOT NULL UNIQUE,      -- E.164
  lead_id     UUID         REFERENCES public.prospect_leads(id) ON DELETE SET NULL,
  reason      TEXT,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- ===========================================================================
-- Triggers
-- ===========================================================================

-- touch updated_at on prospect_leads
CREATE OR REPLACE FUNCTION public.prospect_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS prospect_leads_set_updated_at ON public.prospect_leads;
CREATE TRIGGER prospect_leads_set_updated_at
  BEFORE UPDATE ON public.prospect_leads
  FOR EACH ROW EXECUTE FUNCTION public.prospect_set_updated_at();

-- Opt-out is TERMINAL (LGPD): once a lead opts out it can never leave that state,
-- even if a later code path tries to flip it back. Enforced in-DB so no handler
-- bug can resurrect a suppressed contact.
CREATE OR REPLACE FUNCTION public.prospect_enforce_optout_terminal()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.prospect_state = 'optout' AND NEW.prospect_state <> 'optout' THEN
    NEW.prospect_state := 'optout';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS prospect_leads_optout_terminal ON public.prospect_leads;
CREATE TRIGGER prospect_leads_optout_terminal
  BEFORE UPDATE ON public.prospect_leads
  FOR EACH ROW EXECUTE FUNCTION public.prospect_enforce_optout_terminal();

-- ===========================================================================
-- RLS — service_role only. No authenticated/anon access: prospecting data is
-- internal sales tooling, surfaced through an internal-admin auth gate, NOT the
-- customer-facing tenant model.
-- ===========================================================================
ALTER TABLE public.prospect_leads    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prospect_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prospect_outcomes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prospect_optout   ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS prospect_leads_service_all    ON public.prospect_leads;
DROP POLICY IF EXISTS prospect_messages_service_all ON public.prospect_messages;
DROP POLICY IF EXISTS prospect_outcomes_service_all ON public.prospect_outcomes;
DROP POLICY IF EXISTS prospect_optout_service_all   ON public.prospect_optout;

CREATE POLICY prospect_leads_service_all    ON public.prospect_leads    FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY prospect_messages_service_all ON public.prospect_messages FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY prospect_outcomes_service_all ON public.prospect_outcomes FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY prospect_optout_service_all   ON public.prospect_optout   FOR ALL TO service_role USING (true) WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.prospect_leads    TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.prospect_messages TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.prospect_outcomes TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.prospect_optout   TO service_role;

GRANT USAGE, SELECT ON SEQUENCE public.prospect_messages_id_seq TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.prospect_outcomes_id_seq TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.prospect_optout_id_seq   TO service_role;

COMMIT;
