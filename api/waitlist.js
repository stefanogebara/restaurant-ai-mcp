const {
  getWaitlistEntries,
  addToWaitlist,
  updateWaitlistEntry,
  removeFromWaitlist,
} = require('./_lib/supabase');
const twilio = require('twilio');
const { Resend } = require('resend');
const { createSecureLogger } = require('./_lib/secure-logger');
const { verifyAuth } = require('./_lib/auth');
const { setInternalCors, handlePreflight } = require('./_lib/cors');
const { checkAndApplyRateLimit } = require('./_lib/rate-limit');
const { validateWaitlistEntry, sanitizeInput } = require('./_lib/validation');
const { trackUsage } = require('./_lib/usage-tracking');
const { sendWhatsAppMessage, isWhatsAppConfigured } = require('./_lib/whatsapp-sender');
const { initSentry, captureException } = require('./_lib/sentry');
initSentry();

const logger = createSecureLogger('Waitlist');

/**
 * Waitlist Management API (Supabase)
 *
 * GET    /api/waitlist         - Get waitlist entries
 * POST   /api/waitlist         - Add to waitlist
 * PATCH  /api/waitlist?id=X    - Update entry
 * DELETE /api/waitlist?id=X    - Remove from waitlist
 */

module.exports = async (req, res) => {
  setInternalCors(req, res);
  if (handlePreflight(req, res)) return;

  const rateLimited = await checkAndApplyRateLimit(req, res, 'api');
  if (rateLimited) return;

  const auth = await verifyAuth(req);
  if (auth.error) {
    return res.status(auth.status).json({ error: auth.error });
  }
  req.user = auth.user;
  const restaurantId = auth.user.restaurant_id;

  if (!restaurantId) {
    return res.status(400).json({ error: 'No restaurant associated with this account' });
  }

  const { id } = req.query;

  try {
    switch (req.method) {
      case 'GET':
        return await handleGetWaitlist(req, res, restaurantId);
      case 'POST':
        return await handleAddToWaitlist(req, res, restaurantId);
      case 'PATCH':
        if (!id) return res.status(400).json({ error: 'Waitlist entry ID required' });
        return await handleUpdateWaitlist(req, res, id, restaurantId);
      case 'DELETE':
        if (!id) return res.status(400).json({ error: 'Waitlist entry ID required' });
        return await handleRemoveFromWaitlist(req, res, id, restaurantId);
      default:
        return res.status(405).json({ error: 'Method not allowed' });
    }
  } catch (error) {
    logger.error('Waitlist API error:', error);
    captureException(error, { method: req.method, url: req.url });
    return res.status(500).json({ error: 'Internal server error' });
  }
};

async function handleGetWaitlist(req, res, restaurantId) {
  const { status, active, limit } = req.query;

  const result = await getWaitlistEntries(restaurantId, {
    status,
    active: active === 'true',
    limit: parseInt(limit) || 100,
  });

  if (!result.success) {
    return res.status(500).json({ error: 'Failed to fetch waitlist' });
  }

  return res.status(200).json({
    success: true,
    count: result.entries.length,
    waitlist: result.entries,
  });
}

async function handleAddToWaitlist(req, res, restaurantId) {
  const { customer_name, customer_phone, customer_email, party_size, special_requests, estimated_wait } = req.body;

  const validation = validateWaitlistEntry({ customer_name, customer_phone, customer_email, party_size });
  if (!validation.valid) {
    return res.status(400).json({ error: 'Validation failed', details: validation.errors });
  }

  const result = await addToWaitlist(restaurantId, {
    customer_name: sanitizeInput(customer_name),
    customer_phone: sanitizeInput(customer_phone),
    party_size: parseInt(party_size),
    notes: special_requests ? sanitizeInput(special_requests) : null,
    estimated_wait_minutes: estimated_wait || calculateEstimatedWait(parseInt(party_size)),
  });

  if (!result.success) {
    return res.status(500).json({ error: 'Failed to add to waitlist' });
  }

  return res.status(201).json({
    success: true,
    message: 'Customer added to waitlist',
    waitlist_entry: result.entry,
  });
}

async function handleUpdateWaitlist(req, res, entryId, restaurantId) {
  const { status, estimated_wait, notes } = req.body;

  if (!status && estimated_wait === undefined && notes === undefined) {
    return res.status(400).json({ error: 'At least one field required for update' });
  }

  if (status) {
    const validStatuses = ['waiting', 'notified', 'seated', 'cancelled', 'no_show'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: `Invalid status. Must be one of: ${validStatuses.join(', ')}` });
    }
  }

  const updates = {};
  if (status) updates.status = status;
  if (estimated_wait !== undefined) updates.estimated_wait_minutes = estimated_wait;
  if (notes !== undefined) updates.notes = notes;
  if (status === 'notified') updates.notified_at = new Date().toISOString();

  const result = await updateWaitlistEntry(entryId, restaurantId, updates);

  if (!result.success) {
    return res.status(result.message?.includes('not found') ? 404 : 500).json({
      error: result.message || 'Failed to update waitlist entry',
    });
  }

  // Send notifications if status changed to 'notified'
  if (status === 'notified' && result.entry) {
    const entry = result.entry;
    // WhatsApp notification (preferred for WhatsApp-sourced entries)
    if (entry.customer_whatsapp && isWhatsAppConfigured()) {
      const waMessage = 'Sua mesa está pronta! Por favor, dirija-se à recepção. / Your table is ready! Please come to the host stand.';
      sendWhatsAppMessage(entry.customer_whatsapp, waMessage)
        .catch(err => logger.error('WhatsApp table-ready notification failed:', err));
    }
    // SMS fallback
    if (entry.customer_phone) {
      sendSMSNotification(entry.customer_name, entry.customer_phone, entry.party_size)
        .catch(err => logger.error('SMS notification failed:', err));
    }
  }

  return res.status(200).json({
    success: true,
    message: 'Waitlist entry updated',
    waitlist_entry: result.entry,
  });
}

async function handleRemoveFromWaitlist(req, res, entryId, restaurantId) {
  const result = await removeFromWaitlist(entryId, restaurantId);

  if (!result.success) {
    return res.status(500).json({ error: 'Failed to remove from waitlist' });
  }

  return res.status(200).json({
    success: true,
    message: 'Customer removed from waitlist',
    deleted_id: entryId,
  });
}

function calculateEstimatedWait(partySize) {
  let wait = 15;
  if (partySize >= 6) wait = 25;
  else if (partySize >= 4) wait = 20;
  return Math.ceil(wait / 5) * 5;
}

async function sendSMSNotification(customerName, customerPhone, partySize) {
  if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN || !process.env.TWILIO_PHONE_NUMBER) {
    return false;
  }
  try {
    const twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
    await twilioClient.messages.create({
      body: `Hi ${customerName}! Your table for ${partySize} ${partySize === 1 ? 'person' : 'people'} is ready! Please come to the host stand.`,
      from: process.env.TWILIO_PHONE_NUMBER,
      to: customerPhone,
    });
    logger.info(`SMS sent to ${customerPhone}`);
    return true;
  } catch (error) {
    logger.error('Failed to send SMS:', error);
    return false;
  }
}
