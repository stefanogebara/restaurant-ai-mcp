/**
 * Square Sync API
 *
 * Syncs historical transaction data from Square POS.
 *
 * Endpoints:
 * - POST ?action=sync-history - Sync last N days of transactions
 * - GET ?action=sync-status - Check sync progress
 */

const { createClient } = require('@supabase/supabase-js');
const { createSecureLogger } = require('./_lib/secure-logger');
const { setInternalCors, handlePreflight } = require('./_lib/cors');
const {
  getAccessToken,
  fetchTransactions,
  matchCustomerToReservation,
  paymentToRevenueRecord
} = require('./services/squareService');
const { calculateAllCustomerLTV } = require('./services/ltvCalculator');

const logger = createSecureLogger('SquareSync');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY
);

module.exports = async (req, res) => {
  // Set CORS headers
  setInternalCors(req, res);
  if (handlePreflight(req, res)) return;

  const { action } = req.query;

  try {
    switch (action) {
      case 'sync-history':
        if (req.method !== 'POST') {
          return res.status(405).json({ error: 'Method not allowed. Use POST' });
        }
        return await handleSyncHistory(req, res);

      case 'sync-status':
        return await handleSyncStatus(req, res);

      default:
        return res.status(400).json({
          error: 'Invalid action',
          available_actions: {
            'sync-history': 'POST /api/square-sync?action=sync-history',
            'sync-status': 'GET /api/square-sync?action=sync-status&restaurant_id=xxx'
          }
        });
    }
  } catch (error) {
    logger.error('Square Sync API error:', error);
    return res.status(500).json({
      success: false,
      error: 'Internal server error',
      details: error.message
    });
  }
};

/**
 * Sync historical transactions from Square
 * POST /api/square-sync?action=sync-history
 *
 * Body:
 * {
 *   restaurant_id: "uuid",
 *   days_back: 30 (optional, default 30, max 90)
 * }
 */
async function handleSyncHistory(req, res) {
  const { restaurant_id, days_back = 30 } = req.body;

  if (!restaurant_id) {
    return res.status(400).json({
      success: false,
      error: 'restaurant_id is required'
    });
  }

  // Limit days_back to 90
  const daysToSync = Math.min(parseInt(days_back) || 30, 90);

  // Get access token
  const tokenResult = await getAccessToken(restaurant_id);

  if (!tokenResult) {
    return res.status(400).json({
      success: false,
      error: 'No active Square connection found'
    });
  }

  const { token, locationId } = tokenResult;

  if (!locationId) {
    return res.status(400).json({
      success: false,
      error: 'No location configured for Square connection'
    });
  }

  logger.info(`Starting sync for restaurant ${restaurant_id}, ${daysToSync} days back`);

  // Calculate date range
  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - daysToSync);

  // Update connection to show sync in progress
  await supabase
    .from('pos_connections')
    .update({
      sync_error: null,
      last_sync_at: new Date().toISOString()
    })
    .eq('restaurant_id', restaurant_id)
    .eq('pos_provider', 'square');

  try {
    // Fetch transactions from Square
    const transactions = await fetchTransactions(token, locationId, startDate, endDate);

    logger.info(`Fetched ${transactions.length} transactions from Square`);

    // Process results
    const results = {
      total: transactions.length,
      inserted: 0,
      skipped: 0,
      errors: 0
    };

    // Process each transaction
    for (const payment of transactions) {
      try {
        // Skip if already exists
        const { data: existing } = await supabase
          .from('revenue_records')
          .select('id')
          .eq('pos_transaction_id', payment.id)
          .single();

        if (existing) {
          results.skipped++;
          continue;
        }

        // Only process completed payments
        if (payment.status !== 'COMPLETED') {
          results.skipped++;
          continue;
        }

        // Match customer to reservation
        const matchResult = await matchCustomerToReservation(payment, token);

        // Convert to revenue record
        const revenueRecord = paymentToRevenueRecord(
          payment,
          matchResult,
          restaurant_id
        );
        revenueRecord.source = 'pos_sync'; // Mark as synced (not real-time)

        // Insert
        const { error: insertError } = await supabase
          .from('revenue_records')
          .insert(revenueRecord);

        if (insertError) {
          logger.error(`Error inserting payment ${payment.id}:`, insertError);
          results.errors++;
        } else {
          results.inserted++;
        }

        // Small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 50));

      } catch (paymentError) {
        logger.error(`Error processing payment ${payment.id}:`, paymentError);
        results.errors++;
      }
    }

    // Update sync timestamp
    await supabase
      .from('pos_connections')
      .update({
        last_sync_at: new Date().toISOString(),
        sync_error: results.errors > 0 ? `${results.errors} errors during sync` : null
      })
      .eq('restaurant_id', restaurant_id)
      .eq('pos_provider', 'square');

    logger.info(`Sync complete: ${results.inserted} inserted, ${results.skipped} skipped, ${results.errors} errors`);

    // Trigger LTV recalculation for all customers
    if (results.inserted > 0) {
      try {
        logger.info('Recalculating LTV for all customers...');
        await calculateAllCustomerLTV();
      } catch (ltvError) {
        logger.error('Error recalculating LTV:', ltvError);
      }
    }

    return res.json({
      success: true,
      data: {
        period: {
          start: startDate.toISOString().split('T')[0],
          end: endDate.toISOString().split('T')[0]
        },
        results
      },
      message: `Synced ${results.inserted} new transactions`
    });

  } catch (error) {
    // Update connection with error
    await supabase
      .from('pos_connections')
      .update({
        sync_error: error.message
      })
      .eq('restaurant_id', restaurant_id)
      .eq('pos_provider', 'square');

    throw error;
  }
}

/**
 * Get sync status
 * GET /api/square-sync?action=sync-status&restaurant_id=xxx
 */
async function handleSyncStatus(req, res) {
  const { restaurant_id } = req.query;

  if (!restaurant_id) {
    return res.status(400).json({
      success: false,
      error: 'restaurant_id is required'
    });
  }

  // Get connection info
  const { data: connection, error: connError } = await supabase
    .from('pos_connections')
    .select('status, last_sync_at, sync_error')
    .eq('restaurant_id', restaurant_id)
    .eq('pos_provider', 'square')
    .single();

  if (connError || !connection) {
    return res.json({
      success: true,
      connected: false
    });
  }

  // Count revenue records from Square
  const { count } = await supabase
    .from('revenue_records')
    .select('*', { count: 'exact', head: true })
    .eq('restaurant_id', restaurant_id)
    .eq('pos_provider', 'square')
    .eq('is_deleted', false);

  // Get date range of synced data
  const { data: dateRange } = await supabase
    .from('revenue_records')
    .select('service_date')
    .eq('restaurant_id', restaurant_id)
    .eq('pos_provider', 'square')
    .eq('is_deleted', false)
    .order('service_date', { ascending: true })
    .limit(1);

  const { data: lastDate } = await supabase
    .from('revenue_records')
    .select('service_date')
    .eq('restaurant_id', restaurant_id)
    .eq('pos_provider', 'square')
    .eq('is_deleted', false)
    .order('service_date', { ascending: false })
    .limit(1);

  return res.json({
    success: true,
    connected: connection.status === 'active',
    last_sync_at: connection.last_sync_at,
    sync_error: connection.sync_error,
    records_synced: count || 0,
    date_range: {
      earliest: dateRange?.[0]?.service_date || null,
      latest: lastDate?.[0]?.service_date || null
    }
  });
}
