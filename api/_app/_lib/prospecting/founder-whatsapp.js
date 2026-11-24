'use strict';

/**
 * Toque do fundador por WhatsApp — camada pura (Fase 2).
 *
 * Templates: racha_fundador_intro e racha_fundador_followup, Marketing/pt_BR,
 * duas variáveis cada, na WABA 25687973367501862 (a que é dona do número
 * +55 21 2391-4417). Enquanto não estiverem APROVADOS lá, a fase de WhatsApp
 * fica desligada por `cron_config.prospect-founder-whatsapp` — o envio falharia
 * com (#132001) a cada rodada.
 *
 * A DECISÃO CENTRAL AQUI É QUAL CANAL, NÃO QUAL TEXTO. Se o WhatsApp fosse um
 * cron paralelo ao de e-mail, um lead em handoff COM endereço receberia
 * proposta por e-mail E intro por WhatsApp — o mesmo contato duplicado que
 * quase aconteceu com o Dinho's em 09/08. Aqui é um canal por lead, decidido
 * por dado que já existe:
 *
 *   tem prospect_email  → e-mail (canal mais rico: leva a proposta
 *                         personalizada, não tem janela de 24h, sobrevive a
 *                         encaminhamento interno)
 *   só tem telefone     → WhatsApp
 *
 * JANELA DE 24H: dentro dela vai texto livre (a mesma copy do founderClose, já
 * corrigida e lintada); fora, só o template aprovado. Nunca texto livre fora da
 * janela — é o que a Meta bloqueia e o que derruba a qualidade do número.
 *
 * PURO: sem I/O. Quem entrega é o cron.
 */

const { getProfile } = require('./prospect-product');
const { assertOutbound } = require('./claim-linter');
const { nomeDaCasa } = require('./nome-da-casa');
const { ultimoMarcadorMs, ultimoInboundMs, houveInboundApos } = require('./historico-ts');

/** Marcadores. Mesma estratégia do e-mail: idempotência por histórico. */
const INTRO_MARKER = '📲 intro do fundador enviada no WhatsApp';
const FOLLOWUP_MARKER = '📲 follow-up do fundador enviado no WhatsApp';

const TEMPLATE_INTRO = process.env.PROSPECTING_TPL_FUNDADOR_INTRO || 'racha_fundador_intro';
const TEMPLATE_FOLLOWUP = process.env.PROSPECTING_TPL_FUNDADOR_FOLLOWUP || 'racha_fundador_followup';
const TEMPLATE_LANG = process.env.PROSPECTING_TPL_LANG || 'pt_BR';

/** Espera antes do follow-up por WhatsApp. Mesma lógica do e-mail. */
const FOLLOWUP_ESPERA_MS = 4 * 24 * 60 * 60 * 1000;

/** Janela de mensagem livre da Meta. */
const JANELA_24H_MS = 24 * 60 * 60 * 1000;

/**
 * PURO: por onde o fundador fala com este lead.
 *
 * E-mail ganha quando existe, e não é preferência estética: ele carrega a
 * proposta personalizada, não tem janela, e sobrevive ao encaminhamento interno
 * que gerência faz. WhatsApp é o canal de quem não deixou endereço.
 *
 * @returns {'email'|'whatsapp'|null}
 */
function canalDoFundador(lead) {
  if (!lead) return null;
  if (lead.prospect_email) return 'email';
  if (lead.whatsapp_phone) return 'whatsapp';
  return null;
}


/** Primeiro nome utilizável, ou null. Mesma régua do compositor de e-mail. */
function primeiroNome(valor) {
  if (!valor) return null;
  const limpo = String(valor).trim().split(/\s+/)[0];
  return limpo && /^[A-Za-zÀ-ÿ]{2,}$/.test(limpo) ? limpo : null;
}


/**
 * PURO: o primeiro toque do fundador por WhatsApp está devido?
 *
 * @returns {{ devido: boolean, motivo: string, janelaAberta?: boolean }}
 */
