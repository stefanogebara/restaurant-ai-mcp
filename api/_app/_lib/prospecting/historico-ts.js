'use strict';

/**
 * O instante de uma mensagem do histórico.
 *
 * ACHADO (11/08/2026, dry-run em PRODUÇÃO): `loadHistory` seleciona
 * `direcao, corpo, tipo, enviada_em, wamid` — e NÃO traz `created_at`. Toda a
 * camada pura que eu escrevi lia `m.created_at`, que chegava `undefined`, virava
 * `Date.parse(undefined) = NaN`, e o efeito era silencioso e grave:
 *
 *   - follow-up por e-mail NUNCA disparava (o marcador da proposta era invisível,
 *     e a produção respondia "proposta_nunca_enviada" para um lead que a recebeu);
 *   - a idempotência da intro por WhatsApp cairia: sem enxergar o marcador, a
 *     intro sairia de novo A CADA RODADA para o mesmo lead;
 *   - o cooldown do aviso ao fundador cairia junto, alertando a cada inbound.
 *
 * POR QUE OS TESTES NÃO PEGARAM: minhas fixtures preenchiam `created_at`, porque
 * fui eu que as inventei. Testei o contrato que imaginei, não o que a função
 * realmente devolve. É a mesma lição que já custou caro nesta semana — usar a
 * string real, o dado real, a FORMA real — aplicada agora a mim.
 *
 * Ler os dois campos, e não "corrigir o SELECT", é deliberado: `loadHistory`
 * também alimenta o prompt da agente, e ampliar o que ela carrega para consertar
 * um leitor é mexer no que não está quebrado.
 *
 * PURO.
 */

/**
 * @param {{created_at?: string, enviada_em?: string}} m
 * @returns {number|null} epoch ms, ou null quando não há instante utilizável.
 */
function tsDaMensagem(m) {
  if (!m) return null;
  // created_at primeiro só por compatibilidade com chamadores que já o passam
  // (testes e caminhos que leem a tabela direto). enviada_em é o que chega de
  // loadHistory, que é o caminho de produção.
  const bruto = m.created_at || m.enviada_em;
  if (!bruto) return null;
  const t = Date.parse(bruto);
  return Number.isNaN(t) ? null : t;
}

/** Instante do marcador mais recente com este prefixo, ou null. */
function ultimoMarcadorMs(mensagens, prefixo) {
  let ultimo = null;
  for (const m of mensagens || []) {
    if (!m || typeof m.corpo !== 'string' || !m.corpo.startsWith(prefixo)) continue;
    const t = tsDaMensagem(m);
    if (t !== null && (ultimo === null || t > ultimo)) ultimo = t;
  }
  return ultimo;
}

/** Instante do último inbound do lead, ou null. */
function ultimoInboundMs(mensagens) {
  let ultimo = null;
  for (const m of mensagens || []) {
    if (!m || m.direcao !== 'in') continue;
    const t = tsDaMensagem(m);
    if (t !== null && (ultimo === null || t > ultimo)) ultimo = t;
  }
  return ultimo;
}

/** Houve inbound DEPOIS deste instante? */
function houveInboundApos(mensagens, marcoMs) {
  return (mensagens || []).some((m) => {
    if (!m || m.direcao !== 'in') return false;
    const t = tsDaMensagem(m);
    return t !== null && t > marcoMs;
  });
}

module.exports = { tsDaMensagem, ultimoMarcadorMs, ultimoInboundMs, houveInboundApos };
