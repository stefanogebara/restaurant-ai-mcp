-- 2026-07-29 — coluna menu_url em restaurant.restaurant_config
--
-- CORRIGE BUG INTRODUZIDO EM 2460482f (mesmo dia): o onboarding passou a
-- enviar `menu_url` no payload de restaurant_config, mas a coluna nunca foi
-- criada. O PostgREST rejeita coluna desconhecida (PGRST204), então o passo
-- final do onboarding falhava — o dono preenchia tudo e não conseguia concluir.
--
-- Coluna dedicada, e não só uma chave em metric_profile, porque o cardápio é a
-- fonte que a IA relê quando o dono troca os preços: precisa ser consultável.
-- Fica ao lado de `website`, que já é coluna pelo mesmo motivo.
--
-- Aditiva e nullable: nenhuma linha existente é reescrita, nada a migrar.
--
-- ATENÇÃO — NÃO ESTÁ APLICADA. Este cabeçalho dizia "Já aplicada em produção em
-- 2026-07-29 (via MCP)". É FALSO, verificado em 01/08/2026: PostgREST responde
-- 42703 para menu_url no projeto de produção (ckforlwdhewexyqljsaf), e
-- information_schema não lista a coluna. O MCP daquela sessão apontava para
-- OUTRO projeto — a mesma armadilha que voltou a aparecer em 01/08, quando o
-- MCP default desta sessão também não era produção (nem tem prospect_leads).
-- Regra que fica: antes de qualquer DDL, provar a identidade do banco com um
-- marcador conhecido (contagem de prospect_leads, nº de colunas de
-- restaurant_config), nunca confiar no projeto que a ferramenta assume.
--
-- Aplicar exige também devolver menu_url ao payload em
-- api/onboarding/complete.js — só a coluna não restaura o fluxo.
ALTER TABLE restaurant.restaurant_config
  ADD COLUMN IF NOT EXISTS menu_url TEXT;

COMMENT ON COLUMN restaurant.restaurant_config.menu_url IS
  'Link do cardapio informado pelo dono no onboarding. Aceita pagina ou PDF. Vale sozinho, sem website: muito restaurante so tem um PDF no Drive. Alimenta o enricher que ensina precos a IA.';
