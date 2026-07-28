/**
 * Provisionamento de número WhatsApp — item 4 do plano zero-toque (28/jul/2026).
 *
 * O roteamento por número dedicado JÁ existe: message-processor resolve o
 * restaurante por restaurant_registry.whatsapp_phone_number_id (registry
 * central, cache de 60s). Este módulo constrói o caminho de ATIVAÇÃO — como um
 * número entra na WABA da plataforma e chega àquela coluna sem o fundador
 * tocar em nada.
 *
 * Máquina de estados (persistida em restaurant.restaurant_config
 * .whatsapp_provisioning — estado de TENANT; o registry central só recebe o
 * ponteiro final):
 *
 *   (nada) --iniciar--> aguardando_codigo --confirmarCodigo--> ativo
 *                \--erro                        \--erro (com motivo)
 *
 * Modos:
 *   numero_proprio — o dono registra um número que ELE controla (fixo ou
 *     chip). O OTP da Meta chega NELE (SMS ou ligação) e ELE digita aqui.
 *     Zero toque do fundador; é o caminho real HOJE, sem contas novas.
 *   mock — ativa instantaneamente com id falso. Só com
 *     ALLOW_MOCK_WHATSAPP_PROVISIONING=true (validar UI/fluxo sem WABA).
 *   twilio — compra automática de número (Caminho A puro). FASE 2: exige
 *     conta Twilio com número BR (bundle regulatório) + webhook de SMS para
 *     capturar o OTP. A máquina já suporta; o adaptador de compra não existe.
 *
 * Meio-provisionado NUNCA entra no roteamento: whatsapp_phone_number_id do
 * registry só é escrito quando o registro na Cloud API completa.
 */

const crypto = require('crypto');
const { supabaseAdmin } = require('./supabase');
const { centralSupabase, isCentralConfigured } = require('./central-supabase');
const { createSecureLogger } = require('./secure-logger');

const logger = createSecureLogger('WhatsAppProvisioning');

const GRAPH = 'https://graph.facebook.com/v21.0';

/** Erro com mensagem segura pro dono (sem vazar internals da Meta). */
class ErroDeProvisionamento extends Error {
  constructor(mensagemPublica, detalhe) {
    super(mensagemPublica);
    this.name = 'ErroDeProvisionamento';
    this.detalhe = detalhe || null;
  }
}

function envObrigatorio() {
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  const waba = process.env.WHATSAPP_WABA_ID;
  if (!token || !waba) {
    throw new ErroDeProvisionamento(
      'Provisionamento de WhatsApp ainda não está habilitado na plataforma.',
      `faltam envs: ${[!token && 'WHATSAPP_ACCESS_TOKEN', !waba && 'WHATSAPP_WABA_ID'].filter(Boolean).join(', ')}`,
    );
  }
  return { token, waba };
}

function modoMockLiberado() {
  return process.env.ALLOW_MOCK_WHATSAPP_PROVISIONING === 'true';
}

