-- 2026-08-01 — perfil de restaurante gerado por IA: as duas colunas que faltavam
--
-- POR QUE: api/_services/personaGenerator.js:158-165 faz UM update gravando
-- restaurant_profile E profile_generated_at. Nenhuma das duas existia em
-- produção, então a escrita falhava com 42703.
--
-- Consequência a jusante, encontrada na investigação de 01/08: o cron
-- refresh-restaurant-profiles (0 3 * * 1) NUNCA funcionou. O join embutido dele
-- pede restaurant_config.profile_generated_at, recebia 42703, e o handler
-- tratava QUALQUER erro de consulta como "migration pendente" devolvendo
-- success:true. Reportou sucesso a vida inteira sem nunca ter rodado — por isso
-- também nunca apareceu em cron_runs.
--
-- AS DUAS JUNTAS de propósito: são um único UPDATE. Criar só
-- profile_generated_at deixaria o personaGenerator quebrando no mesmo ponto —
-- meia migração que não destrava nada.
--
-- Aditivas e nullable: nenhuma linha existente é reescrita, nada a migrar.
-- restaurant_profile é JSONB porque o payload é o objeto de perfil inteiro
-- (personaGenerator monta profileWithMetadata com generated_at, session_id,
-- intelligence_available e version aninhados).
--
-- APLICADA em produção (ckforlwdhewexyqljsaf) em 2026-08-01, e VERIFICADA:
-- information_schema confirma timestamptz + jsonb nullable, e o cron passou de
-- {"message":"Intelligence data unavailable — migration may be pending"} para
-- {"success":true,"message":"No restaurants to refresh"}.
ALTER TABLE restaurant.restaurant_config
  ADD COLUMN IF NOT EXISTS restaurant_profile   JSONB,
  ADD COLUMN IF NOT EXISTS profile_generated_at TIMESTAMPTZ;

COMMENT ON COLUMN restaurant.restaurant_config.restaurant_profile IS
  'Perfil do restaurante gerado por IA na entrevista de aprendizado (personaGenerator). Objeto completo, com metadados de geracao aninhados. Alimenta a persona do agente de voz e o prompt do Manager AI.';

COMMENT ON COLUMN restaurant.restaurant_config.profile_generated_at IS
  'Quando o restaurant_profile foi gerado. O cron refresh-restaurant-profiles compara com restaurant_intelligence.last_gathered_at para decidir se o perfil ficou velho e precisa ser regerado.';
