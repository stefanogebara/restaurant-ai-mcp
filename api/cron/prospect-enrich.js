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
const { enrichLead, ENRICH_COOLDOWN_MS } = require('../_lib/prospecting/prospect-enrich');
const { cacarCelularPendentes } = require('../_lib/prospecting/prospect-celular');
const { logCronRun, logCronError } = require('../_lib/cron-tracker');
const { isCronEnabled } = require('../_lib/cron-config');

const logger = createSecureLogger('CronProspectEnrich');

/** Quem está em conversa vale mais que quem nunca respondeu. */
const QUENTES = ['conversando', 'pausada', 'handoff', 'agendando'];

/** Teto por execução: o enrich faz I/O por lead e a função morre em 60s. */
const LIMITE_PADRAO = 15;

/**
 * Fila de enriquecimento: quentes primeiro (mais recentes na frente, que são os
 * que a Olímpia toca em seguida), frios depois pra queimar o backlog devagar.
 */
/**
 * Predicado "trabalhável AGORA", aplicado NA CONSULTA e não só no enrichLead.
 *
 * POR QUE EXISTE (23/08/2026): sem ele o cron ficou moendo em falso. Todo
 * `cron_runs` registrava `processados: 15, pulados: 15, enriquecidos: 0` — de
 * hora em hora, e a base inteira tinha UM lead com CNPJ.
 *
 * O laço: a seleção é `cnpj is null`, e o skip por cooldown devolve ANTES de
 * gravar qualquer coisa. Lead que o enrich não consegue resolver continua com
 * `cnpj` nulo, continua no topo da ordenação, e volta na hora seguinte. Quando
 * o cooldown de 7 dias vence ele é tentado, falha de novo, regrava
 * `attempted_at` e se rebloqueia — ocupando a mesma vaga para sempre.
 *
 * É a MESMA forma do defeito da pontuação (12–13/08): ordenação estável +
 * seleção que só muda se a linha for escrita. A lição daquele dia mandava
 * varrer o repositório atrás de outra consulta com esta forma; esta é ela.
 *
 * Espelha `enrichLead`: lá só pula quando `cnpj === 'missing'` E dentro da
 * janela. As três cláusulas cobrem os demais casos — status diferente de
 * missing, nunca tentado (enrich_status nulo faz o ->> virar null), e
 * tentativa vencida. Comparação de texto porque `attempted_at` é gravado com
 * `toISOString()`: formato fixo em UTC, onde ordem lexicográfica é ordem
 * cronológica.
 */
function filtroTrabalhavel() {
  const corte = new Date(Date.now() - ENRICH_COOLDOWN_MS).toISOString();
  return `enrich_status->>cnpj.not.eq.missing,`
    + `enrich_status->>attempted_at.is.null,`
    + `enrich_status->>attempted_at.lt.${corte}`;
}

async function proximosLeads(limite) {
  const alvo = [];
  const trabalhavel = filtroTrabalhavel();

  const { data: quentes, error: e1 } = await supabaseAdmin
    .from('prospect_leads')
    .select('id')
    .is('cnpj', null)
    .in('prospect_state', QUENTES)
    .or(trabalhavel)
    .order('last_in_at', { ascending: false, nullsFirst: false })
    .limit(limite);
  if (e1) throw new Error(`fila quente: ${e1.message}`);
  alvo.push(...(quentes || []).map((l) => l.id));

  // A fila fria só era alcançada quando a quente devolvia menos que o limite —
  // o que NUNCA acontecia: 879 quentes contra um lote de 15. Com os bloqueados
  // fora da consulta a quente agora esvazia de verdade, e os 3808 frios
  // deixam de ser inalcançáveis por construção.
  if (alvo.length < limite) {
    const { data: frios, error: e2 } = await supabaseAdmin
      .from('prospect_leads')
      .select('id')
      .is('cnpj', null)
      .not('prospect_state', 'in', `(${QUENTES.join(',')})`)
      .or(trabalhavel)
      .order('created_at', { ascending: true })
      .limit(limite - alvo.length);
    if (e2) throw new Error(`fila fria: ${e2.message}`);
    alvo.push(...(frios || []).map((l) => l.id));
  }
  return alvo;
}

/**
 * Leitor de página para a caça ao celular. Injetado (e não importado dentro do
 * módulo) para que `prospect-celular.js` continue testável sem rede e sem chave.
 *
 * Usa o mesmo Scrapingdog que o enrich de CNPJ já usa: site de restaurante é
 * cheio de anti-bot e construtor de site (Wix, Linktree), e `dynamic=true`
 * executa o JS — sem isso o botão flutuante de WhatsApp, que é injetado por
 * script, simplesmente não está no HTML.
 */
