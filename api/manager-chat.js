const { verifyJWT } = require('./_lib/auth');
const { runManagerAgent, runManagerAgentStream, ManagerQuotaError } = require('./_lib/manager-agent');
const { supabaseAdmin } = require('./_lib/supabase');
const { createSecureLogger } = require('./_lib/secure-logger');
const { checkAndApplyRateLimit } = require('./_lib/rate-limit');
const { setInternalCors } = require('./_lib/cors');
const { applySecurityHeaders } = require('./_lib/security-headers');
const { inlineCheckSubscription } = require('./_lib/subscription-middleware');

const logger = createSecureLogger('manager-chat');

module.exports = async (req, res) => {
  setInternalCors(req, res);
  applySecurityHeaders(res);

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method === 'GET') return handleHistory(req, res);
  if (req.method === 'POST') {
    const wantsStream = (req.headers.accept || '').includes('text/event-stream');
    return wantsStream ? handleChatStream(req, res) : handleChat(req, res);
  }
  return res.status(405).json({ error: 'Method not allowed' });
};

async function handleChat(req, res) {
  try {
    const user = await verifyJWT(req.headers.authorization?.replace('Bearer ', ''));
    if (!user || !user.restaurant_id) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    const restaurantId = user.restaurant_id;

    const subBlocked = await inlineCheckSubscription(restaurantId, res);
    if (subBlocked) return;

    const rateLimited = await checkAndApplyRateLimit(req, res, 'chat');
    if (rateLimited) return;

    const { message } = req.body || {};
    if (!message || typeof message !== 'string' || !message.trim()) {
      return res.status(400).json({ error: 'message is required' });
    }
    const reply = await runManagerAgent(restaurantId, message.trim(), 'app');
    return res.json({ reply });
  } catch (err) {
    return handleQuotaOrError(err, res);
  }
}

async function handleChatStream(req, res) {
  try {
    const user = await verifyJWT(req.headers.authorization?.replace('Bearer ', ''));
    if (!user || !user.restaurant_id) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    const restaurantId = user.restaurant_id;

    const subBlocked = await inlineCheckSubscription(restaurantId, res);
    if (subBlocked) return;

    const rateLimited = await checkAndApplyRateLimit(req, res, 'chat');
    if (rateLimited) return;

    const { message } = req.body || {};
    if (!message || typeof message !== 'string' || !message.trim()) {
      return res.status(400).json({ error: 'message is required' });
    }

    // SSE headers
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    });

    res.write('data: {"type":"start"}\n\n');

    await runManagerAgentStream(restaurantId, message.trim(), 'app', (token) => {
      res.write(`data: ${JSON.stringify({ type: 'token', text: token })}\n\n`);
    });

    res.write('data: {"type":"done"}\n\n');
    res.end();
  } catch (err) {
    if (err instanceof ManagerQuotaError) {
      if (res.headersSent) {
        res.write(`data: ${JSON.stringify({ type: 'error', error: err.type })}\n\n`);
        return res.end();
      }
      return handleQuotaOrError(err, res);
    }
    logger.error('manager-chat stream error', { error: err.message });
    if (res.headersSent) {
      res.write(`data: ${JSON.stringify({ type: 'error', error: 'Internal error' })}\n\n`);
      return res.end();
    }
    if (err.message === 'UNAUTHORIZED') return res.status(401).json({ error: 'Authentication required' });
    return res.status(500).json({ error: 'Internal error' });
  }
}

function handleQuotaOrError(err, res) {
  if (err instanceof ManagerQuotaError) {
    logger.info('manager-chat quota gate', { type: err.type, plan: err.plan, used: err.used, limit: err.limit });
    if (err.type === 'upgrade_required') {
      return res.status(403).json({ error: 'Manager AI requires a paid plan', upgrade_required: true });
    }
    if (err.type === 'quota_exceeded') {
      return res.status(429).json({ error: 'Monthly Manager AI limit reached', used: err.used, limit: err.limit });
    }
    return res.status(402).json({ error: 'Manager AI access restricted', type: err.type });
  }
  logger.error('manager-chat error', { error: err.message });
  if (err.message === 'UNAUTHORIZED') return res.status(401).json({ error: 'Authentication required' });
  return res.status(500).json({ error: 'Internal error' });
}

async function handleHistory(req, res) {
  try {
    const user = await verifyJWT(req.headers.authorization?.replace('Bearer ', ''));
    if (!user || !user.restaurant_id) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    const restaurantId = user.restaurant_id;

    const subBlocked = await inlineCheckSubscription(restaurantId, res);
    if (subBlocked) return;

    const rateLimited = await checkAndApplyRateLimit(req, res, 'api');
    if (rateLimited) return;

    const { data, error } = await supabaseAdmin
      .from('manager_conversations')
      .select('role, content, channel, created_at')
      .eq('restaurant_id', restaurantId)
      .order('created_at', { ascending: true })
      .limit(100);
    if (error) throw new Error(error.message);
    return res.json({ history: data || [] });
  } catch (err) {
    logger.error('manager-chat history error', { error: err.message });
    if (err.message === 'UNAUTHORIZED') return res.status(401).json({ error: 'Authentication required' });
    return res.status(500).json({ error: 'Internal error' });
  }
}
