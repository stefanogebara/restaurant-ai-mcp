const { verifyJWT } = require('./_lib/auth');
const { supabaseAdmin } = require('./_lib/supabase');
const { sendWhatsAppMessage } = require('./_lib/whatsapp-sender');
const { createSecureLogger } = require('./_lib/secure-logger');

const logger = createSecureLogger('manager-whatsapp-verify');

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const token = (req.headers.authorization || '').replace('Bearer ', '');
    const { restaurantId } = verifyJWT(token);
    const { action, phone, code } = req.body || {};

    if (action === 'send') {
      if (!phone) return res.status(400).json({ error: 'phone is required' });

      const verificationCode = String(Math.floor(100000 + Math.random() * 900000));
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

      await supabaseAdmin
        .from('restaurant_config')
        .update({
          manager_phone: phone,
          manager_whatsapp_code: verificationCode,
          manager_whatsapp_code_expires_at: expiresAt,
          manager_whatsapp_verified: false,
        })
        .eq('id', restaurantId);

      await sendWhatsAppMessage(
        phone,
        'Your Seatable verification code is: ' + verificationCode + '. It expires in 10 minutes.',
        restaurantId
      );

      return res.json({ sent: true });
    }

    if (action === 'confirm') {
      if (!code) return res.status(400).json({ error: 'code is required' });

      const { data, error } = await supabaseAdmin
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
