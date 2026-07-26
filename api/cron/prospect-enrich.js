'use strict';

/**
 * Cron de enriquecimento — descobre CNPJ, sócios e dono dos leads.
 *
 * Por que existe: /api/prospect-enrich já fazia o trabalho, mas era POST-only e
 * não estava agendado em lugar nenhum — disparo manual que ninguém dispara. O
 * resultado apareceu no banco em 25/07/2026: de 4.669 leads, ZERO tinham CNPJ e
 * ZERO tinham sócios. Sem isso a Olímpia só sabe pedir "quem decide aí?" quando
 * cai num porteiro (atendente/bot de pedidos), e a conversa morre — eram 16
 * leads ativos travados exatamente nesse ponto.
 *
 * Com o sócio conhecido, o pedido vira "o Roberto está?", que é a diferença
 * entre ser transferido e ser barrado.
 *
 * ORDEM IMPORTA: enrichPending() varre do mais ANTIGO pro mais novo, o que
 * gastaria semanas nos 4.311 leads frios antes de chegar nos que estão
 * conversando AGORA. Aqui a fila é invertida por temperatura — quem está em
 * conversa primeiro, porque é onde o nome do dono muda o próximo turno.
 *
 * Não faz require do handler irmão (api/prospect-enrich.js) de propósito: a NFT
 * da Vercel derruba a função importadora sem erro de build (incidente do
 * /api/demo, jun/2026). Chama a lib direto, igual o handler faz.
 */

const { createSecureLogger } = require('../_lib/secure-logger');
const { bearerEquals } = require('../_lib/secure-compare');
const { supabaseAdmin } = require('../_lib/supabase');
const { enrichLead } = require('../_lib/prospecting/prospect-enrich');

const logger = createSecureLogger('CronProspectEnrich');

/** Quem está em conversa vale mais que quem nunca respondeu. */
const QUENTES = ['conversando', 'pausada', 'handoff', 'agendando'];

/** Teto por execução: o enrich faz I/O por lead e a função morre em 60s. */
const LIMITE_PADRAO = 15;

/**
 * Fila de enriquecimento: quentes primeiro (mais recentes na frente, que são os
 * que a Olímpia toca em seguida), frios depois pra queimar o backlog devagar.
 */
async function proximosLeads(limite) {
  const alvo = [];

  const { data: quentes, error: e1 } = await supabaseAdmin
    .from('prospect_leads')
    .select('id')
    .is('cnpj', null)
    .in('prospect_state', QUENTES)
    .order('last_in_at', { ascending: false, nullsFirst: false })
    .limit(limite);
  if (e1) throw new Error(`fila quente: ${e1.message}`);
  alvo.push(...(quentes || []).map((l) => l.id));

  if (alvo.length < limite) {
    const { data: frios, error: e2 } = await supabaseAdmin
      .from('prospect_leads')
      .select('id')
      .is('cnpj', null)
      .not('prospect_state', 'in', `(${QUENTES.join(',')})`)
      .order('created_at', { ascending: true })
      .limit(limite - alvo.length);
    if (e2) throw new Error(`fila fria: ${e2.message}`);
    alvo.push(...(frios || []).map((l) => l.id));
  }
  return alvo;
}

module.exports = async (req, res) => {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    logger.error('CRON_SECRET não configurado');
    return res.status(500).json({ success: false, error: 'Not configured' });
  }
  if (!bearerEquals(req.headers.authorization, secret)) {
    return res.status(401).json({ success: false, error: 'Authentication required' });
  }

  const limite = Math.min(Math.max(parseInt(req.query?.limit, 10) || LIMITE_PADRAO, 1), 30);
  const resumo = { processados: 0, enriquecidos: 0, sem_cnpj: 0, pulados: 0, erros: 0 };

  try {
    const ids = await proximosLeads(limite);
    for (const id of ids) {
      try {
        const r = await enrichLead(id, {});
        resumo.processados++;
        if (r.skipped) resumo.pulados++;
        else if (r.enrich_status && r.enrich_status.cnpj === 'ok') resumo.enriquecidos++;
        else resumo.sem_cnpj++;
      } catch (e) {
        // Um lead problemático não pode abortar o lote — o próximo tick o pega
        // de novo (ele continua com cnpj null, então volta pra fila sozinho).
        resumo.erros++;
        logger.warn('enrich falhou num lead', { error: String(e.message).slice(0, 120) });
      }
    }
    logger.info('cron de enriquecimento concluído', resumo);
    return res.status(200).json({ success: true, data: resumo });
  } catch (e) {
    logger.error('cron de enriquecimento falhou', { error: e.message });
    return res.status(500).json({ success: false, error: e.message });
  }
};

module.exports.proximosLeads = proximosLeads;
module.exports.QUENTES = QUENTES;
