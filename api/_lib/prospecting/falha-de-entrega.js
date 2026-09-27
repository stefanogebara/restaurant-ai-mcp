'use strict';

/**
 * Follow-up pra quem nunca recebeu a primeira mensagem.
 *
 * Medido em 27/09/2026: dos 15 toques 3 que falharam em 30 dias, 12 foram pra
 * leads cuja INTRO já tinha falhado (131026 "undeliverable", 131049 "healthy
 * ecosystem", 130472 "experiment"). O status do lead não conta essa história:
 * 93 leads com intro falhada seguem `whatsapp_send_status = 'sent'`, então
 * selectDueTouches não tinha como saber. Cada toque desses é um envio a mais
 * contra o limite de marketing da Meta, que é justamente o que o 131049 pune.
 *
 * A verdade está no log de mensagens: um template nosso com status 'failed'
 * encerra a sequência. Degrada ABERTO (erro de leitura → segue a sequência),
 * mas grita no log: um guarda que falha calado vira um guarda que nunca dispara.
 */

const { createSecureLogger } = require('../secure-logger');

const logger = createSecureLogger('FalhaDeEntrega');

/** @returns {Promise<string|null>} o erro do template que falhou, ou null. */
async function templateFalhou(leadId) {
  try {
    const { supabaseAdmin } = require('../supabase');
    const { data, error } = await supabaseAdmin
      .from('prospect_messages')
      .select('error_detail')
      .eq('lead_id', leadId)
      .eq('direcao', 'out')
      .eq('tipo', 'template')
      .eq('status', 'failed')
      // Qualquer falha, em qualquer toque, encerra: é de propósito. Um 131049
      // num toque é a Meta dizendo que esta pessoa já recebe marketing demais;
      // insistir é o que agrava. O texto do evento diz qual erro foi.
      .limit(1);
    if (error) {
      logger.error(`templateFalhou: leitura falhou lead=${leadId}: ${error.message}`);
      return null;
    }
    const row = Array.isArray(data) ? data[0] : null;
    return row ? String(row.error_detail || 'failed').slice(0, 60) : null;
  } catch (err) {
    logger.error(`templateFalhou: exceção lead=${leadId}: ${err.message}`);
    return null;
  }
}

module.exports = { templateFalhou };
