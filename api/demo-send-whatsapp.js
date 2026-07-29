'use strict';

/**
 * POST /api/demo-send-whatsapp — "testar no MEU WhatsApp"
 *
 * NOME: não use `*-test.js` para handlers. A regra `*-test.js` do .gitignore
 * (feita para scripts de teste ad-hoc) engole o arquivo, e ele fica de fora do
 * commit sem nenhum aviso — o endpoint 404 em produção enquanto tudo passa
 * verde localmente.
 *
 * Item 7 do plano zero-toque. No demo, o dono informa o próprio celular e
 * recebe uma mensagem real da plataforma: o produto sai da tela e chega no
 * telefone dele. É a conversão mais forte do funil.
 *
 * ── ESTE ENDPOINT É UMA SUPERFÍCIE DE ABUSO. Ele envia WhatsApp para um número
 * que o VISITANTE digita, e cada envio custa dinheiro. Duas coisas podem dar
 * errado, e são diferentes:
 *
 *   1. incomodar TERCEIROS — digitar o número de outra pessoa, repetidamente;
 *   2. gerar CUSTO — um script disparando testes vira fatura, e o primeiro
 *      sinal seria o boleto.
 *
 * Por isso há três limites (número de destino, IP, e teto global diário) e o
 * envio só acontece DEPOIS de todos. Ordem deliberada: as checagens baratas
 * vêm antes da chamada paga.
 *
 * ── LIMITE HONESTO DO ESCOPO: isto ENVIA, mas não conversa. Se o dono
 * responder, a resposta cai no pipeline normal e NÃO encontra o restaurante do
 * demo — demos vivem em `restaurant_config.is_demo`, enquanto o roteamento usa
 * o `restaurant_registry` (outro projeto Supabase). Fazer o diálogo funcionar
 * exige roteamento de demo no message-processor, que é trabalho à parte. A
 * mensagem foi escrita para NÃO convidar resposta, justamente para não prometer
 * o que ainda não existe.
 */

const { supabaseAdmin } = require('./_lib/supabase');
const { checkRateLimit, getClientId } = require('./_lib/rate-limit');
const { createSecureLogger } = require('./_lib/secure-logger');
const { setInternalCors } = require('./_lib/cors');
const {
  isWhatsAppConfigured,
  sendTemplateMessage,
} = require('./_lib/whatsapp-sender');
const {
  fetchApprovedMetaTestTemplates,
  buildMetaTemplateAttempts,
  isTemplateTranslationMissing,
} = require('./_lib/whatsapp-meta-templates');

const logger = createSecureLogger('DemoWhatsAppTest');

/**
 * E.164 sem o '+': 10 a 15 dígitos, não começando com 0.
 * Validação estrita de propósito — número malformado vira uma cobrança da Meta
 * por uma mensagem que não chega em ninguém.
 */
function normalizarTelefone(bruto) {
  const digitos = String(bruto == null ? '' : bruto).replace(/\D/g, '');
  if (digitos.length < 10 || digitos.length > 15) return null;
  if (digitos.startsWith('0')) return null;
  return digitos;
}

/** Máscara para log: o número é PII e não pode ir inteiro para o log. */
function mascarar(telefone) {
  return `${telefone.slice(0, 4)}****${telefone.slice(-2)}`;
}

