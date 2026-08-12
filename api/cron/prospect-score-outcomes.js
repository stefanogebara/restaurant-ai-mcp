'use strict';

/**
 * Cron: prospect-score-outcomes — rate finished conversations (Phase 5).
 *
 * Picks terminal-state outcomes that still lack a quality_score, reconstructs the
 * transcript, and asks Haiku for a 1–5 score + theme tags (parseScoreText, anti-
 * garbage). Dashboard INPUT only — never mutates Olímpia's prompt/strategy.
 *
 * Low frequency (daily): a terminal outcome is a rare event and scoring isn't
 * time-sensitive, so this respects the cron cost rule. Bounded per run.
 */

const { createSecureLogger } = require('../_lib/secure-logger');
const { bearerEquals } = require('../_lib/secure-compare');
const { isCronEnabled } = require('../_lib/cron-config');
const { logCronRun } = require('../_lib/cron-tracker');
const { selectUnscoredOutcomes, updateOutcomeScore, loadHistory } = require('../_lib/prospecting/prospect-store');
const { transcriptFromHistory, scoreOutcome } = require('../_lib/prospecting/prospect-reflect');

const logger = createSecureLogger('CronProspectScore');
const MAX_PER_RUN = 25;

// ---- Varredura de conversas abandonadas -------------------------------------
//
// POR QUE MORA AQUI e não num cron próprio: é varredura diária, e a regra de
// custo do projeto manda não criar cron novo quando um diário já existe. Este
// já roda 05:00 UTC, já é um sweep, e o trabalho é internamente limitado.
//
// O QUE RESOLVE (12/08/2026): 27 conversas com a última palavra do LEAD, entre
// 28 e 37 dias sem resposta. Fora da janela de 24h da Meta o texto livre não é
// entregue, então nunca mais seriam respondidas — mas seguiam ativas, mantendo
// o alerta de "esperando resposta" vermelho para sempre e escondendo a única
// casa que dava pra responder na hora.
const SWITCH_ARQUIVO = 'prospect-arquivo-abandonadas';
// Teto de ESCRITA (quantas arquiva por rodada), não de leitura. Ver
// MAX_ARQUIVO_CANDIDATOS: limitar a leitura criava fome.
const MAX_ARQUIVO_POR_RODADA = 50;
// Teto de LEITURA, alto de propósito.
//
// A primeira versão lia 50 candidatos ordenados por last_in_at ASC e decidia um
// a um. O dry-run em produção devolveu "candidatos: 50, arquivadas: 0" e foi aí
// que o defeito apareceu: leads antigos que JÁ foram respondidos nunca mudam de
// estado, então ocupariam as mesmas 50 vagas todo dia, para sempre, e uma
// conversa de fato abandonada jamais chegaria a ser avaliada. A varredura
// nasceria morta — sem erro, sem log, sem sintoma.
const MAX_ARQUIVO_CANDIDATOS = 400;

/**
 * Arquiva o que o lead falou por último e ninguém respondeu há 30+ dias.
 *
 * 'pausada', NUNCA 'optout': opt-out é registro LGPD de um pedido DA PESSOA, e
 * estas casas não recusaram nada — foram esquecidas por falha nossa. Poluir a
 * supressão com faxina interna corrompe o único registro que precisa ser
 * confiável quando alguém reclamar. 'pausada' é silencioso e reversível pelo
 * botão "Reativar" do console.
 */
