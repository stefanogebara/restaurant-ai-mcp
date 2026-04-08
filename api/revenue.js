/**
 * Revenue Management API
 *
 * Endpoints for managing revenue records (manual entry and POS data)
 * Used by the LTV calculator to compute customer lifetime value.
 *
 * Endpoints:
 * - POST ?action=create - Add manual revenue entry
 * - GET ?action=list - List with filters (date range, customer)
 * - PUT ?action=update - Update existing record
 * - DELETE ?action=delete - Soft delete
 * - GET ?action=stats - Get revenue statistics
 */

const { supabaseAdmin } = require('./_lib/supabase');
const { createSecureLogger } = require('./_lib/secure-logger');
const { setInternalCors, handlePreflight } = require('./_lib/cors');
const { verifyAuth } = require('./_lib/auth');
const { calculateCustomerLTV, upsertCustomerLTV } = require('./services/ltvCalculator');
const { sanitizeSearchQuery } = require('./_lib/validation');
const { checkAndApplyRateLimit } = require('./_lib/rate-limit');

const logger = createSecureLogger('Revenue');

module.exports = async (req, res) => {
  // Set CORS headers
  setInternalCors(req, res);
  if (handlePreflight(req, res)) return;

  const rateLimited = await checkAndApplyRateLimit(req, res, 'revenue', 30, 60);
  if (rateLimited) return;

  // Require authentication
  const auth = await verifyAuth(req);
  if (auth.error) {
    return res.status(auth.status).json({ error: auth.error });
  }

  const { action } = req.query;

  try {
    switch (action) {
      case 'create':
        if (req.method !== 'POST') {
          return res.status(405).json({ error: 'Method not allowed. Use POST' });
        }
        return await handleCreate(req, res);

      case 'list':
        if (req.method !== 'GET') {
          return res.status(405).json({ error: 'Method not allowed. Use GET' });
        }
        return await handleList(req, res);

      case 'update':
        if (req.method !== 'PUT' && req.method !== 'PATCH') {
          return res.status(405).json({ error: 'Method not allowed. Use PUT or PATCH' });
        }
        return await handleUpdate(req, res);

      case 'delete':
        if (req.method !== 'DELETE' && req.method !== 'POST') {
          return res.status(405).json({ error: 'Method not allowed. Use DELETE or POST' });
        }
        return await handleDelete(req, res);

      case 'stats':
        if (req.method !== 'GET') {
          return res.status(405).json({ error: 'Method not allowed. Use GET' });
        }
        return await handleStats(req, res);

      case 'customer-search':
        if (req.method !== 'GET') {
          return res.status(405).json({ error: 'Method not allowed. Use GET' });
        }
        return await handleCustomerSearch(req, res);

      default:
        return res.status(400).json({
          error: 'Invalid action',
          available_actions: {
            'create': 'POST /api/revenue?action=create',
            'list': 'GET /api/revenue?action=list',
            'update': 'PUT /api/revenue?action=update',
            'delete': 'DELETE /api/revenue?action=delete',
            'stats': 'GET /api/revenue?action=stats',
            'customer-search': 'GET /api/revenue?action=customer-search&q=phone_or_name'
          }
        });
    }
  } catch (error) {
    logger.error('Revenue API error:', error);
    return res.status(500).json({
      success: false,
      error: 'Internal server error',
      details: error.message
    });
  }
};

/**
 * Create a new revenue record
 * POST /api/revenue?action=create
 *
 * Body:
 * {
 *   customer_phone: "+34612345678",
 *   customer_name: "Maria Garcia",
 *   customer_email: "maria@example.com",
 *   total_revenue: 85.50,
 *   tip_amount: 12.00,
 *   party_size: 4,
 *   service_date: "2026-01-26",
 *   service_time: "20:30",
 *   reservation_id: "RES-123" (optional),
 *   notes: "Anniversary dinner"
 * }
 */
