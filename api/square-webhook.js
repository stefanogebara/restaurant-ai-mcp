/**
 * Square Webhook Handler
 *
 * Handles incoming webhooks from Square POS for real-time payment updates.
 *
 * Events handled:
 * - payment.completed - Create revenue record
 * - payment.updated - Update revenue record
 * - payment.canceled - Remove/mark revenue record
 */

const { supabaseAdmin } = require('./_lib/supabase');
const { createSecureLogger } = require('./_lib/secure-logger');
const { setWebhookCors, handlePreflight } = require('./_lib/cors');
const {
  getAccessToken,
  matchCustomerToReservation,
  paymentToRevenueRecord
} = require('./services/squareService');
const { calculateCustomerLTV, upsertCustomerLTV } = require('./services/ltvCalculator');
const crypto = require('crypto');

const logger = createSecureLogger('SquareWebhook');

module.exports = async (req, res) => {
  // Set CORS headers for webhooks
  setWebhookCors(req, res);
  if (handlePreflight(req, res)) return;

  // Only accept POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Get the raw body for signature verification
    const rawBody = typeof req.body === 'string'
      ? req.body
      : JSON.stringify(req.body);

    // Verify webhook signature if configured
    const signature = req.headers['x-square-hmacsha256-signature'];
    if (process.env.SQUARE_WEBHOOK_SIGNATURE_KEY && signature) {
      const isValid = verifySquareSignature(
        rawBody,
        signature,
        process.env.SQUARE_WEBHOOK_SIGNATURE_KEY
      );

      if (!isValid) {
        logger.error('Invalid webhook signature');
        return res.status(401).json({ error: 'Invalid signature' });
      }
    }

    const event = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;

    logger.info(`Received Square webhook: ${event.type}`);

    // Handle different event types
    switch (event.type) {
      case 'payment.completed':
        return await handlePaymentCompleted(event, res);

      case 'payment.updated':
        return await handlePaymentUpdated(event, res);

      case 'payment.canceled':
        return await handlePaymentCanceled(event, res);

      default:
        logger.info(`Unhandled event type: ${event.type}`);
        return res.status(200).json({ received: true, handled: false });
    }

  } catch (error) {
    logger.error('Square webhook error:', error);
    return res.status(500).json({
      error: 'Internal server error',
      details: error.message
    });
  }
};

/**
 * Verify Square webhook signature
 */
function verifySquareSignature(body, signature, key) {
  try {
    // Square uses HMAC-SHA256
    const hmac = crypto.createHmac('sha256', key);
    hmac.update(body);
    const expectedSignature = hmac.digest('base64');

    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expectedSignature)
    );
  } catch (error) {
    logger.error('Signature verification error:', error);
    return false;
  }
}

/**
 * Handle payment.completed event
 * Creates a new revenue record
 */
async function handlePaymentCompleted(event, res) {
  const payment = event.data?.object?.payment;

  if (!payment) {
    logger.error('No payment data in event');
    return res.status(400).json({ error: 'No payment data' });
  }

  // Skip if already processed (idempotency)
  const { data: existing } = await supabaseAdmin
    .from('revenue_records')
    .select('id')
    .eq('pos_transaction_id', payment.id)
    .single();

  if (existing) {
    logger.info(`Payment ${payment.id} already processed`);
    return res.status(200).json({ received: true, already_processed: true });
  }

  // Find the restaurant by merchant_id
  const { data: connection } = await supabaseAdmin
    .from('pos_connections')
    .select('restaurant_id, access_token')
    .eq('merchant_id', event.merchant_id)
    .eq('status', 'active')
    .single();

  if (!connection) {
    logger.error(`No active connection for merchant ${event.merchant_id}`);
    return res.status(200).json({ received: true, no_connection: true });
  }

  try {
    // Match customer to reservation
    const matchResult = await matchCustomerToReservation(payment, connection.access_token);

    // Convert to revenue record
    const revenueRecord = paymentToRevenueRecord(
      payment,
      matchResult,
      connection.restaurant_id
    );

    // Insert revenue record
    const { data: inserted, error } = await supabaseAdmin
      .from('revenue_records')
      .insert(revenueRecord)
      .select()
      .single();

    if (error) {
      logger.error('Error inserting revenue record:', error);
      return res.status(500).json({ error: 'Failed to insert revenue record' });
    }

    logger.info(`Created revenue record ${inserted.id} from payment ${payment.id}`);

    // Trigger LTV recalculation
    if (matchResult.customerId) {
      try {
        const ltv = await calculateCustomerLTV(matchResult.customerId);
        await upsertCustomerLTV(ltv);
        logger.info(`Updated LTV for ${matchResult.customerId}`);
      } catch (ltvError) {
        logger.error('Error recalculating LTV:', ltvError);
      }
    }

    return res.status(200).json({
      received: true,
      revenue_record_id: inserted.id
    });

  } catch (error) {
    logger.error('Error processing payment:', error);
    throw error;
  }
}