/** Chamada à Graph API com timeout e erro mapeado. */
async function chamarGraph(caminho, corpo, token) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), 15000);
  try {
    const resposta = await fetch(`${GRAPH}${caminho}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(corpo),
      signal: controller.signal,
    });
    const json = await resposta.json().catch(() => ({}));
    if (!resposta.ok || json.error) {
      const msg = json.error?.message || `HTTP ${resposta.status}`;
      logger.error('Graph API recusou', { caminho, erro: msg });
      throw new ErroDeProvisionamento(mensagemAmigavel(msg), msg);
    }
    return json;
  } finally {
    clearTimeout(t);
  }
}

/**
 * Traduz os erros comuns da Meta pra algo que um dono de restaurante entende.
 * O detalhe técnico fica no estado (campo erro_detalhe) e no log — nunca na
 * mensagem principal.
 */
function mensagemAmigavel(msgMeta) {
  const m = String(msgMeta).toLowerCase();
  if (m.includes('already') && m.includes('registered')) {
    return 'Este número já está registrado no WhatsApp Business API. Se ele é seu, será preciso migrá-lo — fale com o suporte.';
  }
  if (m.includes('verify') || m.includes('code')) {
    return 'Código não confere. Confira os 6 dígitos e tente de novo — ou peça um novo código.';
  }
  if (m.includes('rate') || m.includes('too many')) {
    return 'A Meta limitou tentativas para este número. Aguarde alguns minutos e tente novamente.';
  }
  return 'A Meta recusou a operação. Tente novamente; se persistir, fale com o suporte.';
}

// ── Persistência do estado (restaurant_config do próprio restaurante) ──

async function lerEstado(restaurantId) {
  const { data, error } = await supabaseAdmin
    .schema('restaurant')
    .from('restaurant_config')
    .select('id, whatsapp_provisioning')
    .eq('id', restaurantId)
    .maybeSingle();
  if (error) {
    if (error.code === '42703') {
      throw new ErroDeProvisionamento(
        'Provisionamento indisponível — atualização de banco pendente.',
        'coluna whatsapp_provisioning ausente: aplicar migrations/20260728_whatsapp_provisioning.sql',
      );
    }
    throw new ErroDeProvisionamento('Falha ao consultar o estado.', error.message);
  }
  if (!data) throw new ErroDeProvisionamento('Restaurante não encontrado.');
  return data.whatsapp_provisioning || null;
}

async function gravarEstado(restaurantId, estado) {
  const { error } = await supabaseAdmin
    .schema('restaurant')
    .from('restaurant_config')
    .update({ whatsapp_provisioning: { ...estado, atualizado_em: new Date().toISOString() } })
    .eq('id', restaurantId);
  if (error) throw new ErroDeProvisionamento('Falha ao gravar o estado.', error.message);
}

/**
 * Copia o ponteiro final pro registry central — o ÚNICO efeito fora do tenant.
 * Só roda com registro completo; o cache do registry (60s) faz o roteamento
 * enxergar o número em até um minuto.
 */
async function apontarRoteamento(restaurantId, phoneNumberId) {
  if (!isCentralConfigured()) {
    throw new ErroDeProvisionamento(
      'Registry central não configurado — roteamento não foi atualizado.',
      'centralSupabase null',
    );
  }
  const { data, error } = await centralSupabase
    .from('restaurant_registry')
    .update({ whatsapp_phone_number_id: phoneNumberId })
    .eq('id', restaurantId)
    .select('id');
  if (error) {
    const detalhe = error.code === '42703'
      ? 'coluna whatsapp_phone_number_id ausente no registry central (migração 20260412 pendente lá)'
      : error.message;
    throw new ErroDeProvisionamento('Número registrado na Meta, mas o roteamento não foi atualizado — fale com o suporte.', detalhe);
  }
  if (!data || data.length === 0) {
    throw new ErroDeProvisionamento(
      'Número registrado na Meta, mas este restaurante não está no registry de roteamento — fale com o suporte.',
      `nenhuma linha com id=${restaurantId} no registry central`,
    );
  }
}

// ── Operações ──

const SO_DIGITOS = /^\d+$/;

/**
 * Inicia o provisionamento: adiciona o número à WABA e dispara o OTP da Meta
 * pro método escolhido. O dono recebe o código NO NÚMERO DELE.
 */
async function iniciar({ restaurantId, modo, cc, numero, metodo }) {
  if (modo === 'mock') {
    if (!modoMockLiberado()) {
      throw new ErroDeProvisionamento('Modo de teste não está habilitado.');
    }
    const fake = `mock_${crypto.randomUUID().slice(0, 8)}`;
    const estado = {
      estado: 'ativo', modo: 'mock', phone_number_id: fake,
      numero_e164: `+000${Date.now() % 1e8}`,
    };
    await gravarEstado(restaurantId, estado);
    await apontarRoteamento(restaurantId, fake);
    return { ...estado };
  }

  if (modo !== 'numero_proprio') {
    // 'twilio' cai aqui de propósito até o adaptador de compra existir —
    // prometer compra automática sem conta Twilio configurada seria mentira.
    throw new ErroDeProvisionamento('Modo de provisionamento não suportado ainda.');
  }

  const ccLimpo = String(cc || '').trim();
  const numeroLimpo = String(numero || '').replace(/[\s()-]/g, '');
  const metodoLimpo = metodo === 'voice' ? 'VOICE' : 'SMS';
  if (!SO_DIGITOS.test(ccLimpo) || ccLimpo.length > 3) {
    throw new ErroDeProvisionamento('Código do país inválido (ex.: 55).');
  }
  if (!SO_DIGITOS.test(numeroLimpo) || numeroLimpo.length < 8 || numeroLimpo.length > 14) {
    throw new ErroDeProvisionamento('Número inválido — use DDD + número, só dígitos.');
  }

  const { token, waba } = envObrigatorio();

  // 1. Número entra na WABA da plataforma (estado UNVERIFIED na Meta).
  const criado = await chamarGraph(`/${waba}/phone_numbers`, {
    cc: ccLimpo,
    phone_number: numeroLimpo,
  }, token);
  const phoneNumberId = criado.id;
  if (!phoneNumberId) {
    throw new ErroDeProvisionamento('A Meta não devolveu o id do número.', JSON.stringify(criado).slice(0, 200));
  }

  // 2. Meta manda o OTP pro próprio número (SMS ou ligação) — quem recebe é o
  //    DONO, não a plataforma. É isso que mantém o fluxo zero-toque pro
  //    fundador sem precisar de infraestrutura de captura de SMS.
  await chamarGraph(`/${phoneNumberId}/request_code`, {
    code_method: metodoLimpo,
    language: 'pt_BR',
  }, token);

  // PIN de duas etapas exigido no register. Gerado aqui e guardado no estado:
  // se o dono re-registrar depois, é este PIN que a Meta vai cobrar.
  const pin = String(crypto.randomInt(0, 1000000)).padStart(6, '0');

  const estado = {
    estado: 'aguardando_codigo',
    modo: 'numero_proprio',
    cc: ccLimpo,
    numero_e164: `+${ccLimpo}${numeroLimpo}`,
    metodo: metodoLimpo,
    phone_number_id: phoneNumberId,
    pin,
  };
  await gravarEstado(restaurantId, estado);
  logger.info('Provisionamento iniciado', { restaurantId, phoneNumberId, metodo: metodoLimpo });

  const { pin: _pin, ...publico } = estado;
  return publico;
}

/** Confirma o OTP digitado pelo dono e completa o registro na Cloud API. */
async function confirmarCodigo({ restaurantId, codigo }) {
  const atual = await lerEstado(restaurantId);
  if (!atual || atual.estado !== 'aguardando_codigo') {
    throw new ErroDeProvisionamento('Não há verificação pendente — inicie a conexão primeiro.');
  }
  const codigoLimpo = String(codigo || '').replace(/\D/g, '');
  if (codigoLimpo.length < 4 || codigoLimpo.length > 8) {
    throw new ErroDeProvisionamento('Código inválido — digite os dígitos recebidos.');
  }

  const { token } = envObrigatorio();

  try {
    await chamarGraph(`/${atual.phone_number_id}/verify_code`, { code: codigoLimpo }, token);
    await chamarGraph(`/${atual.phone_number_id}/register`, {
      messaging_product: 'whatsapp',
      pin: atual.pin,
    }, token);
  } catch (err) {
    // Código errado NÃO derruba a jornada — continua aguardando_codigo pra
    // nova tentativa. Só erros de registro viram estado erro.
    if (err instanceof ErroDeProvisionamento && /código não confere/i.test(err.message)) {
      throw err;
    }
    await gravarEstado(restaurantId, { ...atual, estado: 'erro', erro: err.message, erro_detalhe: err.detalhe || null });
    throw err;
  }

  const ativo = { ...atual, estado: 'ativo', erro: null, erro_detalhe: null };
  await gravarEstado(restaurantId, ativo);
  await apontarRoteamento(restaurantId, atual.phone_number_id);
  logger.info('Número ativo e roteamento apontado', { restaurantId, phoneNumberId: atual.phone_number_id });

  const { pin: _pin, ...publico } = ativo;
  return publico;
}

/** Estado público (sem PIN) pra UI. */
async function estadoPublico(restaurantId) {
  const atual = await lerEstado(restaurantId);
  if (!atual) return { estado: 'nao_iniciado' };
  const { pin: _pin, ...publico } = atual;
  return publico;
}

module.exports = {
  iniciar,
  confirmarCodigo,
  estadoPublico,
  ErroDeProvisionamento,
  // exportados para teste
  _interno: { mensagemAmigavel, apontarRoteamento },
};
