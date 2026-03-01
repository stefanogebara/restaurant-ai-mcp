const { runManagerAgent, ManagerQuotaError } = require('./_lib/manager-agent');
const { supabaseAdmin } = require('./_lib/supabase');
const { sendWhatsAppMessage } = require('./_lib/whatsapp-sender');
const { createSecureLogger } = require('./_lib/secure-logger');

const logger = createSecureLogger('manager-whatsapp');

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { From, Body, MessageSid } = req.body || {};

  try {
    if (!From || !Body) return res.status(200).send('OK');

    const phone = From.replace('whatsapp:', '');

    const { data: config } = await supabaseAdmin
      .from('restaurant_config')
      .select('id, manager_phone, manager_whatsapp_verified')
      .eq('manager_phone', phone)
      .single();

    if (!config || !config.manager_whatsapp_verified) {
      logger.info('manager-whatsapp: unknown or unverified phone', { MessageSid });
      return res.status(200).send('OK');
    }

    let reply;
    try {
      reply = await runManagerAgent(config.id, Body.trim(), 'whatsapp');
    } catch (agentErr) {
      if (agentErr instanceof ManagerQuotaError && agentErr.type === 'quota_exceeded') {
        await sendWhatsAppMessage(phone, `You've reached your ${agentErr.limit} message limit for this month. Upgrade to Growth for 500/mo — seatable.io/pricing`);
      }
      return res.status(200).send('OK');
    }

    await sendWhatsAppMessage(phone, reply);

    return res.status(200).send('OK');
  } catch (err) {
    logger.error('manager-whatsapp error', { MessageSid, error: err.message });
    return res.status(200).send('OK');
  }
};
