'use strict';

/**
 * Despachante de crons — teto de 60s.
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
 * rodada pagaria o custo de inicializar 31 módulos para usar um.
 *
 * Cada handler faz a própria checagem de CRON_SECRET; este arquivo não
 * autentica, só roteia. Job desconhecido devolve 400 — e não 404 — para que
 * "rota existe, job errado" nunca se confunda com "função sumiu do deploy".
 */

const JOBS = {
  'analytics-briefing': (req, res) => require('../_crons/analytics-briefing')(req, res),
  'automated-campaigns': (req, res) => require('../_crons/automated-campaigns')(req, res),
  'check-late-reservations': (req, res) => require('../_crons/check-late-reservations')(req, res),
  'cleanup-expired-demos': (req, res) => require('../_crons/cleanup-expired-demos')(req, res),
  'cleanup-waitlist': (req, res) => require('../_crons/cleanup-waitlist')(req, res),
  'cleanup-whatsapp-dedup': (req, res) => require('../_crons/cleanup-whatsapp-dedup')(req, res),
  'compress-memories': (req, res) => require('../_crons/compress-memories')(req, res),
  'demo-nurture': (req, res) => require('../_crons/demo-nurture')(req, res),
  'generate-reflections': (req, res) => require('../_crons/generate-reflections')(req, res),
  'health-alert': (req, res) => require('../_crons/health-alert')(req, res),
  'manager-alerts': (req, res) => require('../_crons/manager-alerts')(req, res),
  'manager-briefings': (req, res) => require('../_crons/manager-briefings')(req, res),
  'monitor-meta-token-expiry': (req, res) => require('../_crons/monitor-meta-token-expiry')(req, res),
  'pre-reservation-upsell': (req, res) => require('../_crons/pre-reservation-upsell')(req, res),
  'proactive-comms': (req, res) => require('../_crons/proactive-comms')(req, res),
  'process-scheduled-ig-posts': (req, res) => require('../_crons/process-scheduled-ig-posts')(req, res),
  'prospect-enrich': (req, res) => require('../_crons/prospect-enrich')(req, res),
  'prospect-founder-email': (req, res) => require('../_crons/prospect-founder-email')(req, res),
  'prospect-handoff-digest': (req, res) => require('../_crons/prospect-handoff-digest')(req, res),
  'refresh-restaurant-profiles': (req, res) => require('../_crons/refresh-restaurant-profiles')(req, res),
  'send-campaigns': (req, res) => require('../_crons/send-campaigns')(req, res),
  'send-feedback': (req, res) => require('../_crons/send-feedback')(req, res),
  'send-reminders': (req, res) => require('../_crons/send-reminders')(req, res),
  'send-surveys': (req, res) => require('../_crons/send-surveys')(req, res),
  'sync-conversation-data': (req, res) => require('../_crons/sync-conversation-data')(req, res),
  'sync-stripe-connect-accounts': (req, res) => require('../_crons/sync-stripe-connect-accounts')(req, res),
  'update-churn-scores': (req, res) => require('../_crons/update-churn-scores')(req, res),
  'validate-conversations': (req, res) => require('../_crons/validate-conversations')(req, res),
  'warm-seo-cache': (req, res) => require('../_crons/warm-seo-cache')(req, res),
  'weekly-report': (req, res) => require('../_crons/weekly-report')(req, res),
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
