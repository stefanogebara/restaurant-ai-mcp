-- Estende o CHECK de pos_provider para incluir 'saipos'.
--
-- Origem: spike `saipos-portao` (docs/intel/BACKLOG.md), executado em
-- 2026-08-25. O critério de sucesso era binário e foi atingido: token emitido
-- e o endpoint de mesa/comanda respondendo array com HTTP 200 contra a loja
-- de teste. A rota de POS brasileiro está viva.
--
-- Até aqui o enum era inteiramente americano — 'square', 'toast', 'clover' —
-- e nenhum deles opera em São Paulo, que é o público-alvo do produto. Esta é
-- a primeira entrada de um POS que atende a base real.
--
-- Só o enum muda. Nenhuma linha existente é tocada: 'saipos' passa a ser
-- aceito, e nada passa a ser recusado. Migration reexecutável.
--
-- POR QUE AQUI E NÃO AO LADO DA IRMÃ: a tabela revenue_records nasceu em
-- database/migrations/20260126_pos_and_revenue.sql, mas `database/` está no
-- .gitignore (rotulado "migration drafts"). Os 20 arquivos de lá que ainda
-- aparecem no git foram adicionados ANTES da regra — git segue rastreando o
-- que já rastreava. Arquivo NOVO naquele diretório não chega ao repositório e
-- some sem aviso. supabase/migrations/ é o diretório vivo (63 arquivos, o mais
-- recente de ontem), então é onde esta migration precisa estar para existir
-- para os outros. O known_gaps do intel.config.json já registra os três
-- diretórios concorrentes; isto é um sintoma dele.

ALTER TABLE revenue_records
  DROP CONSTRAINT IF EXISTS revenue_records_pos_provider_check;

ALTER TABLE revenue_records
  ADD CONSTRAINT revenue_records_pos_provider_check
  CHECK (pos_provider IN ('manual', 'square', 'toast', 'clover', 'saipos', 'other'));

COMMENT ON COLUMN revenue_records.pos_provider IS
  'POS de origem do registro de receita. saipos adicionado em 2026-08-25 '
  'após o spike confirmar que a Order API responde consulta de mesa/comanda '
  '(auth: POST /auth com {idPartner, secret} -> JWT de 48h). Ver '
  'scripts/probe-saipos-sandbox.js.';
