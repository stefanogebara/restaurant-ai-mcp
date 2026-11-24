'use strict';

/**
 * Limite de mensagens por telefone — o teto de abuso do canal.
 *
 * A versão anterior era um `Map` no escopo do módulo. Na Vercel isso é POR
 * INSTÂNCIA de função, e tráfego concorrente é justamente o que faz a Vercel
 * abrir instâncias novas: um número hostil em rajada era espalhado entre N
 * Lambdas, o limite efetivo virava 10 × N, e cada cold start zerava o contador.
 * O cenário de ataque que ele deveria cobrir era exatamente o que o derrotava.
 *
 * O que passava custava dinheiro de verdade: o system prompt carrega horários,
 * até 40 itens de menu e capacidade de mesas (~2-3k tokens), mais histórico de
 * até 20 turnos, mais tipicamente duas chamadas de IA por mensagem e mais uma
 * de compressão. Ordem de grandeza: ~10k tokens de entrada por mensagem, ~10M
 * por mil mensagens — dezenas de dólares por rajada, sem teto nenhum para o
 * restaurante.
 *
 * Agora a contagem é atômica no Postgres, que é a única coisa realmente
 * compartilhada entre Lambdas. Mesmo padrão do dedup de mensagens — e o próprio
 * `rate-limit.js` registra que o Redis se mostrou não-confiável aqui.
 *
 * FAIL-OPEN por decisão: se o banco hesita, a memória local assume e a mensagem
 * passa. Bloquear um cliente de verdade porque o Postgres piscou é pior que
 * deixar passar uma rajada rara — e a rajada ainda encontra a barreira
 * degradada da instância.
 */

const { supabaseAdmin } = require('../../_lib/supabase');
const { createSecureLogger } = require('../../_lib/secure-logger');

const logger = createSecureLogger('WhatsAppRateLimit');

/** Mensagens permitidas por janela, por telefone. */
const LIMITE_POR_JANELA = 10;
/** Tamanho do balde. Fixo, não deslizante — basta pra barrar rajada. */
const JANELA_SEGUNDOS = 60;

/** Fallback local: só vale dentro desta instância, mas é melhor que nada. */
const memoria = new Map();

function contarNaMemoria(phone) {
  const agora = Date.now();
  const corte = agora - JANELA_SEGUNDOS * 1000;
  const carimbos = (memoria.get(phone) || []).filter((t) => t > corte);
  carimbos.push(agora);
  memoria.set(phone, carimbos);
  return carimbos.length;
}

// Varredura do fallback. `.unref()` para o worker do Jest (e qualquer require
// curto) conseguir sair; o intervalo segue disparando enquanto a instância vive.
const limpeza = setInterval(() => {
  const corte = Date.now() - JANELA_SEGUNDOS * 1000;
  for (const [phone, carimbos] of memoria) {
    const vivos = carimbos.filter((t) => t > corte);
    if (vivos.length === 0) memoria.delete(phone);
    else memoria.set(phone, vivos);
  }
}, 5 * 60 * 1000);
if (typeof limpeza.unref === 'function') limpeza.unref();

/**
 * @param {string} phone telefone do remetente
 * @returns {Promise<boolean>} true = passou do limite, descartar a mensagem
 */
async function isRateLimited(phone) {
  if (!phone) return false;

  let contagem = null;
  try {
    const { data, error } = await supabaseAdmin.rpc('whatsapp_rate_bump', {
      p_phone: phone,
      p_janela_seg: JANELA_SEGUNDOS,
    });
    if (error) {
      // 42883 = função não existe (migração não aplicada). Vale um aviso claro,
      // porque o sintoma — limite não funcionando — é invisível de outro jeito.
      logger.warn('[RATE_LIMIT] contagem no banco falhou, usando memória local', {
        code: error.code, message: String(error.message || '').slice(0, 120),
      });
    } else if (Number.isFinite(data)) {
      contagem = data;
    }
  } catch (err) {
    logger.warn('[RATE_LIMIT] RPC estourou, usando memória local', {
      message: String((err && err.message) || err).slice(0, 120),
    });
  }

  // Sem número do banco: conta local e segue. Nunca bloqueia por causa da
  // indisponibilidade em si — só pelo que a memória conseguir enxergar.
  if (contagem === null) {
    return contarNaMemoria(phone) > LIMITE_POR_JANELA;
  }

  if (contagem > LIMITE_POR_JANELA) {
    logger.info(`[RATE_LIMIT] telefone acima do limite (${contagem}/${LIMITE_POR_JANELA} em ${JANELA_SEGUNDOS}s)`);
    return true;
  }
  return false;
}

module.exports = { isRateLimited, LIMITE_POR_JANELA, JANELA_SEGUNDOS };
