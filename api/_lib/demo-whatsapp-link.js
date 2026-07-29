'use strict';

/**
 * Vincula o telefone do dono ao restaurante de DEMO, para que a resposta dele no
 * WhatsApp seja atendida pela IA do demo dele — e não pelo roteamento normal.
 *
 * ── COMO ISTO FUNCIONA (e por que é pequeno)
 *
 * `processWithAI` resolve o restaurante por `session.restaurant?.id ||
 * session.restaurant_id` e depois lê TODA a configuração direto de
 * `restaurant.restaurant_config` — que é exatamente onde os demos vivem. Então
 * não é preciso ensinar o roteamento sobre demos: basta a SESSÃO do telefone
 * apontar para o demo, e o resto do pipeline funciona sem alteração.
 *
 * ── AS TRÊS RESTRIÇÕES QUE MOLDARAM O DESENHO (verificadas no banco)
 *
 * 1. `whatsapp_sessions.restaurant_id` tem FK para `restaurant_registry`. Um
 *    demo que não esteja lá não pode ser gravado na sessão. Por isso o demo é
 *    inserido no registry — com `is_active: false`.
 *
 * 2. `is_active: false` é o detalhe que torna isto seguro:
 *    `getAllActiveRestaurants()` filtra por `is_active`, então o demo NUNCA
 *    aparece no seletor de restaurantes nem no auto-assign de um cliente real.
 *    Ele é alcançável apenas por vínculo explícito de sessão — este.
 *
 * 3. A FK é `ON DELETE SET NULL`. Quando o cron de limpeza apaga o demo
 *    expirado, a sessão volta a `restaurant_id = NULL` e o roteamento normal
 *    reassume sozinho. Não há estado órfão para limpar.
 */

const { createSecureLogger } = require('./secure-logger');
const { upsertRestaurant, getAllActiveRestaurants } = require('./restaurant-registry');
const { getOrCreateSession, getSessionByPhone, setSessionRestaurant } = require('./whatsapp-sessions');

const logger = createSecureLogger('DemoWhatsAppLink');

/**
 * @param {Object} p
 * @param {string} p.telefone      E.164 sem '+'
 * @param {string} p.demoId        restaurant_config.id do demo
 * @param {string} p.nome          nome do restaurante (para o registry)
 * @param {string} [p.idioma]
 * @returns {Promise<{vinculado: boolean, motivo?: string}>}
 */
async function vincularTelefoneAoDemo({ telefone, demoId, nome, idioma }) {
  if (!telefone || !demoId) return { vinculado: false, motivo: 'dados_incompletos' };

  // ── GUARDA: não roubar a conversa de um cliente real ──
  //
  // O dono de um restaurante que JÁ usa o Seatable pode pedir o teste do demo
  // com o mesmo celular. Se o vínculo sobrescrevesse a sessão dele, as próximas
  // mensagens dos CLIENTES DELE — ou dele com a operação — seriam respondidas
  // pelo restaurante de demo. Prefiro não vincular a arriscar isso.
  try {
    const sessaoAtual = await getSessionByPhone(telefone);
    const idAtual = sessaoAtual?.restaurant_id || sessaoAtual?.restaurant?.id || null;
    if (idAtual && idAtual !== demoId) {
      const ativos = await getAllActiveRestaurants();
      if (ativos.some((r) => r.id === idAtual)) {
        logger.info('Telefone já ligado a restaurante ativo — vínculo de demo recusado', {
          demoId,
        });
        return { vinculado: false, motivo: 'telefone_de_cliente_ativo' };
      }
    }
  } catch (err) {
    // Não dá para confirmar que é seguro sobrescrever → não sobrescreve.
    logger.warn('Não foi possível checar a sessão atual; vínculo de demo abortado', {
      erro: err?.message || String(err),
    });
    return { vinculado: false, motivo: 'checagem_falhou' };
  }

  // ── Demo precisa existir no registry para satisfazer a FK, e INATIVO para
  //    ficar fora de todo roteamento automático. ──
  const reg = await upsertRestaurant(demoId, {
    restaurant_name: nome || 'Demo',
    language: idioma || 'pt-BR',
    is_active: false,
  });
  if (reg.error) {
    logger.error('Falha ao registrar o demo — a resposta do dono cairia no fluxo normal', {
      demoId, erro: reg.error,
    });
    return { vinculado: false, motivo: 'registry_falhou' };
  }

  const sessao = await getOrCreateSession(telefone, `demo-${demoId}`);
  if (!sessao?.id) {
    logger.error('Sessão não pôde ser criada para o vínculo de demo', { demoId });
    return { vinculado: false, motivo: 'sessao_falhou' };
  }

  const atualizada = await setSessionRestaurant(sessao.id, demoId);
  if (!atualizada) {
    logger.error('Sessão criada mas não vinculada ao demo', { demoId });
    return { vinculado: false, motivo: 'vinculo_falhou' };
  }

  logger.info('Telefone vinculado ao demo — a resposta será atendida pela IA do demo', { demoId });
  return { vinculado: true };
}

module.exports = { vincularTelefoneAoDemo };