module.exports = async function handler(req, res) {
  setInternalCors(req, res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  const { phone, restaurant_id, restaurant_name } = req.body || {};

  // ── 1. Validação (grátis, vem primeiro) ──
  const telefone = normalizarTelefone(phone);
  if (!telefone) {
    return res.status(400).json({
      success: false,
      code: 'INVALID_PHONE',
      error: 'Informe um número de WhatsApp válido com DDI e DDD.',
    });
  }

  // ── 2. Defesas, da que protege terceiros para a que protege o bolso ──
  const porNumero = await checkRateLimit(`wa-test-phone:${telefone}`, 'demo_wa_test_phone');
  if (!porNumero.allowed) {
    // Não revela se o número já foi usado por OUTRA pessoa: isso transformaria
    // o endpoint num oráculo de "este telefone já testou o produto?".
    return res.status(429).json({
      success: false,
      code: 'PHONE_COOLDOWN',
      error: porNumero.message,
      retryAfter: porNumero.resetSeconds,
    });
  }

  const porIp = await checkRateLimit(getClientId(req), 'demo_wa_test_ip');
  if (!porIp.allowed) {
    return res.status(429).json({
      success: false,
      code: 'IP_LIMIT',
      error: porIp.message,
      retryAfter: porIp.resetSeconds,
    });
  }

  const global = await checkRateLimit('wa-test-global', 'demo_wa_test_global');
  if (!global.allowed) {
    // Teto de custo estourado é evento operacional, não erro do visitante:
    // alguém precisa OLHAR. Silenciar aqui esconderia um ataque em curso.
    logger.error('Teto diário de testes por WhatsApp atingido — envios suspensos', {
      limite: global.limit,
    });
    return res.status(503).json({
      success: false,
      code: 'GLOBAL_LIMIT',
      error: global.message,
    });
  }

  // ── 3. Provedor configurado? ──
  if (!isWhatsAppConfigured()) {
    logger.error('Teste de WhatsApp pedido, mas o provedor não está configurado');
    return res.status(503).json({
      success: false,
      code: 'PROVIDER_UNAVAILABLE',
      error: 'O teste por WhatsApp está indisponível agora.',
    });
  }

  // ── 4. Nome do restaurante: do banco quando houver demo, senão o informado ──
  let nome = typeof restaurant_name === 'string' && restaurant_name.trim()
    ? restaurant_name.trim().slice(0, 80)
    : null;
  let idioma = 'pt-BR';

  if (restaurant_id && typeof restaurant_id === 'string') {
    try {
      const { data } = await supabaseAdmin
        .schema('restaurant')
        .from('restaurant_config')
        .select('restaurant_name, agent_language')
        .eq('id', restaurant_id)
        .eq('is_demo', true)
        .maybeSingle();
      if (data) {
        nome = data.restaurant_name || nome;
        idioma = data.agent_language || idioma;
      }
    } catch (err) {
      // Não bloqueia: sem o nome do banco o teste ainda vale, só fica genérico.
      logger.warn('Não foi possível ler o demo para personalizar o teste', {
        erro: err?.message || String(err),
      });
    }
  }
  if (!nome) nome = 'seu restaurante';

  // ── 5. Envio. Mensagem iniciada pela empresa exige TEMPLATE APROVADO — texto
  //      livre só funciona dentro da janela de 24h após o cliente escrever. ──
  const aprovados = await fetchApprovedMetaTestTemplates();
  const tentativas = buildMetaTemplateAttempts({
    templates: aprovados,
    restaurantLanguage: idioma,
    restaurantName: nome,
  });

  let resultado = null;
  let usado = null;
  for (const tentativa of tentativas) {
    resultado = await sendTemplateMessage(
      telefone,
      tentativa.templateName,
      tentativa.language,
      tentativa.bodyParameters
    );
    usado = tentativa;
    if (resultado?.success) break;
    // 132001 = template existe, idioma não. Vale tentar o próximo idioma;
    // qualquer outro erro é definitivo e insistir só queima cota.
    if (!isTemplateTranslationMissing(resultado)) break;
  }

  if (!resultado?.success) {
    // O dono clicou e nada chegou. Sem este log, o suporte fica sem nada para
    // investigar — e um template reprovado na Meta é invisível do nosso lado.
    logger.error('Teste por WhatsApp não foi entregue', {
      destino: mascarar(telefone),
      template: usado?.templateName || null,
      idioma: usado?.language || null,
      aprovados_na_conta: aprovados.length,
      erro: resultado?.error || 'desconhecido',
    });
    return res.status(502).json({
      success: false,
      code: 'SEND_FAILED',
      error: 'Não conseguimos enviar agora. Tente novamente em alguns minutos.',
    });
  }

  logger.info('Teste por WhatsApp enviado', {
    destino: mascarar(telefone),
    template: usado?.templateName,
    restaurante: nome,
  });

  return res.status(200).json({
    success: true,
    data: {
      sent_to: mascarar(telefone),
      // O cliente não recebe o messageId: é identificador interno da Meta e
      // não serve para nada na UI.
      restaurant_name: nome,
    },
  });
};
