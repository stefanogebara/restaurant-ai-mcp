-- O fuso do restaurante não tem mais default.
--
-- O default 'UTC' era um sentinela que parecia resposta: todo caminho que
-- criava um restaurante sem mandar o fuso gravava UTC calado, e as regras de
-- reserva (horário passado, antecedência, horário de funcionamento) rodavam
-- 1 a 3 horas fora. Em 11/11/2026 havia 10 restaurantes assim (Espanha,
-- França, Alemanha, EUA, Brasil), todos criados antes de o onboarding
-- resolver o país; e a prévia de prospecção ainda criava restaurantes sem fuso.
--
-- Sem default, um caminho novo que esqueça o fuso falha no INSERT (NOT NULL)
-- em vez de gravar UTC. Todos os caminhos atuais mandam o fuso explícito:
-- api/onboarding/complete.js, api/demo/index.js,
-- api/_lib/prospecting/prospect-demo.js e scripts/outreach-pipeline.js.
set local lock_timeout = '5s';

ALTER TABLE restaurant.restaurant_config ALTER COLUMN timezone DROP DEFAULT;

DO $$
BEGIN
  IF (SELECT column_default FROM information_schema.columns
      WHERE table_schema = 'restaurant' AND table_name = 'restaurant_config' AND column_name = 'timezone') IS NOT NULL
  THEN
    RAISE EXCEPTION 'restaurant_config.timezone ainda tem default';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'restaurant' AND table_name = 'restaurant_config' AND column_name = 'timezone' AND is_nullable = 'NO')
  THEN
    RAISE EXCEPTION 'restaurant_config.timezone precisa continuar NOT NULL';
  END IF;
END $$;