async function handleCreate(req, res) {
  try {
    const {
      customer_phone,
      customer_name,
      customer_email,
      total_revenue,
      tip_amount = 0,
      tax_amount = 0,
      party_size,
      service_date,
      service_time,
      reservation_id,
      line_items = [],
      payment_method,
      notes
    } = req.body;

    // Validation
    if (!customer_phone && !customer_email) {
      return res.status(400).json({
        success: false,
        error: 'Either customer_phone or customer_email is required'
      });
    }

    if (total_revenue === undefined || total_revenue === null) {
      return res.status(400).json({
        success: false,
        error: 'total_revenue is required'
      });
    }

    if (!service_date) {
      return res.status(400).json({
        success: false,
        error: 'service_date is required (YYYY-MM-DD format)'
      });
    }

    // Generate customer_id from phone or email
    const customer_id = customer_phone
      ? normalizePhone(customer_phone)
      : customer_email.toLowerCase();

    logger.info(`Creating revenue record for ${customer_id}: ${total_revenue}`);

    // Create revenue record
    const { data, error } = await supabaseAdmin
      .from('revenue_records')
      .insert({
        customer_id,
        customer_phone: customer_phone ? normalizePhone(customer_phone) : null,
        customer_name,
        customer_email,
        total_revenue: parseFloat(total_revenue),
        tip_amount: parseFloat(tip_amount) || 0,
        tax_amount: parseFloat(tax_amount) || 0,
        party_size: party_size ? parseInt(party_size) : null,
        service_date,
        service_time,
        reservation_id,
        line_items,
        payment_method,
        notes,
        source: 'manual',
        pos_provider: 'manual'
      })
      .select()
      .single();

    if (error) {
      logger.error('Error creating revenue record:', error);
      return res.status(500).json({
        success: false,
        error: 'Failed to create revenue record',
        details: error.message
      });
    }

    logger.info(`Created revenue record: ${data.id}`);

    // Trigger LTV recalculation in background
    try {
      const ltv = await calculateCustomerLTV(customer_id);
      await upsertCustomerLTV(ltv);
      logger.info(`Updated LTV for ${customer_id}: ${ltv.lifetime_value}`);
    } catch (ltvError) {
      logger.error('Error recalculating LTV:', ltvError);
      // Don't fail the request if LTV calc fails
    }

    return res.status(201).json({
      success: true,
      data,
      message: `Revenue record created successfully`
    });

  } catch (error) {
    logger.error('Error in handleCreate:', error);
    throw error;
  }
}

/**
 * List revenue records with filters
 * GET /api/revenue?action=list
 *
 * Query params:
 * - customer_id: Filter by customer
 * - customer_phone: Filter by phone
 * - start_date: Start date (YYYY-MM-DD)
 * - end_date: End date (YYYY-MM-DD)
 * - limit: Max records (default 50)
 * - offset: Skip records
 * - sort: 'asc' or 'desc' (default desc)
 */
async function handleList(req, res) {
  try {
    const {
      customer_id,
      customer_phone,
      start_date,
      end_date,
      limit = 50,
      offset = 0,
      sort = 'desc'
    } = req.query;

    let query = supabaseAdmin
      .from('revenue_records')
      .select('*', { count: 'exact' })
      .eq('is_deleted', false)
      .order('service_date', { ascending: sort === 'asc' })
      .range(parseInt(offset), parseInt(offset) + parseInt(limit) - 1);

    // Apply filters
    if (customer_id) {
      query = query.eq('customer_id', customer_id);
    }

    if (customer_phone) {
      query = query.eq('customer_phone', normalizePhone(customer_phone));
    }

    if (start_date) {
      query = query.gte('service_date', start_date);
    }

    if (end_date) {
      query = query.lte('service_date', end_date);
    }

    const { data, error, count } = await query;

    if (error) {
      logger.error('Error listing revenue records:', error);
      return res.status(500).json({
        success: false,
        error: 'Failed to fetch revenue records',
        details: error.message
      });
    }

    // Calculate totals
    const totalRevenue = data.reduce((sum, r) => sum + parseFloat(r.total_revenue || 0), 0);
    const totalTips = data.reduce((sum, r) => sum + parseFloat(r.tip_amount || 0), 0);

    return res.json({
      success: true,
      data: {
        records: data,
        total_count: count,
        total_revenue: Math.round(totalRevenue * 100) / 100,
        total_tips: Math.round(totalTips * 100) / 100,
        page_size: parseInt(limit),
        offset: parseInt(offset)
      }
    });

  } catch (error) {
    logger.error('Error in handleList:', error);
    throw error;
  }
}

/**
 * Update a revenue record
 * PUT /api/revenue?action=update
 *
 * Body:
 * {
 *   id: "uuid",
 *   ... fields to update
 * }
 */
