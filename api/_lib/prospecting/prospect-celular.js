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
const { foraDoIcp } = require('./lead-qualifica');
const {
  QUALIDADE_MIN_AVALIACOES, QUALIDADE_MAX_AVALIACOES, QUALIDADE_MIN_NOTA,
} = require('./prospect-store');

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
  const pedido = Math.min(Math.max(parseInt(limit, 10) || LIMITE_PADRAO, 1), 25);
  const { data, error } = await supabaseAdmin
    .from('prospect_leads')
    .select('id, name, website, whatsapp_phone, whatsapp_status, address, city, reviews_count, enrich_status')
    .eq('prospect_state', 'aguardando')
    .is('whatsapp_sent_at', null)
    .not('website', 'is', null)
    // MESMA FAIXA DE QUALIDADE DO DISPARO. Sem isto a caça mira quem nunca
    // será alvo — ver o comentário sobre a primeira rodada, logo abaixo.
    .gte('reviews_count', QUALIDADE_MIN_AVALIACOES)
    .lte('reviews_count', QUALIDADE_MAX_AVALIACOES)
    .gte('rating', QUALIDADE_MIN_NOTA)
    // Nunca tentado, ou tentado há mais de 7 dias.
    .or(`enrich_status->>site_wa_at.is.null,enrich_status->>site_wa_at.lt.${corte}`)
    // Maior primeiro DENTRO da faixa: a vaga escassa vai para a casa com mais
    // movimento entre as elegíveis.
    .order('reviews_count', { ascending: false, nullsFirst: false })
    // Lê com folga porque o filtro de ICP abaixo ainda derruba parte do lote.
    .limit(pedido * 4);

  if (error) {
    logger.error('selecionarSemCelular falhou:', error.message);
    return [];
  }
  // Os dois filtros que faltavam, em JS porque `foraDoIcp` é regex sobre nome.
  //
  // A PRIMEIRA RODADA EM PRODUÇÃO (26/08, 0 de 6) NÃO MEDIU A TÁTICA: mediu
  // uma fila apontada para o lado errado. Sem a faixa de qualidade acima, a
  // ordenação `reviews_count DESC` entregou exatamente o topo absoluto da base
  // — Shopping Iguatemi, Morumbi Shopping, Center Norte, Coco Bambu, Mercado
  // Municipal. Shopping tem dezenas de milhares de avaliações, então ganha de
  // todo restaurante e ocupa todas as vagas; e NENHUM deles receberia intro,
  // porque o disparo exige a faixa 120–5000 e o filtro de ICP.
  //
  // Gastar raspagem paga em quem nunca será alvo é pior que não raspar: além
  // do custo, produz um zero que parece veredito sobre a abordagem.
  return (data || [])
    .filter((l) => !jaTemCelular(l))
    .filter((l) => !foraDoIcp(l.name))
    .slice(0, pedido);
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
 * DOIS LEITORES, O GRÁTIS PRIMEIRO (03/09/2026). Antes havia um só, o pago
 * (Scrapingdog), e ele era dependência DURA: sem a chave no ambiente a caça
 * não tentava absolutamente nada e carimbava o lead como 'missing'. Foi
 * exatamente esse o defeito que gastou 752 leads com zero achados — a chave
 * nunca chegou à função em produção, e "não tentei" ficou indistinguível de
 * "tentei e o site não tinha".
 *
 * Agora o leitor direto roda primeiro e o pago só entra quando o direto não
 * rendeu número. Isso domina o desenho antigo nas três pontas:
 *   - sem chave, a caça funciona (degrada para só-direto, não para nada);
 *   - com chave, só se paga pelo site que o fetch grátis não resolveu;
 *   - quem decide escalar é o EXTRATOR, não um palpite sobre "tem JS?" —
 *     "não achei número" é o único sinal que de fato importa.
 *
 * @param {object} lead
 * @param {(alvo: string) => Promise<string>} lerPagina - leitor direto (grátis)
 * @param {(alvo: string) => Promise<string>} [lerPaginaFallback] - leitor pago,
 *   omitido quando não há chave; a caça segue valendo sem ele
 * @returns {Promise<{ok: boolean, numero?: string, fonte?: string, motivo?: string}>}
 */
