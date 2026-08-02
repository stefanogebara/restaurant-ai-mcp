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
-- APLICADA em 01/08/2026 — e não em 29/07 como este cabeçalho já afirmou.
-- Aquela versão dizia "Já aplicada em produção (via MCP)" e era FALSA: em
-- 01/08 o PostgREST ainda respondia 42703 para menu_url em produção
-- (ckforlwdhewexyqljsaf) e information_schema não listava a coluna. O MCP
-- daquela sessão apontava para OUTRO projeto — armadilha que reapareceu em
-- 01/08, quando o MCP default da sessão também não era produção (nem tinha a
-- tabela prospect_leads).
--
-- Regra que ficou: antes de qualquer DDL, provar a identidade do banco com um
-- marcador conferido de antemão (contagem de prospect_leads, nº de colunas de
-- restaurant_config), nunca confiar no projeto que a ferramenta assume. E
-- verificar DEPOIS pelo efeito observável, não pelo {"success":true} da tool.
--
-- Verificação desta: information_schema lista menu_url, PostgREST responde 200
-- a select=menu_url (era 42703), e o payload de api/onboarding/complete.js
-- voltou a gravar na coluna — só o DDL não restauraria o fluxo.
ALTER TABLE restaurant.restaurant_config
  ADD COLUMN IF NOT EXISTS menu_url TEXT;

COMMENT ON COLUMN restaurant.restaurant_config.menu_url IS
  'Link do cardapio informado pelo dono no onboarding. Aceita pagina ou PDF. Vale sozinho, sem website: muito restaurante so tem um PDF no Drive. Alimenta o enricher que ensina precos a IA.';