async function lerPaginaScrapingdog(alvo) {
  const key = process.env.SCRAPINGDOG_API_KEY;
  if (!key) return '';
  const url = `https://api.scrapingdog.com/scrape?api_key=${key}&dynamic=true&url=${encodeURIComponent(alvo)}`;
  const resp = await fetch(url);
  if (!resp.ok) return '';
  return resp.text();
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

  // INTERRUPTOR DE OPS — acrescentado em 26/08/2026, e a razão importa.
  //
  // A caça ao celular entrou neste cron e, na primeira noite, voltou
  // `sem_html: 8` de 8 em SEIS rodadas seguidas: o scrape não abria uma página
  // sequer. O estrago não é só a raspagem paga desperdiçada — cada rodada
  // CARIMBA os 8 leads como tentados e os joga em 7 dias de cooldown. Em seis
  // horas foram 48 restaurantes bons marcados como "já tentei" sem que ninguém
  // tivesse tentado de verdade.
  //
  // Aí a descoberta: este era um dos POUCOS crons sem interruptor. Não havia
  // como parar a sangria sem um deploy — e um deploy leva ~20 min, durante os
  // quais ele roda de novo. Todo cron que gasta dinheiro ou marca estado
  // precisa poder ser desligado por linha de banco.
  //
  // NÃO barra `?dry=1` de propósito (lição de 09/08): o modo de inspeção não
  // pode ser bloqueado pelo interruptor que ele existe para validar.
  const dry = !!(req.query && (req.query.dry === '1' || req.query.dry === 'true'));
  if (!dry && !(await isCronEnabled('prospect-enrich'))) {
    logger.warn('prospect-enrich desligado por ops, pulando rodada');
    return res.status(200).json({ success: true, skipped: 'disabled_by_ops' });
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
    // Lote inteiro pulado é a ASSINATURA da fome: nada foi gravado, logo a
    // consulta da próxima hora traz as MESMAS linhas. Foi assim que este cron
    // moeu em falso de hora em hora sem ninguém ver — "processados: 15,
    // pulados: 15" é indistinguível de uma rodada saudável se ninguém disser
    // que é anormal. Só dispara quando NADA foi enriquecido, então é barato.
    if (ids.length && resumo.enriquecidos === 0 && resumo.pulados === ids.length) {
      logger.error(
        `enriquecimento travado: ${resumo.pulados}/${ids.length} do lote pulados e nada gravado — `
        + 'a próxima rodada relerá as MESMAS linhas. Ver filtroTrabalhavel().');
    }
    // ---- 2ª etapa: caçar celular no site ------------------------------------
    //
    // POR QUE MORA AQUI e não num cron próprio: a regra de custo do projeto
    // manda não criar cron novo quando um horário já existe, e este já é uma
    // varredura horária de enriquecimento. O trabalho é internamente limitado
    // (8 leads por rodada) e o orçamento de 60s é compartilhado.
    //
    // Isolada em try/catch próprio: quando chega aqui o trabalho de CNPJ JÁ
    // gravou, e uma falha na caça não pode apagar esse resultado nem o
    // logCronRun. Mesma forma da varredura de abandonadas no score-outcomes.
    try {
      resumo.celular = await cacarCelularPendentes({ lerPagina: lerPaginaScrapingdog });
    } catch (e) {
      logger.error('caça ao celular falhou (o enriquecimento desta rodada segue válido):', e.message);
      resumo.celular = { erro: String(e.message).slice(0, 120) };
    }

    logger.info('cron de enriquecimento concluído', resumo);
    // Sem isto o job não aparece em cron_runs e o vigia o dá como never_run
    // para sempre — registro sem batimento é decoração.
    await logCronRun('prospect-enrich', resumo);
    return res.status(200).json({ success: true, data: resumo });
  } catch (e) {
    logger.error('cron de enriquecimento falhou', { error: e.message });
    // logCronError e não logCronRun: grava ran_at (conta como batimento, então
    // o job não vira stale por estar quebrado) E marca meta.status='error', que
    // é o que checkCronHealth conta em errors_14d.
    await logCronError('prospect-enrich', e);
    return res.status(500).json({ success: false, error: e.message });
  }
};

// Exportada para teste: a seleção é onde mora o defeito de fome, e testá-la
// pelo handler exigiria simular request/response e o laço de enriquecimento.
module.exports.proximosLeads = proximosLeads;
module.exports.QUENTES = QUENTES;
module.exports.lerPaginaScrapingdog = lerPaginaScrapingdog;