/**
 * Handle payment.updated event
 * Updates existing revenue record
 */
async function handlePaymentUpdated(event, res) {
  const payment = event.data?.object?.payment;

  if (!payment) {
    return res.status(400).json({ error: 'No payment data' });
  }

  // Find existing revenue record
  const { data: existing } = await supabaseAdmin
    .from('revenue_records')
    .select('*')
    .eq('pos_transaction_id', payment.id)
    .single();

  if (!existing) {
    // Payment wasn't recorded yet, treat as completed
    logger.info(`Payment ${payment.id} not found, treating as new`);
    return handlePaymentCompleted(event, res);
  }

  // Update amounts
  const totalAmount = (payment.total_money?.amount || 0) / 100;
  const tipAmount = (payment.tip_money?.amount || 0) / 100;

  const { error } = await supabaseAdmin
    .from('revenue_records')
    .update({
      total_revenue: totalAmount - tipAmount,
      tip_amount: tipAmount
    })
    .eq('id', existing.id);

  if (error) {
    logger.error('Error updating revenue record:', error);
    return res.status(500).json({ error: 'Failed to update revenue record' });
  }

  logger.info(`Updated revenue record ${existing.id} from payment ${payment.id}`);

  // Trigger LTV recalculation
  if (existing.customer_id) {
    try {
      const ltv = await calculateCustomerLTV(existing.customer_id);
      await upsertCustomerLTV(ltv);
    } catch (ltvError) {
      logger.error('Error recalculating LTV:', ltvError);
    }
  }

  return res.status(200).json({
    received: true,
    updated: true
  });
}

/**
 * Handle payment.canceled event
 * Marks revenue record as deleted
 */
async function handlePaymentCanceled(event, res) {
  const payment = event.data?.object?.payment;

  if (!payment) {
    return res.status(400).json({ error: 'No payment data' });
  }

  // Find and soft delete revenue record
  const { data: existing } = await supabaseAdmin
    .from('revenue_records')
    .select('*')
    .eq('pos_transaction_id', payment.id)
    .single();

  if (!existing) {
    logger.info(`Payment ${payment.id} not found for cancellation`);
    return res.status(200).json({ received: true, not_found: true });
  }

  const { error } = await supabaseAdmin
    .from('revenue_records')
    .update({ is_deleted: true })
    .eq('id', existing.id);

  if (error) {
    logger.error('Error deleting revenue record:', error);
    return res.status(500).json({ error: 'Failed to delete revenue record' });
  }

  logger.info(`Soft deleted revenue record ${existing.id} from canceled payment ${payment.id}`);

  // Trigger LTV recalculation
  if (existing.customer_id) {
    try {
      const ltv = await calculateCustomerLTV(existing.customer_id);
      await upsertCustomerLTV(ltv);
    } catch (ltvError) {
      logger.error('Error recalculating LTV:', ltvError);
    }
  }

  return res.status(200).json({
    received: true,
    deleted: true
  });
}
