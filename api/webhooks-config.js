/**
 * Webhook Subscriptions Management Endpoint
 *
 * GET    /api/webhooks-config?action=list   — List webhook subscriptions
 * POST   /api/webhooks-config?action=create — Create subscription
 * DELETE /api/webhooks-config?action=delete — Remove subscription
 * POST   /api/webhooks-config?action=test   — Send test ping
 *
 * All actions require JWT authentication (restaurant owner/manager).
 */

const crypto = require('crypto');
const { verifyAuth } = require('./_lib/auth');
const { signPayload } = require('./services/webhookDispatcher');
const { supabaseAdmin } = require('./_lib/supabase');
const { setInternalCors, handlePreflight } = require('./_lib/cors');
const { checkAndApplyRateLimit, rejectOversizedBody } = require('./_lib/rate-limit');
const { createSecureLogger } = require('./_lib/secure-logger');

const logger = createSecureLogger('WebhooksConfig');

// Valid event types
const VALID_EVENTS = [
  '*',
  'reservation.created',
  'reservation.updated',
  'reservation.cancelled',
  'service.completed',
  'table.status_changed',
];

module.exports = async (req, res) => {
  setInternalCors(req, res);
  if (handlePreflight(req, res)) return;
  if (rejectOversizedBody(req, res)) return;

  const rateLimited = await checkAndApplyRateLimit(req, res, 'api');
  if (rateLimited) return;

  // Authenticate
  const auth = await verifyAuth(req);
  if (auth.error) {
    return res.status(auth.status || 401).json({ error: auth.error });
  }

  const restaurantId = auth.user.restaurant_id;
  if (!restaurantId) {
    return res.status(403).json({ error: 'No restaurant associated with your account' });
  }

  const { action } = req.query;

  try {
    switch (action) {
      case 'list':
        return await handleList(req, res, restaurantId);
      case 'create':
        return await handleCreate(req, res, restaurantId);
      case 'delete':
        return await handleDelete(req, res, restaurantId);
      case 'test':
        return await handleTest(req, res, restaurantId);
      default:
        return res.status(400).json({ error: 'Invalid action. Use: list, create, delete, test' });
    }
  } catch (err) {
    logger.error('Webhooks config error', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

async function handleList(req, res, restaurantId) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { data, error } = await supabaseAdmin
    .schema('restaurant')
    .from('webhook_subscriptions')
    .select('id, url, events, is_active, last_triggered_at, failure_count, created_at')
    .eq('restaurant_id', restaurantId)
    .order('created_at', { ascending: false });

  if (error) {
    logger.error('Failed to list webhooks', error);
    return res.status(500).json({ error: 'Failed to list webhooks' });
  }

  return res.status(200).json({
    success: true,
    webhooks: data || [],
    available_events: VALID_EVENTS,
  });
}

async function handleCreate(req, res, restaurantId) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { url, events = ['*'] } = req.body || {};

  if (!url || typeof url !== 'string') {
    return res.status(400).json({ error: 'url is required' });
  }

  // Validate URL format
  try {
    const parsed = new URL(url);
    if (!['https:', 'http:'].includes(parsed.protocol)) {
      return res.status(400).json({ error: 'URL must use HTTPS or HTTP protocol' });
    }
  } catch {
    return res.status(400).json({ error: 'Invalid URL format' });
  }

  // Validate events
  const invalidEvents = events.filter((e) => !VALID_EVENTS.includes(e));
  if (invalidEvents.length > 0) {
    return res.status(400).json({
      error: `Invalid events: ${invalidEvents.join(', ')}`,
      valid_events: VALID_EVENTS,
    });
  }

  // Limit to 10 webhook subscriptions per restaurant
  const { count } = await supabaseAdmin
    .schema('restaurant')
    .from('webhook_subscriptions')
    .select('id', { count: 'exact', head: true })
    .eq('restaurant_id', restaurantId)
    .eq('is_active', true);

  if (count >= 10) {
    return res.status(400).json({ error: 'Maximum of 10 active webhook subscriptions per restaurant' });
  }

  // Auto-generate secret
  const secret = crypto.randomBytes(32).toString('hex');

  const { data, error } = await supabaseAdmin
    .schema('restaurant')
    .from('webhook_subscriptions')
    .insert({
      restaurant_id: restaurantId,
      url,
      secret,
      events,
    })
    .select('id, url, events, created_at')
    .single();

  if (error) {
    logger.error('Failed to create webhook', error);
    return res.status(500).json({ error: 'Failed to create webhook subscription' });
  }

  logger.info('Webhook subscription created', { id: data.id, url, restaurant: restaurantId });

  return res.status(201).json({
    success: true,
    webhook: {
      id: data.id,
      url: data.url,
      events: data.events,
      secret,
      created_at: data.created_at,
    },
    message: 'Save the secret now. It will not be shown again.',
  });
}

async function handleDelete(req, res, restaurantId) {
  if (req.method !== 'DELETE' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const webhookId = req.body?.webhook_id || req.query?.webhook_id;

  if (!webhookId) {
    return res.status(400).json({ error: 'webhook_id is required' });
  }

  const { data, error } = await supabaseAdmin
    .schema('restaurant')
    .from('webhook_subscriptions')
    .delete()
    .eq('id', webhookId)
    .eq('restaurant_id', restaurantId)
    .select('id, url')
    .single();

  if (error || !data) {
    return res.status(404).json({ error: 'Webhook subscription not found' });
  }

  logger.info('Webhook subscription deleted', { id: data.id, url: data.url });

  return res.status(200).json({
    success: true,
    message: 'Webhook subscription deleted',
  });
}

async function handleTest(req, res, restaurantId) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { webhook_id } = req.body || {};

  if (!webhook_id) {
    return res.status(400).json({ error: 'webhook_id is required' });
  }

  const { data: sub, error } = await supabaseAdmin
    .schema('restaurant')
    .from('webhook_subscriptions')
    .select('id, url, secret')
    .eq('id', webhook_id)
    .eq('restaurant_id', restaurantId)
    .single();

  if (error || !sub) {
    return res.status(404).json({ error: 'Webhook subscription not found' });
  }

  // Send test ping
  const testPayload = JSON.stringify({
    event: 'test.ping',
    timestamp: new Date().toISOString(),
    data: { message: 'This is a test webhook from Seatable' },
  });

  const signature = signPayload(testPayload, sub.secret);

  try {
    const response = await fetch(sub.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Webhook-Signature': signature,
        'X-Webhook-Event': 'test.ping',
        'User-Agent': 'Seatable-Webhooks/1.0',
      },
      body: testPayload,
      signal: AbortSignal.timeout(10000),
    });

    return res.status(200).json({
      success: response.ok,
      status_code: response.status,
      message: response.ok
        ? 'Test webhook delivered successfully'
        : `Webhook endpoint returned ${response.status}`,
    });
  } catch (err) {
    return res.status(200).json({
      success: false,
      message: `Failed to reach webhook endpoint: ${err.message}`,
    });
  }
}
