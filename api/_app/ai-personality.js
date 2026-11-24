const { verifyJWT } = require('./_lib/auth');
const { supabaseAdmin } = require('./_lib/supabase');
const { createSecureLogger } = require('./_lib/secure-logger');
const { checkAndApplyRateLimit } = require('./_lib/rate-limit');

const logger = createSecureLogger('ai-personality');

const VALID_HUMOR_TYPES = ['none', 'light', 'witty', 'warm', 'playful'];
const VALID_COMM_STYLES = ['formal', 'casual', 'friendly_professional'];
const VALID_LANGUAGE_TONES = ['enthusiastic', 'calm', 'neutral', 'warm'];
const MAX_TRAITS = 5;
const MAX_TRAIT_LENGTH = 50;
const MAX_QUIRKS_LENGTH = 300;

module.exports = async (req, res) => {
  if (await checkAndApplyRateLimit(req, res, 'api')) return;
  if (req.method === 'GET') return handleGet(req, res);
  if (req.method === 'PATCH') return handlePatch(req, res);
  return res.status(405).json({ error: 'Method not allowed' });
};

async function handleGet(req, res) {
  try {
    const user = await verifyJWT(req.headers.authorization?.replace('Bearer ', ''));
    if (!user?.restaurant_id) throw new Error('UNAUTHORIZED');
    const restaurantId = user.restaurant_id;

    const { data, error } = await supabaseAdmin
      .schema('restaurant')
      .from('restaurant_config')
      .select('ai_personality')
      .eq('id', restaurantId)
      .single();

    if (error) {
      logger.warn('ai-personality GET query error, returning defaults', { error: error.message });
      return res.json(buildDefaults());
    }

    return res.json(normalizePersonality(data?.ai_personality));
  } catch (err) {
    if (err.message === 'UNAUTHORIZED') return res.status(401).json({ error: 'Authentication required' });
    logger.error('ai-personality GET error', { error: err.message });
    return res.status(500).json({ error: 'Internal error' });
  }
}

async function handlePatch(req, res) {
  try {
    const user = await verifyJWT(req.headers.authorization?.replace('Bearer ', ''));
    if (!user?.restaurant_id) throw new Error('UNAUTHORIZED');
    const restaurantId = user.restaurant_id;

    const body = req.body || {};
    const validationError = validatePersonality(body);
    if (validationError) {
      return res.status(400).json({ error: validationError });
    }

    // Build sanitized personality object (only include provided fields)
    const personality = {};
    if (body.humor_type !== undefined) personality.humor_type = body.humor_type;
    if (body.personality_traits !== undefined) personality.personality_traits = body.personality_traits;
    if (body.communication_style !== undefined) personality.communication_style = body.communication_style;
    if (body.verbal_quirks !== undefined) personality.verbal_quirks = body.verbal_quirks;
    if (body.language_tone !== undefined) personality.language_tone = body.language_tone;

    // Merge with existing personality config (immutable — fetch, merge, write)
    const { data: existing } = await supabaseAdmin
      .schema('restaurant')
      .from('restaurant_config')
      .select('ai_personality')
      .eq('id', restaurantId)
      .single();

    const merged = { ...(existing?.ai_personality || {}), ...personality };

    const { data, error } = await supabaseAdmin
      .schema('restaurant')
      .from('restaurant_config')
      .update({ ai_personality: merged })
      .eq('id', restaurantId)
      .select('ai_personality')
      .single();

    if (error) throw new Error(error.message);

    logger.info('ai personality updated', { restaurantId });
    return res.json(normalizePersonality(data.ai_personality));
  } catch (err) {
    if (err.message === 'UNAUTHORIZED') return res.status(401).json({ error: 'Authentication required' });
    logger.error('ai-personality PATCH error', { error: err.message });
    return res.status(500).json({ error: 'Internal error' });
  }
}

function validatePersonality(body) {
  if (body.humor_type !== undefined && !VALID_HUMOR_TYPES.includes(body.humor_type)) {
    return `humor_type must be one of: ${VALID_HUMOR_TYPES.join(', ')}`;
  }
  if (body.communication_style !== undefined && !VALID_COMM_STYLES.includes(body.communication_style)) {
    return `communication_style must be one of: ${VALID_COMM_STYLES.join(', ')}`;
  }
  if (body.language_tone !== undefined && !VALID_LANGUAGE_TONES.includes(body.language_tone)) {
    return `language_tone must be one of: ${VALID_LANGUAGE_TONES.join(', ')}`;
  }
  if (body.personality_traits !== undefined) {
    if (!Array.isArray(body.personality_traits)) return 'personality_traits must be an array';
    if (body.personality_traits.length > MAX_TRAITS) return `personality_traits max ${MAX_TRAITS} items`;
    for (const trait of body.personality_traits) {
      if (typeof trait !== 'string' || trait.length > MAX_TRAIT_LENGTH) {
        return `Each trait must be a string of max ${MAX_TRAIT_LENGTH} characters`;
      }
    }
  }
  if (body.verbal_quirks !== undefined) {
    if (typeof body.verbal_quirks !== 'string') return 'verbal_quirks must be a string';
    if (body.verbal_quirks.length > MAX_QUIRKS_LENGTH) return `verbal_quirks max ${MAX_QUIRKS_LENGTH} characters`;
  }
  return null;
}

function buildDefaults() {
  return {
    humor_type: 'warm',
    personality_traits: [],
    communication_style: 'friendly_professional',
    verbal_quirks: '',
    language_tone: 'warm',
  };
}

function normalizePersonality(raw) {
  const defaults = buildDefaults();
  if (!raw || typeof raw !== 'object') return defaults;
  return {
    humor_type: VALID_HUMOR_TYPES.includes(raw.humor_type) ? raw.humor_type : defaults.humor_type,
    personality_traits: Array.isArray(raw.personality_traits) ? raw.personality_traits.slice(0, MAX_TRAITS) : defaults.personality_traits,
    communication_style: VALID_COMM_STYLES.includes(raw.communication_style) ? raw.communication_style : defaults.communication_style,
    verbal_quirks: typeof raw.verbal_quirks === 'string' ? raw.verbal_quirks : defaults.verbal_quirks,
    language_tone: VALID_LANGUAGE_TONES.includes(raw.language_tone) ? raw.language_tone : defaults.language_tone,
  };
}

// Export for use in WhatsApp prompt builder
module.exports.buildDefaults = buildDefaults;
module.exports.normalizePersonality = normalizePersonality;
