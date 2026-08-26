'use strict';

/**
 * Caça ao celular no site do restaurante — o destravamento de 26/08/2026.
 *
 * O PROBLEMA, medido em produção: o funil parou por ALCANÇABILIDADE, não por
 * qualidade. 1.392 casas passam o filtro de qualidade e 1.389 têm SÓ FIXO.
 * WhatsApp não existe em fixo, então essas 1.389 nunca receberiam intro — a
 * rodada de 26/08 às 13:10 veio `candidates: 0` e os 3 leads restantes com
 * celular eram supermercado, hortifruti e sacolão (barrados pelo filtro de ICP,
 * corretamente). O poço estava seco de verdade.
 *
 * A SAÍDA: 847 dessas 1.389 têm site, e restaurante põe o WhatsApp no próprio
 * site — quase sempre como botão flutuante `wa.me`. O número está lá, público,
 * esperando.
 *
 * POR QUE UM MÓDULO SEPARADO, e não mais uma etapa dentro do `enrichLead`:
 * aquele fluxo devolve cedo em dois pontos — `lead.cnpj && !force` e o cooldown
 * de CNPJ. As duas condições são sobre CNPJ e não dizem NADA sobre celular. Um
 * lead pode ter CNPJ e não ter celular; outro pode estar em cooldown de CNPJ com
 * um site nunca lido. Pendurar esta caça naqueles portões seria criar uma fila
 * cuja seleção depende de um estado que este trabalho não escreve — que é a
 * assinatura exata da fome de fila que este projeto já teve três vezes
 * (arquivamento 12/08, pontuação 13/08, enrich 24/08).
 *
 * Roda dentro do cron `prospect-enrich` que já existe de hora em hora. Cron novo
 * seria violar a regra de custo do projeto por nada.
 */

const { supabaseAdmin } = require('../supabase');
const { createSecureLogger } = require('../secure-logger');
const { extrairCelularDoSite, extrairDddBr } = require('./prospect-extract');

const logger = createSecureLogger('ProspectCelular');

// Site lido e sem celular não vira celular sozinho. Sete dias antes de pagar
// outro scrape na mesma página — mesma escala do cooldown de CNPJ.
const COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000;
// Teto por rodada. Cada lead é UM scrape (~2-4s); 8 cabem com folga nos 60s da
// função, junto com o trabalho de CNPJ que roda no mesmo cron.
const LIMITE_PADRAO = 8;

/** Um número já é celular? '+55' + DDD(2) + 9 dígitos = 14 caracteres. */
function jaTemCelular(lead) {
  const n = lead && lead.whatsapp_phone;
  return typeof n === 'string' && /^\+55\d{2}9\d{8}$/.test(n);
}

/**
 * A fila. O filtro de trabalhabilidade é a parte que não pode dar errado:
 * sem ele, os leads que já falharam ocupam as mesmas vagas todo dia, para
 * sempre, e nenhum lead novo chega a ser tentado — sem erro, sem log, sem
 * sintoma. Foi assim que o arquivamento, a pontuação e o enrich morreram.
 *
 * @param {number} limit
 * @returns {Promise<Array>}
 */
async function selecionarSemCelular(limit = LIMITE_PADRAO) {
  const corte = new Date(Date.now() - COOLDOWN_MS).toISOString();
  const { data, error } = await supabaseAdmin
    .from('prospect_leads')
    .select('id, name, website, whatsapp_phone, whatsapp_status, address, city, enrich_status')
    .eq('prospect_state', 'aguardando')
    .is('whatsapp_sent_at', null)
    .not('website', 'is', null)
    // Nunca tentado, ou tentado há mais de 7 dias.
    .or(`enrich_status->>site_wa_at.is.null,enrich_status->>site_wa_at.lt.${corte}`)
    // Maior primeiro: a vaga escassa vai para a casa com mais movimento.
    .order('reviews_count', { ascending: false, nullsFirst: false })
    .limit(Math.min(Math.max(parseInt(limit, 10) || LIMITE_PADRAO, 1), 25));

  if (error) {
    logger.error('selecionarSemCelular falhou:', error.message);
    return [];
  }
  // O filtro de "já tem celular" fica em JS: a máscara PostgREST para isso é
  // frágil (dois formatos gravados, com e sem '+') e um erro nela silenciosamente
  // esvazia a fila. Ler 8 linhas a mais é barato; fila vazia em silêncio não é.
  return (data || []).filter((l) => !jaTemCelular(l));
}