async function varrerAbandonadas(dry) {
  const {
    selectArquivaveis, ultimaSaidaPorLead, patchLead, recordEvent,
  } = require('../_lib/prospecting/prospect-store');
  const { elegivelParaArquivar, ARQUIVO_DIAS_PADRAO } = require('../_lib/prospecting/prospect-state');

  // Interruptor próprio. É a única rotina que MUTA lead sozinha por decurso de
  // prazo; se ela errar, some conversa da fila e ninguém percebe na hora.
  // Não barra o dry-run, pela lição de 09/08: o modo de inspeção não pode ser
  // bloqueado pelo interruptor que ele existe para validar.
  const desligado = !(await isCronEnabled(SWITCH_ARQUIVO));
  if (desligado && !dry) return { total: 0, motivo: 'desligado_por_ops' };

  const nowIso = new Date().toISOString();
  const nowMs = Date.parse(nowIso);
  const candidatos = await selectArquivaveis(nowIso, ARQUIVO_DIAS_PADRAO, MAX_ARQUIVO_CANDIDATOS);

  // "Quem falou por último" numa consulta só, para TODOS os candidatos. Era um
  // loadHistory por lead — N+1 que forçava um teto de leitura baixo, e o teto
  // baixo era o que causava a fome descrita em MAX_ARQUIVO_CANDIDATOS.
  const ultimaSaida = await ultimaSaidaPorLead(candidatos.map((l) => l.id));

  const feitas = [];
  let avaliados = 0;
  for (const lead of candidatos) {
    if (feitas.length >= MAX_ARQUIVO_POR_RODADA) break;
    avaliados += 1;

    const entradaMs = Date.parse(lead.last_in_at);
    const saidaMs = ultimaSaida.get(lead.id) || null;
    // Respondemos depois da última fala dele? Então nós falamos por último.
    const nosFalamosDepois = saidaMs !== null && saidaMs > entradaMs;

    const gate = elegivelParaArquivar({
      state: lead.prospect_state,
      ultimaDirecao: nosFalamosDepois ? 'out' : 'in',
      ultimaMs: entradaMs,
      nowMs,
      replyApos: lead.reply_apos,
      retornoEm: lead.retorno_em,
      snoozedUntil: lead.snoozed_until,
      reuniaoAt: lead.reuniao_at,
      dias: ARQUIVO_DIAS_PADRAO,
    });
    if (!gate.arquivar) continue;

    const dias = Math.round((nowMs - entradaMs) / 864e5);
    if (dry) { feitas.push({ lead: lead.id, nome: lead.name, dias, dry: true }); continue; }

    await patchLead(lead.id, { prospect_state: 'pausada' });
    await recordEvent(lead.id,
      `📦 conversa arquivada automaticamente: ${dias} dias sem resposta nossa, fora da janela `
      + 'de 24h do WhatsApp. Arquivada como pausada, NÃO como opt-out — a casa não recusou nada. '
      + 'Reversível pelo botão Reativar.');
    feitas.push({ lead: lead.id, nome: lead.name, dias });
  }

  if (feitas.length) {
    logger.info(`arquivadas ${feitas.length} conversas abandonadas${dry ? ' (dry-run)' : ''}`);
  }
  return {
    total: dry ? 0 : feitas.length,
    candidatos: candidatos.length,
    // `avaliados` separado de `candidatos` de propósito: se um dia forem
    // iguais ao teto de leitura, é sinal de que a varredura pode estar
    // passando fome de novo — foi exatamente o sintoma que o primeiro
    // dry-run mostrou ("candidatos: 50" batendo no teto).
    avaliados,
    teto_leitura: MAX_ARQUIVO_CANDIDATOS,
    a_arquivar: feitas.length,
    interruptorDesligado: desligado,
    leads: feitas.slice(0, 10),
  };
}

module.exports = async (req, res) => {
  const secret = process.env.CRON_SECRET;
  if (!secret) return res.status(500).json({ success: false, error: 'Cron not configured' });
  if (!bearerEquals(req.headers.authorization, secret)) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  // Prévia sem efeito: monta a lista de arquivamento e devolve sem gravar.
  const dry = !!(req.query && (req.query.dry === '1' || req.query.dry === 'true'));
  if (!dry && !(await isCronEnabled('prospect-score-outcomes'))) {
    return res.status(200).json({ success: true, skipped: 'disabled_by_ops' });
  }
  if (dry) {
    // Dry-run só inspeciona a varredura nova; pontuar consome LLM e não é o que
    // se quer prever aqui.
    const previa = await varrerAbandonadas(true);
    return res.status(200).json({ success: true, dry: true, arquivadas: previa });
  }

  let scored = 0; let skipped = 0; let errors = 0;
  try {
    const rows = await selectUnscoredOutcomes(MAX_PER_RUN);
    for (const row of rows) {
      try {
        const history = await loadHistory(row.lead_id, 200);
        const transcript = transcriptFromHistory(history);
        const { quality_score, theme_tags } = await scoreOutcome(transcript);
        if (quality_score == null) { skipped++; continue; } // transient/un-scorable → retry next run
        await updateOutcomeScore(row.id, { quality_score, theme_tags });
        scored++;
      } catch (err) {
        errors++;
        logger.error(`score outcome=${row.id} failed:`, err.message);
      }
    }
    // Isolado em try/catch próprio: quando chega aqui a pontuação JÁ gravou, e
    // uma falha na varredura não pode apagar esse resultado nem o logCronRun.
    let arquivadas = { total: 0 };
    try {
      arquivadas = await varrerAbandonadas(dry);
    } catch (err) {
      logger.error('varredura de abandonadas falhou (pontuação desta rodada segue válida):', err.message);
      arquivadas = { total: 0, erro: err.message };
    }

    await logCronRun('prospect-score-outcomes', { scored, skipped, errors, arquivadas: arquivadas.total });
    return res.status(200).json({ success: true, candidates: rows.length, scored, skipped, errors, arquivadas });
  } catch (err) {
    logger.error('score-outcomes fatal:', err.message);
    await logCronRun('prospect-score-outcomes', { scored, skipped, errors: errors + 1 });
    return res.status(500).json({ success: false, error: 'Scoring failed' });
  }
};
