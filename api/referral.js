/**
 * Referral Program API
 *
 * Actions:
 *   GET  ?action=code   - Get (or generate) referral code for authenticated restaurant
 *   POST ?action=track  - Validate a referral code (public, no auth)
 *   POST ?action=attach - Attach a referral to a new restaurant during onboarding
 */

const { supabaseAdmin } = require('./_lib/supabase');
const { verifyAuth } = require('./_lib/auth');
const { checkAndApplyRateLimit } = require('./_lib/rate-limit');
const { createSecureLogger } = require('./_lib/secure-logger');
const { setInternalCors, handlePreflight } = require('./_lib/cors');
const logger = createSecureLogger('Referral');

const BASE_URL = process.env.CLIENT_URL || 'https://restaurant-ai-mcp.vercel.app';

function generateCode() {
  const words = ['BELLA', 'PRIMO', 'GUSTO', 'FORNO', 'CIBO', 'VINO', 'PASTO', 'TAVOLA'];
  const word  = words[Math.floor(Math.random() * words.length)];
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const suffix = Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  return `${word}-${suffix}`;
}

module.exports = async (req, res) => {
  setInternalCors(req, res);
  if (handlePreflight(req, res)) return;

  const action = req.query.action || (req.body && req.body.action);
  const rateLimited = await checkAndApplyRateLimit(req, res, 'api');
  if (rateLimited) return;

  try {
    switch (action) {
      case 'code':   return await handleGetCode(req, res);
      case 'track':  return await handleTrack(req, res);
      case 'attach': return await handleAttach(req, res);
      default:
        return res.status(400).json({ success: false, message: 'Invalid action' });
    }
  } catch (error) {
    logger.error('Unhandled error:', error);
    return res.status(500).json({ success: false, message: 'Something went wrong' });
  }
};

async function handleGetCode(req, res) {
  const auth = await verifyAuth(req);
  if (auth.error) return res.status(auth.status).json({ error: auth.error });

  const restaurantId = auth.user?.restaurant_id;
  if (!restaurantId) {
    return res.status(400).json({ success: false, message: 'No restaurant associated with this account' });
  }

  const { data: config, error } = await supabaseAdmin
    .schema('restaurant')
    .from('restaurant_config')
    .select('*')
    .eq('id', restaurantId)
    .single();

  if (error || !config) {
    return res.status(404).json({ success: false, message: 'Restaurant not found' });
  }

  let code = config.referral_code || null;

  if (!code) {
    code = generateCode();
    const { error: updateError } = await supabaseAdmin
      .schema('restaurant')
      .from('restaurant_config')
      .update({ referral_code: code })
      .eq('id', restaurantId);

    if (updateError) {
      // Column may not exist yet — return a temporary code without persisting
      logger.warn('[Referral] Could not persist referral code (column may be missing):', updateError.message);
    }
  }

  const { data: referrals } = await supabaseAdmin
    .from('referrals')
    .select('status')
    .eq('referral_code', code)
    .throwOnError()
    .catch(() => ({ data: [] }));

  const all = referrals || [];
  const pending   = all.filter(r => r.status === 'pending').length;
  const converted = all.filter(r => r.status === 'converted' || r.status === 'rewarded').length;

  return res.status(200).json({
    success: true,
    code,
    referral_url: `${BASE_URL}/?ref=${code}`,
    stats: { pending, converted, total: all.length },
  });
}

async function handleTrack(req, res) {
  const code = req.body?.code || req.body?.referral_code || req.query.code;
  if (!code || code.length > 20) {
    return res.status(400).json({ success: false, message: 'Missing or invalid code' });
  }

  const { data } = await supabaseAdmin
    .schema('restaurant')
    .from('restaurant_config')
    .select('id')
    .eq('referral_code', code.toUpperCase())
    .eq('is_active', true)
    .single();

  return res.status(200).json({ valid: !!data });
}

async function handleAttach(req, res) {
  const { referral_code } = req.body || {};
  if (!referral_code) {
    return res.status(400).json({ success: false, message: 'Missing referral_code' });
  }

  const auth = await verifyAuth(req);
  if (auth.error) return res.status(auth.status).json({ error: auth.error });

  const restaurant_id = auth.user?.restaurant_id;
  if (!restaurant_id) {
    return res.status(400).json({ success: false, message: 'No restaurant associated with this account' });
  }

  const code = referral_code.toUpperCase();

  const { data: referrer } = await supabaseAdmin
    .schema('restaurant')
    .from('restaurant_config')
    .select('id')
    .eq('referral_code', code)
    .eq('is_active', true)
    .single();

  if (!referrer) return res.status(200).json({ success: true, attached: false });
  if (referrer.id === restaurant_id) return res.status(200).json({ success: true, attached: false });

  const { data: existing } = await supabaseAdmin
    .from('referrals')
    .select('id')
    .eq('referee_id', restaurant_id)
    .limit(1)
    .single();

  if (existing) return res.status(200).json({ success: true, attached: true, already_existed: true });

  const { error } = await supabaseAdmin
    .from('referrals')
    .insert({ referral_code: code, referrer_id: referrer.id, referee_id: restaurant_id, status: 'pending' });

  if (error) {
    logger.error('Failed to attach referral:', error.message);
    return res.status(500).json({ success: false, message: 'Failed to attach referral' });
  }

  logger.info(`Referral attached: ${code} -> ${restaurant_id}`);
  return res.status(200).json({ success: true, attached: true });
}
