'use strict';

/**
 * Aviso ao fundador quando um lead calado responde — camada pura.
 *
 * POR QUE EXISTE. Lead em 'handoff' é SILENT_STATE: a Olímpia cala a boca
 * porque a bola passou pro fundador. Mas o inbound continua chegando e sendo
 * gravado, e ninguém era avisado. A pessoa respondia e a resposta morria no
 * banco, esperando o fundador abrir o lead por acaso.
 *
 * É o espelho exato do caso Bario Bar (07/08/2026): lá uma promessa de envio
 * morria em silêncio na saída, aqui uma resposta morre em silêncio na entrada.
 * Os dois pela mesma razão: existe estado no banco que nenhum humano observa.
 *
 * DECISÕES:
 *  - **Cooldown, não dedup por mensagem.** Quem responde no WhatsApp costuma
 *    mandar três mensagens seguidas ("oi", "vi sua msg", "como funciona?").
 *    Um aviso por mensagem vira ruído e o fundador aprende a ignorar. Uma
 *    janela de silêncio por lead resolve, e o texto avisa que há mais.
 *  - **Nunca avisa sobre eco de máquina.** URA e resposta automática de
 *    horário comercial não são resposta de gente; avisar sobre isso treina o
 *    fundador a ignorar o alerta, que é como um alarme morre.
 *
 * PURO: sem I/O. Quem decide é aqui; quem entrega é o responder.
 */

/** Marcador do evento de aviso. O cooldown procura por este prefixo. */
const ALERT_MARKER = '🔔 fundador avisado da resposta';

/** Janela padrão entre avisos do MESMO lead. */
const COOLDOWN_MS = 6 * 60 * 60 * 1000;

/** Estados em que o fundador é o dono da conversa e portanto precisa saber. */
const ESTADOS_DO_FUNDADOR = new Set(['handoff', 'agendando', 'agendado']);

/**
 * Eco de máquina: mensagem automática de estabelecimento. Não é gente
 * respondendo, e avisar sobre isso é o caminho mais curto pro fundador
 * ignorar avisos de verdade.
 */
const ECO_DE_MAQUINA = [
  /hor[áa]rio[s]? de (atendimento|funcionamento)/i,
  /agradecemos (seu|o seu) contato/i,
  /(esta|essa) [ée] uma mensagem autom[áa]tica/i,
  /n[ãa]o responda (a )?esta mensagem/i,
  /retornaremos (o )?(seu )?contato/i,
];

function pareceEcoDeMaquina(texto) {
  const t = String(texto || '');
  return ECO_DE_MAQUINA.some((re) => re.test(t));
}

/** Instante do último aviso, lido do histórico. null se nunca avisou. */
function ultimoAvisoMs(mensagens) {
  let ultimo = null;
  for (const m of mensagens || []) {
    if (!m || typeof m.corpo !== 'string' || !m.corpo.startsWith(ALERT_MARKER)) continue;
    const t = m.created_at ? Date.parse(m.created_at) : NaN;
    if (!Number.isNaN(t) && (ultimo === null || t > ultimo)) ultimo = t;
  }
  return ultimo;
}

/**
 * PURO: este inbound merece acordar o fundador?
 *
 * @param {object} args
 * @param {object} args.lead Linha de prospect_leads.
 * @param {string} args.texto Corpo do inbound.
 * @param {Array} [args.historico] Mensagens do lead (pra cooldown).
 * @param {number} args.nowMs
 * @param {number} [args.cooldownMs]
 * @returns {{ alertar: boolean, motivo: string }}
 */
function deveAvisarFundador({ lead, texto, historico = [], nowMs, cooldownMs = COOLDOWN_MS }) {
  if (!lead || !ESTADOS_DO_FUNDADOR.has(lead.prospect_state)) {
    return { alertar: false, motivo: 'estado_nao_e_do_fundador' };
  }
  if (!String(texto || '').trim()) {
    return { alertar: false, motivo: 'sem_texto' };
  }
  if (pareceEcoDeMaquina(texto)) {
    return { alertar: false, motivo: 'eco_de_maquina' };
  }
  const ultimo = ultimoAvisoMs(historico);
  if (ultimo !== null && nowMs - ultimo < cooldownMs) {
    return { alertar: false, motivo: 'cooldown' };
  }
  return { alertar: true, motivo: 'resposta_de_humano' };
}

/** Corta o texto do lead sem quebrar no meio de uma palavra. */
function trecho(texto, max = 180) {
  const t = String(texto || '').replace(/\s+/g, ' ').trim();
  if (t.length <= max) return t;
  return `${t.slice(0, t.lastIndexOf(' ', max) > 0 ? t.lastIndexOf(' ', max) : max)}…`;
}

/**
 * PURO: monta o aviso nos dois canais.
 *
 * O WhatsApp é o canal que acorda; o e-mail é o que sobrevive à rolagem. Os
 * dois trazem o texto do lead, porque um aviso que só diz "fulano respondeu"
 * obriga a abrir o sistema, que é exatamente o trabalho que isto elimina.
 */
function buildFounderAlert({ lead, texto, nowMs }) {
  const casa = (lead && lead.name) || 'lead sem nome';
  const cidade = lead && lead.city ? ` (${lead.city})` : '';
  const corte = trecho(texto);

  const whatsapp =
    `💬 ${casa}${cidade} respondeu:\n\n"${corte}"\n\n` +
    'A Olímpia está muda nesse lead porque a bola é sua. Responde direto no WhatsApp da casa.';

  const subject = `${casa} respondeu`;
  const text = [
    `${casa}${cidade} respondeu no WhatsApp:`,
    `"${corte}"`,
    'A Olímpia está em silêncio neste lead (estado handoff), então a resposta é sua.',
    lead && lead.whatsapp_phone ? `WhatsApp da casa: ${lead.whatsapp_phone}` : null,
  ].filter(Boolean).join('\n\n');

  const html = [
    `<p><strong>${esc(casa)}${esc(cidade)}</strong> respondeu no WhatsApp:</p>`,
    `<blockquote>${esc(corte)}</blockquote>`,
    '<p>A Olímpia está em silêncio neste lead (estado handoff), então a resposta é sua.</p>',
    lead && lead.whatsapp_phone
      ? `<p>WhatsApp da casa: <a href="https://wa.me/${esc(String(lead.whatsapp_phone).replace(/\D/g, ''))}">${esc(lead.whatsapp_phone)}</a></p>`
      : '',
  ].join('\n');

  return { whatsapp, subject, text, html, nowMs };
}

function esc(str) {
  return String(str == null ? '' : str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}

/** Texto do evento gravado após avisar (o que o cooldown procura). */
function eventoDeAviso(canais) {
  const lista = (canais || []).filter(Boolean).join(' + ') || 'nenhum canal';
  return `${ALERT_MARKER}: ${lista}`;
}

module.exports = {
  deveAvisarFundador,
  buildFounderAlert,
  eventoDeAviso,
  pareceEcoDeMaquina,
  ALERT_MARKER,
  COOLDOWN_MS,
  ESTADOS_DO_FUNDADOR,
};
