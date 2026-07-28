-- Item 4 do plano zero-toque (28/jul/2026): provisionamento de número WhatsApp.
--
-- O roteamento por número dedicado JÁ existe: message-processor resolve o
-- restaurante por restaurant_registry.whatsapp_phone_number_id (registry
-- CENTRAL — em produção pode ser outro projeto Supabase, e a coluna lá já
-- existe desde a migração 20260412). O que não existia era o caminho de
-- ATIVAÇÃO: como um número entra na WABA da plataforma e chega àquela coluna
-- sem o fundador tocar em nada.
--
-- Decisão de arquitetura: o ESTADO da jornada de provisionamento mora aqui,
-- no restaurant_config do próprio restaurante (projeto principal) — é estado
-- de tenant, não de roteamento. Só o ponteiro final (phone_number_id) é
-- copiado pro registry central quando o registro na Cloud API completa.
-- Meio-provisionado nunca entra no roteamento.
--
-- Formato do JSONB:
--   { estado, modo, cc, numero_e164, metodo, phone_number_id, pin, erro,
--     atualizado_em }
-- estados: aguardando_codigo → ativo | erro
-- modos:   numero_proprio (dono registra número que ele controla; o OTP da
--          Meta chega NELE por SMS/voz e ELE digita — zero toque do fundador),
--          mock (demo/staging), twilio (compra automática — fase 2).

ALTER TABLE restaurant.restaurant_config
  ADD COLUMN IF NOT EXISTS whatsapp_provisioning JSONB;

COMMENT ON COLUMN restaurant.restaurant_config.whatsapp_provisioning IS
  'Estado da máquina de provisionamento do número WhatsApp (migrations/20260728_whatsapp_provisioning.sql). O roteamento lê restaurant_registry.whatsapp_phone_number_id no registry central.';
