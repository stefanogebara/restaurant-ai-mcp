-- Remarcar / no-show (meeting lifecycle completion).
-- noshow_em: one-shot marker + audit for the automatic no-show sweep — stamped
-- when a passed meeting ('agendado', reuniao_at + grace elapsed) is reopened;
-- cleared ("re-armed") whenever a meeting is (re)booked or moved.
ALTER TABLE public.prospect_leads
  ADD COLUMN IF NOT EXISTS noshow_em TIMESTAMPTZ;

COMMENT ON COLUMN public.prospect_leads.noshow_em IS
  'Quando o lead virou no-show automático (one-shot); NULL re-arma ao remarcar/reagendar.';
