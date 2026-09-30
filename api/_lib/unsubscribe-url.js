const crypto = require('crypto');

function buildUnsubscribeUrl(restaurantId, customerPhone) {
  const secret = process.env.CRON_SECRET;
  if (!secret) throw new Error('CRON_SECRET is not configured');
  const payload = `${restaurantId}:${customerPhone}`;
  const signature = crypto.createHmac('sha256', secret).update(payload).digest('hex');
  const baseUrl = process.env.CLIENT_URL || 'https://seatable.one';
  return `${baseUrl}/api/campaign-unsubscribe?rid=${encodeURIComponent(restaurantId)}&phone=${encodeURIComponent(customerPhone)}&sig=${signature}`;
}

module.exports = { buildUnsubscribeUrl };
