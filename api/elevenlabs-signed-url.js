const { verifyJWT } = require('./_lib/auth');
const { supabaseAdmin } = require('./_lib/supabase');
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
    return res.status(401).json({ error: 'Authentication required' });
  }

  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    logger.error('ELEVENLABS_API_KEY not configured');
    return res.status(500).json({ error: 'ElevenLabs API key not configured' });
  }

  // Resolve the agent_id this user is allowed to issue a signed URL for.
  //
  // The browser may pass ?agent_id=... but it has NO authority — we ALWAYS
  // look up the caller's own restaurant_id → elevenlabs_agent_id from the
  // DB and use THAT. The query param is honored ONLY when it matches what
  // the user already owns (which is just a sanity check / legacy path),
  // or when there is no DB-resolved agent and we fall through to the
  // global demo agent. Previously the query param was used verbatim,
  // which would let any authenticated user open a conversation against
  // any other restaurant's voice agent by guessing the ID.
  const restaurantId = user.restaurant_id;
  let ownedAgentId = null;
  if (restaurantId) {
    const { data: config } = await supabaseAdmin
      .schema('restaurant')
      .from('restaurant_config')
      .select('elevenlabs_agent_id')
      .eq('id', restaurantId)
      .single();
    ownedAgentId = config?.elevenlabs_agent_id || null;
  }

  const requestedAgentId = req.query.agent_id;
  let agentId = ownedAgentId;

  if (requestedAgentId) {
    if (ownedAgentId && requestedAgentId === ownedAgentId) {
      // Caller explicitly named their own agent — fine.
      agentId = ownedAgentId;
    } else if (!ownedAgentId && requestedAgentId === (process.env.ELEVENLABS_AGENT_ID || process.env.VITE_ELEVENLABS_AGENT_ID)) {
      // No owned agent (e.g. fresh signup mid-onboarding) AND caller asked
      // for the public demo agent — also fine.
      agentId = requestedAgentId;
    } else {
      // Cross-tenant request — reject.
      logger.warn('signed-url cross-tenant agent_id rejected', { userRestaurantId: restaurantId });
      return res.status(403).json({ error: 'You do not own this agent' });
    }
  }

  // Final fallback to global agent (demo/testing) when nothing resolved.
  if (!agentId) {
    agentId = process.env.ELEVENLABS_AGENT_ID || process.env.VITE_ELEVENLABS_AGENT_ID;
  }
  if (!agentId) {
    logger.error('No agent_id resolved and ELEVENLABS_AGENT_ID not configured');
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
