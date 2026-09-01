-- Transbordo humano no canal de hóspede do WhatsApp.
--
-- Origem: spike `whatsapp-transbordo-humano` (docs/intel/BACKLOG.md), aberto
-- depois que a Foodster/Wiv publicou um agente de WhatsApp com transbordo no
-- Fogo de Chão. Das capacidades que eles anunciam, essa é a única que este repo
-- não tinha: `handoff` existia só na prospecção (api/cron/prospect-handoff-digest.js),
-- com zero ocorrências em api/_services/whatsapp/ e api/_lib/channels/.
--
-- DUAS DECISÕES DE DESENHO ESTÃO CODIFICADAS AQUI, e valem explicação:
--
-- 1. A pausa EXPIRA. `handoff_paused_until` é um instante, não um booleano.
--    Pausa sem prazo é armadilha: se o host não vir a notificação — e ele vai
--    estar servindo mesa —, o cliente fica falando com ninguém para sempre, o
--    que é pior que a esquiva atual ("posso verificar isso e te respondo").
--    Vencido o prazo, a IA retoma sozinha.
--
-- 2. O recurso nasce DESLIGADO por restaurante. O critério de parada do spike é
--    "qualquer falso-positivo, pare" — transbordo mal calibrado transforma
--    automação em plantão humano. Sem medição contra conversa real não há como
--    afirmar que o gatilho não dispara demais, então nenhum restaurante recebe
--    isso até alguém ligar de propósito, depois de calibrar.

ALTER TABLE public.whatsapp_sessions
  ADD COLUMN IF NOT EXISTS handoff_paused_until TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS handoff_reason TEXT,
  ADD COLUMN IF NOT EXISTS handoff_requested_at TIMESTAMPTZ;

COMMENT ON COLUMN public.whatsapp_sessions.handoff_paused_until IS
  'Enquanto no futuro, a IA não responde: a conversa está com um humano. Expira sozinha — ver a decisão 1 na migration 20260901_whatsapp_handoff.sql.';
COMMENT ON COLUMN public.whatsapp_sessions.handoff_reason IS
  'O que o agente disse que não conseguia resolver. É o material de calibração do gatilho.';

-- Só as sessões pausadas interessam à consulta de retomada; índice parcial.
CREATE INDEX IF NOT EXISTS idx_whatsapp_sessions_handoff_paused
  ON public.whatsapp_sessions (handoff_paused_until)
  WHERE handoff_paused_until IS NOT NULL;

ALTER TABLE restaurant.restaurant_config
  ADD COLUMN IF NOT EXISTS whatsapp_handoff_enabled BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN restaurant.restaurant_config.whatsapp_handoff_enabled IS
  'Desligado por padrão de propósito — ver a decisão 2 na migration 20260901_whatsapp_handoff.sql. Ligar só depois de calibrar o gatilho contra conversa real (scripts/calibrate-whatsapp-handoff.js).';
