/**
 * Square POS Service
 *
 * Handles Square API interactions including:
 * - Token management (get, refresh)
 * - Transaction fetching
 * - Customer matching
 */

const { createClient } = require('@supabase/supabase-js');
const { createSecureLogger } = require('../_lib/secure-logger');

const logger = createSecureLogger('SquareService');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY
);

// Square API endpoints
const SQUARE_API_URL = process.env.SQUARE_ENVIRONMENT === 'production'
  ? 'https://connect.squareup.com'
  : 'https://connect.squareupsandbox.com';

/**
 * Get valid access token for a restaurant
 * Refreshes if expired
 *
 * @param {string} restaurantId
 * @returns {Promise<{token: string, locationId: string} | null>}
 */
async function getAccessToken(restaurantId) {
  try {
    // Get the connection from database
    const { data: connection, error } = await supabase
      .from('pos_connections')
      .select('*')
      .eq('restaurant_id', restaurantId)
      .eq('pos_provider', 'square')
      .eq('status', 'active')
      .single();

    if (error || !connection) {
      logger.info(`No active Square connection for restaurant ${restaurantId}`);
      return null;
    }

    // Check if token is expired or will expire soon (within 5 minutes)
    const expiresAt = new Date(connection.token_expires_at);
    const now = new Date();
    const fiveMinutesFromNow = new Date(now.getTime() + 5 * 60 * 1000);

    if (expiresAt <= fiveMinutesFromNow) {
      logger.info('Token expired or expiring soon, refreshing...');
      const refreshed = await refreshToken(connection);
      if (refreshed) {
        return {
          token: refreshed.access_token,
          locationId: connection.location_id
        };
      }
      return null;
    }

    return {
      token: connection.access_token,
      locationId: connection.location_id
    };

  } catch (error) {
    logger.error('Error getting access token:', error);
    return null;
  }
}

/**
 * Refresh an expired Square token
 *
 * @param {Object} connection - The pos_connections record
 * @returns {Promise<{access_token: string, refresh_token: string} | null>}
 */
