'use strict';

/**
 * Aviso ao fundador sobre a SAÚDE DO NÚMERO — camada pura.
 *
 * POR QUE EXISTE (12/08/2026). O disjuntor de falhas já existia e funciona:
 * passou de 5% de falhas reputacionais em 24h, ele DESLIGA o disparo sozinho
 * (`checkFailedRateBreaker`). O que ele não fazia era avisar. Gravava um evento
 * e um log de erro, e o fundador só descobria abrindo o cockpit — e a prospecção
 * ficava parada até alguém reparar.
 *
 * É o mesmo defeito que este dia inteiro perseguiu, na peça mais cara de todas:
 * o número é o ativo que sustenta a operação, e reputação queimada é lenta e
 * cara de recuperar.
 *
 * DOIS NÍVEIS, de propósito:
 *   AVISO      — a taxa está subindo mas o disjuntor ainda não disparou. Serve
 *                pra dar tempo de reduzir o cap ANTES da parada dura.
 *   DISJUNTOR  — já desligou. Não é conselho, é fato consumado.
 *
 * A taxa que manda é a REPUTACIONAL, a mesma do disjuntor. Usar a taxa cheia
 * (que inclui 131026 "não tem WhatsApp" e outras atrições benignas de lista
 * fria) daria um segundo número discordando do primeiro — o cockpit mostra 12%
 * cheio enquanto o disjuntor olha outro valor, e um aviso baseado no número
 * errado assusta sem motivo ou tranquiliza sem direito.
 */

/** Onde o aviso começa. Abaixo do limite do disjuntor (0.05), por definição. */
const AVISO_TAXA = 0.03;

/** Volume mínimo. 1 falha em 3 envios é 33% e não significa nada. */
const AVISO_MIN_ENVIOS = 20;

/** Um aviso do mesmo nível por 12h. Alerta repetido vira ruído ignorado. */
const COOLDOWN_MS = 12 * 60 * 60 * 1000;

/**
 * PURO: deve avisar, e em qual nível?
 *
 * @param {{taxaReputacional:number, total:number, disjuntorDisparou:boolean,
 *          ultimoAvisoMs:number|null, nowMs:number}} args
 * @returns {{avisar:boolean, nivel:'disjuntor'|'aviso'|null, motivo:string}}
 */
function deveAvisarDoNumero({
  taxaReputacional, total, disjuntorDisparou = false,
  ultimoAvisoMs = null, nowMs, cooldownMs = COOLDOWN_MS,
} = {}) {
  // O disjuntor ignora cooldown e volume: ele já DESLIGOU a prospecção, e isso
  // sempre vale uma mensagem. Silenciar por cooldown deixaria o fundador sem
  // saber por que os envios pararam.
  if (disjuntorDisparou) return { avisar: true, nivel: 'disjuntor', motivo: 'disparou' };

  if (!Number.isFinite(taxaReputacional)) return { avisar: false, nivel: null, motivo: 'sem_taxa' };
  if (!Number.isFinite(total) || total < AVISO_MIN_ENVIOS) {
    return { avisar: false, nivel: null, motivo: 'volume_baixo' };
  }
  if (taxaReputacional < AVISO_TAXA) return { avisar: false, nivel: null, motivo: 'taxa_ok' };

  if (ultimoAvisoMs !== null && Number.isFinite(ultimoAvisoMs) && nowMs - ultimoAvisoMs < cooldownMs) {
    return { avisar: false, nivel: null, motivo: 'cooldown' };
  }
  return { avisar: true, nivel: 'aviso', motivo: 'taxa_subindo' };
}

const pct = (t) => `${(t * 100).toFixed(1)}%`;

/**
 * PURO: o texto do aviso, nos dois canais.
 *
 * Diz o QUE fazer, não só o que aconteceu. Um alerta que obriga a abrir o
 * sistema pra descobrir a ação é meio alerta.
 */
function buildAlertaNumero({ nivel, taxaReputacional, total, falhas, capAtual }) {
  const taxa = pct(taxaReputacional);
  const capLinha = capAtual ? ` O limite diário está em ${capAtual}.` : '';

  if (nivel === 'disjuntor') {
    const corpo = `O disparo da Olímpia foi DESLIGADO automaticamente: ${falhas} de ${total} envios `
      + `falharam por motivo reputacional nas últimas 24h (${taxa}).${capLinha}\n\n`
      + 'Nada mais sai até você religar. Antes de religar, vale reduzir o limite diário — '
      + 'voltar no mesmo volume tende a derrubar de novo, e reputação de número é lenta de recuperar.';
    return {
      whatsapp: `🔴 Disparo DESLIGADO (${taxa} de falhas)\n\n${corpo}`,
      subject: `🔴 Olímpia: disparo desligado — ${taxa} de falhas em 24h`,
      text: corpo,
      html: `<p><strong>Disparo desligado automaticamente.</strong></p><p>${esc(corpo).replace(/\n\n/g, '</p><p>')}</p>`,
    };
  }

  const corpo = `A taxa de falhas do número da Olímpia está em ${taxa} nas últimas 24h `
    + `(${falhas} de ${total} envios, só motivos reputacionais).${capLinha}\n\n`
    + `O disjuntor desliga o disparo sozinho em ${pct(0.05)}. Ainda dá tempo de reduzir o limite diário `
    + 'e evitar a parada — recuperar reputação de número é bem mais lento que baixar o volume agora.';
  return {
    whatsapp: `🟡 Falhas subindo: ${taxa}\n\n${corpo}`,
    subject: `🟡 Olímpia: falhas do número em ${taxa}`,
    text: corpo,
    html: `<p><strong>Falhas subindo no número da Olímpia.</strong></p><p>${esc(corpo).replace(/\n\n/g, '</p><p>')}</p>`,
  };
}

function esc(str) {
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Tipo do evento gravado — também é a chave que o cooldown procura. */
const EVENTO_AVISO = 'aviso_taxa_falha';

module.exports = {
  deveAvisarDoNumero,
  buildAlertaNumero,
  AVISO_TAXA,
  AVISO_MIN_ENVIOS,
  COOLDOWN_MS,
  EVENTO_AVISO,
};
