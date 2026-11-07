/**
 * Owner-only retry for a restaurant's missing ElevenLabs agent.
 * The request body cannot choose the tenant or the agent configuration.
 */

const { verifyAuth } = require('./_lib/auth');
const { supabaseAdmin } = require('./_lib/supabase');
const { checkSubscription, requireFeature } = require('./_lib/subscription-middleware');
const { createSecureLogger } = require('./_lib/secure-logger');
const { validateElevenLabsVoiceId } = require('./_lib/validation');
const { checkAndApplyRateLimit } = require('./_lib/rate-limit');
const { createAgent, getOrCreateWebhookSecret } = require('./_services/elevenlabsAgentService');

const logger = createSecureLogger('ElevenLabsAgentCreate');
const DEFAULT_VOICE_ID = '21m00Tcm4TlvDq8ikWAM';

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  if (await checkAndApplyRateLimit(req, res, 'elevenlabs_agent_create', 10, 60)) return;

  const auth = await verifyAuth(req);
  if (auth.error) {
    return res.status(auth.status || 401).json({ success: false, error: auth.error });
  }
  req.user = auth.user;

  let subscriptionChecked = false;
  await checkSubscription(req, res, () => { subscriptionChecked = true; });
  if (!subscriptionChecked) return;

  let featureAllowed = false;
  requireFeature('voice_ai')(req, res, () => { featureAllowed = true; });
  if (!featureAllowed) return;

  try {
    const body = req.body || {};
    if (body.multi_tenant_mode) {
      return res.status(403).json({ success: false, error: 'Multi-tenant agent creation is not allowed' });
    }

    const userId = req.user?.sub || req.user?.id;
    if (!userId) {
      return res.status(403).json({ success: false, error: 'Restaurant owner required' });
    }

    // Service-role reads must be scoped by the verified user, never a body ID
    // or a tenant claim that may refer to a team member.
    const { data: config, error: readError } = await supabaseAdmin
      .schema('restaurant')
      .from('restaurant_config')
      .select('id, restaurant_name, voice_id, agent_language, phone, city, country, business_hours, agent_greeting, elevenlabs_agent_id')
      .eq('user_id', userId)
      .eq('is_active', true)
      .eq('is_demo', false)
      .maybeSingle();

    if (readError) {
      logger.error('Failed to read owner restaurant config', { error: readError.message });
      return res.status(500).json({ success: false, error: 'Failed to load restaurant' });
    }
    if (!config || (req.user.restaurant_id && req.user.restaurant_id !== config.id)
        || (body.restaurant_id != null && body.restaurant_id !== config.id)) {
      return res.status(403).json({ success: false, error: 'Restaurant owner required' });
    }
    if (config.elevenlabs_agent_id) {
      return res.status(409).json({ success: false, error: 'Restaurant already has an agent' });
    }

    const language = config.agent_language || 'en';
    const configuredVoice = config.voice_id && config.voice_id !== 'default'
      ? config.voice_id
      : (process.env[`ELEVENLABS_VOICE_ID_${language.toUpperCase()}`]
        || process.env.ELEVENLABS_DEFAULT_VOICE_ID || DEFAULT_VOICE_ID);
    const voiceCheck = validateElevenLabsVoiceId(configuredVoice);
    if (!voiceCheck.valid || !config.restaurant_name) {
      return res.status(400).json({ success: false, error: 'Restaurant voice configuration is incomplete' });
    }

    // The service permits tool creation without headers when secret lookup
    // fails. This owner retry must never create such an agent.
    if (!await getOrCreateWebhookSecret(config.id)) {
      return res.status(500).json({ success: false, error: 'Failed to secure agent tools' });
    }

    const result = await createAgent({
      restaurantId: config.id,
      restaurant_name: config.restaurant_name,
      voice_id: configuredVoice,
      language,
      phone: config.phone,
      address: [config.city, config.country].filter(Boolean).join(', '),
      business_hours: config.business_hours || {},
      custom_greeting: config.agent_greeting,
    });
    if (!result.success || !result.agent_id) {
      logger.error('ElevenLabs agent creation failed', { restaurantId: config.id, error: result.error });
      return res.status(502).json({ success: false, error: result.error || 'Failed to create agent' });
    }

    // A second retry may have linked an agent while the provider call ran.
    // Never overwrite that ID or report success if this write did not land.
    const { data: saved, error: writeError } = await supabaseAdmin
      .schema('restaurant')
      .from('restaurant_config')
      .update({ elevenlabs_agent_id: result.agent_id })
      .eq('id', config.id)
      .eq('user_id', userId)
      .eq('is_active', true)
      .eq('is_demo', false)
      .is('elevenlabs_agent_id', null)
      .select('id')
      .maybeSingle();

    if (writeError) {
      logger.error('Failed to link created agent', { restaurantId: config.id, error: writeError.message });
      return res.status(500).json({ success: false, error: 'Failed to save agent' });
    }
    if (!saved) {
      logger.warn('Created agent was not linked because restaurant changed', { restaurantId: config.id });
      return res.status(409).json({ success: false, error: 'Restaurant agent changed during creation' });
    }

    return res.status(200).json({
      success: true,
      agent_id: result.agent_id,
      agent_url: `https://elevenlabs.io/app/conversational-ai/${result.agent_id}`,
      voice_id: configuredVoice,
      language,
      tools_created: result.tools_created,
    });
  } catch (error) {
    logger.error('Error creating ElevenLabs agent', { error: error.message });
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
};