async function handleUpdate(req, res) {
  try {
    const { id, ...updates } = req.body;

    if (!id) {
      return res.status(400).json({
        success: false,
        error: 'id is required'
      });
    }

    // Only allow specific fields to be updated (prevent cross-tenant escalation)
    const ALLOWED_UPDATE_FIELDS = [
      'customer_name', 'customer_phone', 'customer_email',
      'total_revenue', 'tip_amount', 'party_size',
      'payment_method', 'notes', 'date', 'time',
    ];
    for (const key of Object.keys(updates)) {
      if (!ALLOWED_UPDATE_FIELDS.includes(key)) {
        delete updates[key];
      }
    }

    // If phone is being updated, normalize it
    if (updates.customer_phone) {
      updates.customer_phone = normalizePhone(updates.customer_phone);
    }

    // Parse numeric fields
    if (updates.total_revenue !== undefined) {
      updates.total_revenue = parseFloat(updates.total_revenue);
    }
    if (updates.tip_amount !== undefined) {
      updates.tip_amount = parseFloat(updates.tip_amount);
    }
    if (updates.party_size !== undefined) {
      updates.party_size = parseInt(updates.party_size);
    }

    logger.info(`Updating revenue record ${id}`);

    const { data, error } = await supabaseAdmin
      .from('revenue_records')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      logger.error('Error updating revenue record:', error);
      return res.status(500).json({
        success: false,
        error: 'Failed to update revenue record',
        details: error.message
      });
    }

    // Trigger LTV recalculation
    if (data && data.customer_id) {
      try {
        const ltv = await calculateCustomerLTV(data.customer_id);
        await upsertCustomerLTV(ltv);
      } catch (ltvError) {
        logger.error('Error recalculating LTV:', ltvError);
      }
    }

    return res.json({
      success: true,
      data,
      message: 'Revenue record updated successfully'
    });

  } catch (error) {
    logger.error('Error in handleUpdate:', error);
    throw error;
  }
}

/**
 * Soft delete a revenue record
 * DELETE /api/revenue?action=delete
 *
 * Body or Query:
 * { id: "uuid" }
 */
async function handleDelete(req, res) {
  try {
    const id = req.body?.id || req.query?.id;

    if (!id) {
      return res.status(400).json({
        success: false,
        error: 'id is required'
      });
    }

    logger.info(`Soft deleting revenue record ${id}`);

    // Get the record first to get customer_id for LTV recalc
    const { data: existing } = await supabaseAdmin
      .from('revenue_records')
      .select('customer_id')
      .eq('id', id)
      .single();

    // Soft delete
    const { error } = await supabaseAdmin
      .from('revenue_records')
      .update({ is_deleted: true })
      .eq('id', id);

    if (error) {
      logger.error('Error deleting revenue record:', error);
      return res.status(500).json({
        success: false,
        error: 'Failed to delete revenue record',
        details: error.message
      });
    }

    // Trigger LTV recalculation
    if (existing && existing.customer_id) {
      try {
        const ltv = await calculateCustomerLTV(existing.customer_id);
        await upsertCustomerLTV(ltv);
      } catch (ltvError) {
        logger.error('Error recalculating LTV:', ltvError);
      }
    }

    return res.json({
      success: true,
      message: 'Revenue record deleted successfully'
    });

  } catch (error) {
    logger.error('Error in handleDelete:', error);
    throw error;
  }
}

/**
 * Get revenue statistics
 * GET /api/revenue?action=stats
 *
 * Query params:
 * - start_date: Start date (YYYY-MM-DD)
 * - end_date: End date (YYYY-MM-DD)
 */