/**
 * Lê o site de UM lead e grava o celular se achar.
 *
 * SEMPRE grava `site_wa_at`, ache ou não. É isso que faz a fila andar: sem o
 * carimbo, a próxima rodada relê exatamente as mesmas páginas.
 *
 * O fixo NÃO se perde — ele mora na coluna `phone`, que este código não toca.
 * `whatsapp_phone` é o canal de envio, e um fixo ali é um canal que não existe.
 *
 * @param {object} lead
 * @param {(alvo: string) => Promise<string>} lerPagina - injetado para teste
 * @returns {Promise<{ok: boolean, numero?: string, fonte?: string, motivo?: string}>}
 */
async function cacarCelular(lead, lerPagina) {
  const carimbo = new Date().toISOString();
  const statusBase = { ...(lead.enrich_status || {}), site_wa_at: carimbo };

  let html = '';
  try {
    html = await lerPagina(lead.website);
  } catch (e) {
    logger.info(`scrape falhou lead=${lead.id}: ${e.message}`);
  }

  const ddd = extrairDddBr(lead.whatsapp_phone || lead.address || lead.city || '');
  const achado = html ? extrairCelularDoSite(html, ddd) : null;

  const patch = achado
    ? {
      whatsapp_phone: achado.numero,
      // 'pending' e não 'found': ainda não sabemos se o número tem WhatsApp.
      // O primeiro envio descobre — o 131026 da Meta marca 'missing' sozinho
      // pelo handler de recibos, e o poço se limpa sem custo de reputação.
      whatsapp_status: 'pending',
      whatsapp_source: `site_${achado.fonte}`,
      enrich_status: { ...statusBase, site_wa: 'ok' },
    }
    : { enrich_status: { ...statusBase, site_wa: 'missing' } };

  const { error } = await supabaseAdmin
    .from('prospect_leads')
    .update(patch)
    .eq('id', lead.id);

  if (error) {
    logger.error(`gravar celular falhou lead=${lead.id}: ${error.message}`);
    return { ok: false, motivo: 'update' };
  }
  if (achado) logger.info(`celular achado no site lead=${lead.id} (${achado.fonte})`);
  return achado
    ? { ok: true, numero: achado.numero, fonte: achado.fonte }
    : { ok: false, motivo: html ? 'sem_numero' : 'sem_html' };
}

/**
 * Um lote. Sequencial de propósito: são chamadas externas pagas e o orçamento
 * de 60s da função é compartilhado com a caça ao CNPJ no mesmo cron.
 *
 * @param {{limit?: number, lerPagina?: Function}} [opts]
 */
async function cacarCelularPendentes(opts = {}) {
  const lerPagina = opts.lerPagina;
  if (typeof lerPagina !== 'function') {
    return { erro: 'lerPagina obrigatório', processados: 0, achados: 0 };
  }

  const leads = await selecionarSemCelular(opts.limit || LIMITE_PADRAO);
  const resumo = { processados: 0, achados: 0, sem_numero: 0, falhas: 0 };

  for (const lead of leads) {
    const r = await cacarCelular(lead, lerPagina);
    resumo.processados++;
    if (r.ok) resumo.achados++;
    else if (r.motivo === 'update') resumo.falhas++;
    else resumo.sem_numero++;
  }

  // Lote inteiro sem achado NÃO é alarme: site sem WhatsApp visível é comum, e
  // o carimbo garante que a fila andou. O alarme seria a fila não andar — e o
  // filtro de trabalhabilidade é o que impede isso.
  return resumo;
}

module.exports = {
  cacarCelular, cacarCelularPendentes, selecionarSemCelular, jaTemCelular,
  COOLDOWN_MS, LIMITE_PADRAO,
};