async function refreshToken(connection) {
  try {
    const response = await fetch(`${SQUARE_API_URL}/oauth2/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Square-Version': '2024-01-17'
      },
      body: JSON.stringify({
        client_id: process.env.SQUARE_APPLICATION_ID,
        client_secret: process.env.SQUARE_APPLICATION_SECRET,
        grant_type: 'refresh_token',
        refresh_token: connection.refresh_token
      })
    });

    if (!response.ok) {
      const errorData = await response.json();
      logger.error('Token refresh failed:', errorData);

      // Mark connection as expired
      await supabase
        .from('pos_connections')
        .update({
          status: 'expired',
          sync_error: 'Token refresh failed'
        })
        .eq('id', connection.id);

      return null;
    }

    const data = await response.json();

    // Calculate expiration (Square tokens last 30 days)
    const expiresAt = new Date();
    expiresAt.setSeconds(expiresAt.getSeconds() + (data.expires_in || 2592000));

    // Update the connection with new tokens
    await supabase
      .from('pos_connections')
      .update({
        access_token: data.access_token,
        refresh_token: data.refresh_token,
        token_expires_at: expiresAt.toISOString(),
        status: 'active',
        sync_error: null
      })
      .eq('id', connection.id);

    logger.info('Token refreshed successfully');

    return {
      access_token: data.access_token,
      refresh_token: data.refresh_token
    };

  } catch (error) {
    logger.error('Error refreshing token:', error);
    return null;
  }
}

/**
 * Fetch transactions from Square
 *
 * @param {string} accessToken
 * @param {string} locationId
 * @param {Date} startDate
 * @param {Date} endDate
 * @returns {Promise<Array>}
 */
async function fetchTransactions(accessToken, locationId, startDate, endDate) {
  try {
    const transactions = [];
    let cursor = null;

    do {
      const params = new URLSearchParams({
        location_ids: locationId,
        begin_time: startDate.toISOString(),
        end_time: endDate.toISOString(),
        sort_order: 'DESC',
        limit: '100'
      });

      if (cursor) {
        params.set('cursor', cursor);
      }

      const response = await fetch(
        `${SQUARE_API_URL}/v2/payments?${params.toString()}`,
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Square-Version': '2024-01-17',
            'Content-Type': 'application/json'
          }
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        logger.error('Error fetching transactions:', errorData);
        break;
      }

      const data = await response.json();

      if (data.payments) {
        transactions.push(...data.payments);
      }

      cursor = data.cursor;

    } while (cursor);

    logger.info(`Fetched ${transactions.length} transactions from Square`);

    return transactions;

  } catch (error) {
    logger.error('Error in fetchTransactions:', error);
    return [];
  }
}

/**
 * Get customer details from Square
 *
 * @param {string} accessToken
 * @param {string} customerId - Square customer ID
 * @returns {Promise<Object|null>}
 */
async function getSquareCustomer(accessToken, customerId) {
  try {
    const response = await fetch(
      `${SQUARE_API_URL}/v2/customers/${customerId}`,
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Square-Version': '2024-01-17'
        }
      }
    );

    if (!response.ok) {
      return null;
    }

    const data = await response.json();
    return data.customer;

  } catch (error) {
    logger.error('Error getting Square customer:', error);
    return null;
  }
}

/**
 * Match a Square payment to a reservation
 *
 * @param {Object} payment - Square payment object
 * @param {string} accessToken - For fetching customer details
 * @returns {Promise<{customerId: string, reservationId: string|null, customerName: string|null, customerPhone: string|null}>}
 */
async function matchCustomerToReservation(payment, accessToken) {
  let customerPhone = null;
  let customerName = null;
  let customerEmail = null;

  // Try to get customer info from Square
  if (payment.customer_id) {
    const customer = await getSquareCustomer(accessToken, payment.customer_id);
    if (customer) {
      customerPhone = customer.phone_number;
      customerName = `${customer.given_name || ''} ${customer.family_name || ''}`.trim() || null;
      customerEmail = customer.email_address;
    }
  }

  // Generate customer_id from phone or email
  let customerId = null;
  if (customerPhone) {
    customerId = normalizePhone(customerPhone);
  } else if (customerEmail) {
    customerId = customerEmail.toLowerCase();
  } else {
    // Use Square customer ID as fallback
    customerId = `square:${payment.customer_id || payment.id}`;
  }

  // Try to match to a reservation
  let reservationId = null;

  if (customerPhone || customerEmail) {
    // Get payment date
    const paymentDate = new Date(payment.created_at).toISOString().split('T')[0];

    // Search for reservation on same day
    let query = supabase
      .from('reservations')
      .select('reservation_id')
      .eq('date', paymentDate)
      .in('status', ['confirmed', 'seated', 'completed']);

    if (customerPhone) {
      query = query.eq('customer_phone', normalizePhone(customerPhone));
    } else if (customerEmail) {
      query = query.eq('customer_email', customerEmail.toLowerCase());
    }

    const { data: reservation } = await query.limit(1).single();

    if (reservation) {
      reservationId = reservation.reservation_id;
      logger.info(`Matched payment to reservation ${reservationId}`);
    }
  }

  return {
    customerId,
    reservationId,
    customerName,
    customerPhone,
    customerEmail
  };
}

/**
 * Convert Square payment to revenue record format
 *
 * @param {Object} payment - Square payment object
 * @param {Object} matchResult - Result from matchCustomerToReservation
 * @param {string} restaurantId
 * @returns {Object} Revenue record
 */
function paymentToRevenueRecord(payment, matchResult, restaurantId) {
  const paymentDate = new Date(payment.created_at);

  // Calculate amounts (Square uses cents)
  const totalAmount = (payment.total_money?.amount || 0) / 100;
  const tipAmount = (payment.tip_money?.amount || 0) / 100;

  return {
    restaurant_id: restaurantId,
    customer_id: matchResult.customerId,
    customer_phone: matchResult.customerPhone ? normalizePhone(matchResult.customerPhone) : null,
    customer_name: matchResult.customerName,
    customer_email: matchResult.customerEmail,
    reservation_id: matchResult.reservationId,
    pos_transaction_id: payment.id,
    pos_provider: 'square',
    total_revenue: totalAmount - tipAmount, // Store net revenue
    tip_amount: tipAmount,
    service_date: paymentDate.toISOString().split('T')[0],
    service_time: paymentDate.toISOString().split('T')[1].substring(0, 5),
    source: 'pos_auto',
    payment_method: payment.source_type
  };
}

/**
 * Normalize phone number
 */
function normalizePhone(phone) {
  if (!phone) return null;
  let normalized = phone.replace(/[^\d+]/g, '');
  if (!normalized.startsWith('+')) {
    if (normalized.length === 9) {
      normalized = '+34' + normalized;
    } else if (normalized.length === 10) {
      normalized = '+1' + normalized;
    } else {
      normalized = '+' + normalized;
    }
  }
  return normalized;
}

module.exports = {
  getAccessToken,
  refreshToken,
  fetchTransactions,
  getSquareCustomer,
  matchCustomerToReservation,
  paymentToRevenueRecord,
  SQUARE_API_URL
};
