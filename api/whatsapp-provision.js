/**
 * POST/GET /api/whatsapp-provision — conectar um número WhatsApp ao restaurante.
 *
 * Item 4 do plano zero-toque. O dono (autenticado) conecta um número que ele
 * controla: a Meta manda o código NO NÚMERO DELE (SMS ou ligação), ele digita
 * aqui, e o roteamento multi-tenant passa a apontar pra ele em até 60s (TTL do
 * cache do registry). Nenhum passo passa pelo fundador.
 *
 *   GET                        → estado atual (sem PIN)
 *   POST {action:'iniciar', cc, numero, metodo}   → dispara OTP da Meta
 *   POST {action:'confirmar', codigo}             → verifica + registra + roteia
 *
 * Auth: JWT do dono (mesmo idioma de voice-persona.js). Rate limit apertado —
 * cada 'iniciar' dispara SMS/ligação da Meta pro número informado; sem teto
 * isso vira ferramenta de spam contra terceiros.
 */

const { verifyJWT } = require('./_lib/auth');
const { checkAndApplyRateLimit } = require('./_lib/rate-limit');
const { setInternalCors, handlePreflight } = require('./_lib/cors');
const { createSecureLogger } = require('./_lib/secure-logger');
const {
  iniciar, confirmarCodigo, estadoPublico, ErroDeProvisionamento,
} = require('./_lib/whatsapp-provisioning');

const logger = createSecureLogger('WhatsAppProvision');

module.exports = async function handler(req, res) {
  setInternalCors(req, res);
  if (handlePreflight(req, res)) return;

  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (await checkAndApplyRateLimit(req, res, 'default')) return;

  let restaurantId;
  try {
    const user = await verifyJWT(req.headers.authorization?.replace('Bearer ', ''));
    if (!user?.restaurant_id) throw new Error('UNAUTHORIZED');
    restaurantId = user.restaurant_id;
  } catch {
    return res.status(401).json({ error: 'Authentication required' });
  }

  try {
    if (req.method === 'GET') {
      return res.status(200).json({ success: true, data: await estadoPublico(restaurantId) });
    }

    const { action, cc, numero, metodo, codigo, modo } = req.body || {};

    if (action === 'iniciar') {
      const data = await iniciar({
        restaurantId,
        // O modo só pode ser elevado a 'mock' pelo env no servidor; o cliente
        // pedir 'mock' sem o env ligado cai no erro de modo não habilitado.
        modo: modo === 'mock' ? 'mock' : 'numero_proprio',
        cc,
        numero,
        metodo,
      });
      return res.status(200).json({ success: true, data });
    }

    if (action === 'confirmar') {
      const data = await confirmarCodigo({ restaurantId, codigo });
      return res.status(200).json({ success: true, data });
    }

    return res.status(400).json({ error: 'action deve ser "iniciar" ou "confirmar"' });
  } catch (err) {
    if (err instanceof ErroDeProvisionamento) {
      // Mensagem já é segura pro dono; o detalhe técnico fica só no log.
      logger.warn('Provisionamento recusado', { restaurantId, detalhe: err.detalhe || err.message });
      return res.status(422).json({ success: false, error: err.message });
    }
    logger.error('Erro inesperado no provisionamento', { restaurantId, erro: err?.message });
    return res.status(500).json({ success: false, error: 'Erro interno — tente novamente.' });
  }
};
