const { verifyJWT } = require('./_lib/auth');
const { runManagerAgent, ManagerQuotaError } = require('./_lib/manager-agent');
const { supabaseAdmin } = require('./_lib/supabase');
const { createSecureLogger } = require('./_lib/secure-logger');

const logger = createSecureLogger('manager-chat');

module.exports = async (req, res) => {
  if (req.method === 'GET') return handleHistory(req, res);
  if (req.method === 'POST') return handleChat(req, res);
  return res.status(405).json({ error: 'Method not allowed' });
};

async function handleChat(req, res) {
  try {
    const { restaurantId } = verifyJWT(req.headers.authorization?.replace('Bearer ', ''));
    const { message } = req.body || {};
    if (!message || typeof message !== 'string' || !message.trim()) {
      return res.status(400).json({ error: 'message is required' });
    }
    const reply = await runManagerAgent(restaurantId, message.trim(), 'app');
    return res.json({ reply });
  } catch (err) {
    if (err instanceof ManagerQuotaError) {
      if (err.type === 'upgrade_required') {
        return res.status(403).json({ error: 'Manager AI requires a paid plan', upgrade_required: true });
      }
      if (err.type === 'quota_exceeded') {
        return res.status(429).json({ error: 'Monthly Manager AI limit reached', used: err.used, limit: err.limit });
      }
    }
    logger.error('manager-chat error', { error: err.message });
    if (err.message === 'UNAUTHORIZED') return res.status(401).json({ error: 'Unauthorized' });
    return res.status(500).json({ error: 'Internal error' });
  }
}

async function handleHistory(req, res) {
  try {
    const { restaurantId } = verifyJWT(req.headers.authorization?.replace('Bearer ', ''));
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
    if (err.message === 'UNAUTHORIZED') return res.status(401).json({ error: 'Unauthorized' });
    return res.status(500).json({ error: 'Internal error' });
  }
}