function introDevida({ lead, historico = [], nowMs } = {}) {
  if (canalDoFundador(lead) !== 'whatsapp') {
    return { devido: false, motivo: 'canal_nao_e_whatsapp' };
  }
  // Sem nome da casa não há {{2}} honesto, e a lição de 10/08 é explícita:
  // campo que alimenta mensagem de produção nunca recebe placeholder inventado.
  if (!lead.name || !String(lead.name).trim()) {
    return { devido: false, motivo: 'lead_sem_nome' };
  }
  if (ultimoMarcadorMs(historico, INTRO_MARKER) !== null) {
    return { devido: false, motivo: 'intro_ja_enviada' };
  }
  const janelaAberta = janelaAbertaEm(historico, nowMs);
  return { devido: true, motivo: 'handoff_sem_toque_do_fundador', janelaAberta };
}

/** PURO: a janela de 24h está aberta agora? */
function janelaAbertaEm(historico, nowMs) {
  const ultimo = ultimoInboundMs(historico);
  return ultimo !== null && nowMs - ultimo < JANELA_24H_MS;
}

/**
 * PURO: follow-up por WhatsApp está devido?
 *
 * Mesmas três defesas do follow-up por e-mail, e uma a mais: aqui o inbound É
 * visível ao sistema (chega pelo webhook), então "lead respondeu" é um fato
 * observado, não uma suposição. É o único canal onde o silêncio é confiável.
 */
function followupDevido({ historico = [], nowMs, esperaMs = FOLLOWUP_ESPERA_MS } = {}) {
  const introMs = ultimoMarcadorMs(historico, INTRO_MARKER);
  if (introMs === null) return { devido: false, motivo: 'intro_nunca_enviada' };
  if (ultimoMarcadorMs(historico, FOLLOWUP_MARKER) !== null) {
    return { devido: false, motivo: 'followup_ja_enviado' };
  }
  const respondeu = houveInboundApos(historico, introMs);
  if (respondeu) return { devido: false, motivo: 'lead_respondeu' };
  if (nowMs - introMs < esperaMs) return { devido: false, motivo: 'cedo_demais' };
  return { devido: true, motivo: 'silencio_apos_intro' };
}

/**
 * PURO: parâmetros do template, na ordem {{1}}, {{2}}.
 *
 * {{1}} cai em "tudo bem" quando não se sabe o nome — o template abre com
 * "Oi {{1}}!", então isso vira "Oi tudo bem!", que é saudação natural em pt-BR.
 * Variável vazia a Meta rejeita, e "Oi !" seria pior que genérico.
 * {{2}} é o nome da casa e NUNCA tem fallback: sem ele a intro não sai.
 */
function parametrosTemplate(lead) {
  // Nome FALÁVEL: o template diz "pra vocês do {{2}}", e o name cru do Google
  // ("Massa na Caveira - Tucuruvi (ZN) - Pizza Bar") faria a mensagem soar como
  // robô lendo linha de banco.
  const casa = nomeDaCasa(lead && lead.name);
  if (!casa) return null;
  return [primeiroNome(lead.owner_name) || 'tudo bem', casa];
}

/**
 * PURO: o texto livre usado DENTRO da janela de 24h.
 *
 * Reusa o founderClose do perfil do produto — a mesma copy corrigida em 07/08,
 * já coberta pelo claim-linter. Duas cópias da mensagem do fundador seria
 * exatamente o defeito que gerou o incidente da gorjeta.
 */
function textoLivreDoFundador(lead, { founderName } = {}) {
  const perfil = getProfile();
  const ownerName = primeiroNome(lead && lead.owner_name);
  const texto = perfil.founderClose({
    founderName: founderName || process.env.PROSPECTING_FOUNDER_NAME || 'Stefano',
    ownerName,
  });
  assertOutbound(texto);
  return texto;
}

/** Eventos gravados após o envio (o que a idempotência procura). */
function eventoDeIntro(via) {
  return `${INTRO_MARKER}: ${via}`;
}
function eventoDeFollowup(via) {
  return `${FOLLOWUP_MARKER}: ${via}`;
}

module.exports = {
  canalDoFundador,
  introDevida,
  followupDevido,
  janelaAbertaEm,
  parametrosTemplate,
  textoLivreDoFundador,
  eventoDeIntro,
  eventoDeFollowup,
  INTRO_MARKER,
  FOLLOWUP_MARKER,
  TEMPLATE_INTRO,
  TEMPLATE_FOLLOWUP,
  TEMPLATE_LANG,
  FOLLOWUP_ESPERA_MS,
  JANELA_24H_MS,
};
