'use strict';

/**
 * Despachante de crons — teto de 300s.
 *
 * POR QUE ISTO EXISTE (03/09/2026): o build gastava ~13 min empacotando 191
 * funções serverless, ~3,4s de trace NFT cada. 36 delas eram crons, e o custo
 * de build do projeto era 80,8% da conta de CPU do ciclo. Estes despachantes
 * trocam 36 funções por 3.
 *
 * POR QUE TRÊS E NÃO UM: `maxDuration` é por função. Juntar tudo faria o cron
 * de 60s herdar o teto de 300s de quem precisa dele. O agrupamento é por teto,
 * que é a única coisa que realmente obriga a separação.
 *
 * POR QUE OS HANDLERS VIVEM EM api/_crons/: diretório com `_` não vira função
 * serverless, então dar require neles é seguro. Dar require num handler IRMÃO
 * (dentro de api/cron/) faria a NFT da Vercel remover ESTE arquivo do manifesto
 * em silêncio, sem erro de build, e a rota 404 em produção — foi a causa raiz
 * do /api/demo em jun/2026.
 *
 * O require é PREGUIÇOSO de propósito: a string literal deixa a NFT incluir
 * todos no pacote, mas em execução só o job pedido é carregado. Sem isso, toda
 * rodada pagaria o custo de inicializar 2 módulos para usar um.
 *
 * Cada handler faz a própria checagem de CRON_SECRET; este arquivo não
 * autentica, só roteia. Job desconhecido devolve 400 — e não 404 — para que
 * "rota existe, job errado" nunca se confunda com "função sumiu do deploy".
 */

const JOBS = {
  'compile-wiki': (req, res) => require('../_crons/compile-wiki')(req, res),
  'prospect-score-outcomes': (req, res) => require('../_crons/prospect-score-outcomes')(req, res),
};

module.exports = async (req, res) => {
  const job = req.query && req.query.job;
  if (!job || !Object.prototype.hasOwnProperty.call(JOBS, job)) {
    return res.status(400).json({
      success: false,
      error: 'parâmetro `job` ausente ou desconhecido',
      jobs: Object.keys(JOBS),
    });
  }
  return JOBS[job](req, res);
};

module.exports.JOBS_DISPONIVEIS = Object.keys(JOBS);