async function handleStats(req, res) {
  try {
    const { start_date, end_date } = req.query;

    let query = supabaseAdmin
      .from('revenue_records')
      .select('id, service_date, total_revenue, tip_amount, party_size, payment_method')
      .eq('is_deleted', false);

    if (start_date) {
      query = query.gte('service_date', start_date);
    }

    if (end_date) {
      query = query.lte('service_date', end_date);
    }

    const { data, error } = await query;

    if (error) {
      throw error;
    }

    // Calculate statistics
    const totalRevenue = data.reduce((sum, r) => sum + parseFloat(r.total_revenue || 0), 0);
    const totalTips = data.reduce((sum, r) => sum + parseFloat(r.tip_amount || 0), 0);
    const totalTransactions = data.length;
    const avgTransactionValue = totalTransactions > 0 ? totalRevenue / totalTransactions : 0;
    const totalGuests = data.reduce((sum, r) => sum + (r.party_size || 0), 0);
    const avgRevenuePerGuest = totalGuests > 0 ? totalRevenue / totalGuests : 0;

    // Group by source
    const bySource = data.reduce((acc, r) => {
      acc[r.source] = (acc[r.source] || 0) + parseFloat(r.total_revenue || 0);
      return acc;
    }, {});

    // Top customers
    const customerTotals = data.reduce((acc, r) => {
      if (!acc[r.customer_id]) {
        acc[r.customer_id] = {
          customer_id: r.customer_id,
          customer_name: r.customer_name,
          total: 0,
          visits: 0
        };
      }
      acc[r.customer_id].total += parseFloat(r.total_revenue || 0);
      acc[r.customer_id].visits += 1;
      return acc;
    }, {});

    const topCustomers = Object.values(customerTotals)
      .sort((a, b) => b.total - a.total)
      .slice(0, 10);

    return res.json({
      success: true,
      data: {
        period: {
          start_date: start_date || 'all time',
          end_date: end_date || 'present'
        },
        totals: {
          revenue: Math.round(totalRevenue * 100) / 100,
          tips: Math.round(totalTips * 100) / 100,
          transactions: totalTransactions,
          guests: totalGuests
        },
        averages: {
          per_transaction: Math.round(avgTransactionValue * 100) / 100,
          per_guest: Math.round(avgRevenuePerGuest * 100) / 100,
          tip_percentage: totalRevenue > 0 ? Math.round((totalTips / totalRevenue) * 10000) / 100 : 0
        },
        by_source: bySource,
        top_customers: topCustomers
      }
    });

  } catch (error) {
    logger.error('Error in handleStats:', error);
    throw error;
  }
}

/**
 * Search for customers by phone or name
 * GET /api/revenue?action=customer-search&q=search_term
 */
async function handleCustomerSearch(req, res) {
  try {
    const { q } = req.query;

    if (!q || q.length < 2) {
      return res.status(400).json({
        success: false,
        error: 'Search query must be at least 2 characters'
      });
    }

    // Sanitize q to prevent PostgREST DSL filter injection
    const safeQ = sanitizeSearchQuery(q);

    if (!safeQ || safeQ.length < 2) {
      return res.status(400).json({
        success: false,
        error: 'Search query must be at least 2 characters'
      });
    }

    // Scope query to the authenticated restaurant only
    const auth = await verifyAuth(req);
    if (auth.error) {
      return res.status(auth.status).json({ error: auth.error });
    }
    const restaurantId = auth.user?.restaurant_id;
    if (!restaurantId) {
      return res.status(403).json({ success: false, error: 'Restaurant context required' });
    }

    // Search in revenue_records for unique customers scoped to this restaurant
    const { data, error } = await supabaseAdmin
      .from('revenue_records')
      .select('customer_id, customer_name, customer_phone, customer_email')
      .eq('is_deleted', false)
      .eq('restaurant_id', restaurantId)
      .or(`customer_phone.ilike.%${safeQ}%,customer_name.ilike.%${safeQ}%,customer_email.ilike.%${safeQ}%`)
      .limit(20);

    if (error) {
      throw error;
    }

    // Deduplicate by customer_id
    const uniqueCustomers = Object.values(
      data.reduce((acc, c) => {
        if (!acc[c.customer_id]) {
          acc[c.customer_id] = c;
        }
        return acc;
      }, {})
    );

    return res.json({
      success: true,
      data: {
        customers: uniqueCustomers
      }
    });

  } catch (error) {
    logger.error('Error in handleCustomerSearch:', error);
    throw error;
  }
}

/**
 * Normalize phone number (remove spaces, dashes, add + if missing)
 */
function normalizePhone(phone) {
  if (!phone) return null;

  // Remove all non-digit characters except +
  let normalized = phone.replace(/[^\d+]/g, '');

  // Ensure starts with +
  if (!normalized.startsWith('+')) {
    // Assume Spanish number if no country code
    if (normalized.length === 9) {
      normalized = '+34' + normalized;
    } else if (normalized.length === 10) {
      normalized = '+1' + normalized; // US
    } else {
      normalized = '+' + normalized;
    }
  }

  return normalized;
}