async function cacarCelular(lead, lerPagina, lerPaginaFallback) {
  const carimbo = new Date().toISOString();
  const statusBase = { ...(lead.enrich_status || {}), site_wa_at: carimbo };

  const ddd = extrairDddBr(lead.whatsapp_phone || lead.address || lead.city || '');

  const tenta = async (ler, rotulo) => {
    if (typeof ler !== 'function') return '';
    try {
      return (await ler(lead.website)) || '';
    } catch (e) {
      logger.info(`scrape ${rotulo} falhou lead=${lead.id}: ${e.message}`);
      return '';
    }
  };

  let html = await tenta(lerPagina, 'direto');
  let achado = html ? extrairCelularDoSite(html, ddd) : null;

  // Escala só quando o grátis não resolveu. `htmlAlgum` guarda se ALGUM leitor
  // conseguiu abrir a página: sem isso, um direto que abriu e não tinha número
  // seguido de um pago que nem rodou viraria 'sem_html', trocando "site sem
  // WhatsApp" por "scrape quebrado" — as duas causas que este arquivo existe
  // para manter separadas.
  let htmlAlgum = !!html;
  if (!achado && typeof lerPaginaFallback === 'function') {
    const html2 = await tenta(lerPaginaFallback, 'fallback');
    if (html2) {
      htmlAlgum = true;
      achado = extrairCelularDoSite(html2, ddd);
    }
  }

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
    : { ok: false, motivo: htmlAlgum ? 'sem_numero' : 'sem_html' };
}

/**
 * Um lote. Sequencial de propósito: são chamadas externas pagas e o orçamento
 * de 60s da função é compartilhado com a caça ao CNPJ no mesmo cron.
 *
 * @param {{limit?: number, lerPagina?: Function, lerPaginaFallback?: Function}} [opts]
 */
async function cacarCelularPendentes(opts = {}) {
  const lerPagina = opts.lerPagina;
  const lerPaginaFallback = opts.lerPaginaFallback;
  if (typeof lerPagina !== 'function') {
    return { erro: 'lerPagina obrigatório', processados: 0, achados: 0 };
  }

  const leads = await selecionarSemCelular(opts.limit || LIMITE_PADRAO);
  // `sem_html` SEPARADO de `sem_numero` — a primeira rodada em produção
  // (26/08, 0 de 6) provou que o balde único não serve para nada: "o site
  // abriu e não tinha WhatsApp" e "o site não abriu" são causas OPOSTAS. A
  // primeira diz que a abordagem é fraca e manda mudar de tática; a segunda
  // diz que o scrape está quebrado e manda consertar. Somadas, não dizem nada,
  // e um zero ambíguo é pior que nenhum número — convida a concluir a errada.
  const resumo = { processados: 0, achados: 0, sem_numero: 0, sem_html: 0, falhas: 0 };

  for (const lead of leads) {
    const r = await cacarCelular(lead, lerPagina, lerPaginaFallback);
    resumo.processados++;
    if (r.ok) resumo.achados++;
    else if (r.motivo === 'update') resumo.falhas++;
    else if (r.motivo === 'sem_html') resumo.sem_html++;
    else resumo.sem_numero++;
  }

  // Lote inteiro sem HTML não é "site sem WhatsApp": é scrape morto. Agora que
  // são dois leitores, o alarme diz QUAIS rodaram — culpar o Scrapingdog quando
  // ele nem estava no caminho foi o erro de camada que custou os cinco dias de
  // 31/08. Zero HTML com os dois ativos é rede/bloqueio; com só o direto ativo,
  // é o esperado para sites com anti-bot e o remédio é a chave.
  if (resumo.processados > 0 && resumo.sem_html === resumo.processados) {
    logger.error(
      `caça ao celular sem HTML em ${resumo.sem_html}/${resumo.processados} do lote `
      + `(leitores ativos: ${lerPaginaFallback ? 'direto+fallback' : 'só direto'}) — `
      + 'isso é scrape quebrado, não site sem WhatsApp.');
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
