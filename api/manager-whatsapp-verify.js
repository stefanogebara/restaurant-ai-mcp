const { verifyJWT } = require('./_lib/auth');
const { supabaseAdmin } = require('./_lib/supabase');
const { sendWhatsAppMessage } = require('./_lib/whatsapp-sender');
const { createSecureLogger } = require('./_lib/secure-logger');
const { checkAndApplyRateLimit, checkRateLimit } = require('./_lib/rate-limit');

const logger = createSecureLogger('manager-whatsapp-verify');

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const token = (req.headers.authorization || '').replace('Bearer ', '');
    const user = await verifyJWT(token);
    if (!user?.restaurant_id) throw new Error('UNAUTHORIZED');
    const restaurantId = user.restaurant_id;
    const { action, phone, code } = req.body || {};

    if (action === 'send') {
      const sendRateResult = await checkRateLimit(`restaurant:${restaurantId}`, 'otp-send');
      res.setHeader('X-RateLimit-Limit', sendRateResult.limit);
      res.setHeader('X-RateLimit-Remaining', sendRateResult.remaining);
      res.setHeader('X-RateLimit-Reset', sendRateResult.resetSeconds);
      if (!sendRateResult.allowed) {
        res.setHeader('Retry-After', sendRateResult.resetSeconds);
        return res.status(429).json({
          error: 'Too Many Requests',
          message: sendRateResult.message,
          retryAfter: sendRateResult.resetSeconds,
        });
      }

      if (!phone) return res.status(400).json({ error: 'phone is required' });

      const phoneRegex = /^\+[1-9]\d{7,14}$/;
      if (!phoneRegex.test(phone)) {
        return res.status(400).json({ error: 'Phone must be in E.164 format (e.g., +15551234567)' });
      }

      const verificationCode = String(require('crypto').randomInt(100000, 1000000));

      const { error: updateError } = await supabaseAdmin
        .schema('restaurant')
        .from('restaurant_config')
        .update({
          manager_phone: phone,
          manager_whatsapp_code: verificationCode,
          manager_whatsapp_verified: false,
          manager_whatsapp_code_expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
        })
        .eq('id', restaurantId);
      if (updateError) throw new Error(updateError.message);

      const sendResult = await sendWhatsAppMessage(
        phone,
        'Your Seatable verification code is: ' + verificationCode + '. It expires in 10 minutes.'
      );
      if (!sendResult.success) {
        logger.error('Failed to send verification code via WhatsApp', { phone, error: sendResult.error });
        return res.status(502).json({ error: 'Failed to send WhatsApp message. Please check the phone number.' });
      }

      return res.json({ sent: true });
    }

    if (action === 'confirm') {
      if (await checkAndApplyRateLimit(req, res, 'otp')) return;
      if (!code) return res.status(400).json({ error: 'code is required' });

      const { data, error } = await supabaseAdmin
        .schema('restaurant')
        .from('restaurant_config')
        .select('manager_whatsapp_code, manager_whatsapp_code_expires_at')
        .eq('id', restaurantId)
        .single();

      if (error) throw new Error(error.message);

      if (!data || !data.manager_whatsapp_code) {
        return res.status(400).json({ error: 'No verification code found. Please request a new one.' });
      }

      if (data.manager_whatsapp_code_expires_at && new Date(data.manager_whatsapp_code_expires_at) < new Date()) {
        return res.status(400).json({ error: 'Verification code expired' });
      }

      if (data.manager_whatsapp_code !== code) {
        return res.status(400).json({ error: 'Invalid verification code' });
      }

      await supabaseAdmin
        .schema('restaurant')
        .from('restaurant_config')
        .update({ manager_whatsapp_verified: true, manager_whatsapp_code: null, manager_whatsapp_code_expires_at: null })
        .eq('id', restaurantId);

      return res.json({ verified: true });
    }

    return res.status(400).json({ error: 'action must be send or confirm' });
  } catch (err) {
    logger.error('verify error', { error: err.message });
    if (err.message === 'UNAUTHORIZED') return res.status(401).json({ error: 'Unauthorized' });
    return res.status(500).json({ error: 'Internal error' });
  }
};
