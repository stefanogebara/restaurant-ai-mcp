-- O idioma do agente do restaurante não tem mais default.
--
-- O default 'en' fazia o mesmo papel do antigo default 'UTC' do fuso: um
-- caminho que criava restaurante sem mandar o idioma gravava inglês calado.
-- Em 11/11/2026, 9 restaurantes da Espanha, França, Alemanha e Brasil estavam
-- em 'en', todos criados antes de o onboarding resolver o país, e o script de
-- outreach ainda criava demos brasileiros em inglês.
--
-- Sem default, um caminho novo que esqueça o idioma falha no INSERT (NOT NULL).
-- Todos os caminhos atuais mandam o idioma pelo mesmo mapa de país
-- (api/_lib/country-locale.js): onboarding, demo, prévia de prospecção e
-- scripts/outreach-pipeline.js.
set local lock_timeout = '5s';

ALTER TABLE restaurant.restaurant_config ALTER COLUMN agent_language DROP DEFAULT;

DO $$
BEGIN
  IF (SELECT column_default FROM information_schema.columns
      WHERE table_schema = 'restaurant' AND table_name = 'restaurant_config' AND column_name = 'agent_language') IS NOT NULL
  THEN
    RAISE EXCEPTION 'restaurant_config.agent_language ainda tem default';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'restaurant' AND table_name = 'restaurant_config' AND column_name = 'agent_language' AND is_nullable = 'NO')
  THEN
    RAISE EXCEPTION 'restaurant_config.agent_language precisa continuar NOT NULL';
  END IF;
END $$;
