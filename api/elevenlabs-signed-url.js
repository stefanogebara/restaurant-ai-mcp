const { verifyJWT } = require('./_lib/auth');
const { checkAndApplyRateLimit } = require('./_lib/rate-limit');
const { setInternalCors, handlePreflight } = require('./_lib/cors');
const { createSecureLogger } = require('./_lib/secure-logger');

const logger = createSecureLogger('elevenlabs-signed-url');

module.exports = async (req, res) => {
  setInternalCors(req, res);
  if (handlePreflight(req, res)) return;

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (await checkAndApplyRateLimit(req, res, 'api')) return;

  // Require JWT auth — signed URLs should only be issued to authenticated users
  const token = (req.headers.authorization || '').replace('Bearer ', '');
  const user = await verifyJWT(token).catch(() => null);
  if (!user) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    logger.error('ELEVENLABS_API_KEY not configured');
    return res.status(500).json({ error: 'ElevenLabs API key not configured' });
  }

  const agentId = req.query.agent_id || process.env.VITE_ELEVENLABS_AGENT_ID;
  if (!agentId) {
    logger.error('No agent_id provided and VITE_ELEVENLABS_AGENT_ID not configured');
    return res.status(400).json({ error: 'agent_id is required' });
  }

  try {
    const url = `https://api.elevenlabs.io/v1/convai/conversation/get_signed_url?agent_id=${encodeURIComponent(agentId)}`;
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'xi-api-key': apiKey,
      },
    });

    if (!response.ok) {
      const body = await response.text();
      logger.error('ElevenLabs signed URL request failed', {
        status: response.status,
        body: body.substring(0, 200),
      });
      return res.status(502).json({ error: 'Failed to get signed URL from ElevenLabs' });
    }

    const data = await response.json();

    return res.json({ signed_url: data.signed_url });
  } catch (err) {
    logger.error('ElevenLabs signed URL error', { error: err.message });
    return res.status(500).json({ error: 'Internal error' });
  }
};
