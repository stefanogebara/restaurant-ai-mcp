/**
 * Coupons / Promotions API
 *
 * Serverless function for coupon management:
 * - list: GET all coupons for the restaurant
 * - create: POST a new coupon (auto-generates code if omitted)
 * - deactivate: POST to deactivate a coupon
 * - validate: GET to check if a coupon code is valid
 * - redeem: POST to atomically increment used_count
 */

const { supabaseAdmin } = require('./_lib/supabase');
const { createSecureLogger } = require('./_lib/secure-logger');
const { verifyAuth } = require('./_lib/auth');
const { checkSubscription, requireFeature } = require('./_lib/subscription-middleware');
const { checkAndApplyRateLimit } = require('./_lib/rate-limit');
const { setInternalCors } = require('./_lib/cors');

const logger = createSecureLogger('Coupons');

function couponsDb() {
  return supabaseAdmin.schema('restaurant');
}

const CODE_PREFIXES = ['SAVE', 'DEAL', 'OFF', 'PROMO', 'VIP'];

function generateCode(discountValue) {
  const prefix = CODE_PREFIXES[Math.floor(Math.random() * CODE_PREFIXES.length)];
  const value = Math.round(discountValue);
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const suffix = chars[Math.floor(Math.random() * chars.length)] + chars[Math.floor(Math.random() * chars.length)];
  return `${prefix}${value}${suffix}`;
}

/**
 * List coupons for the restaurant
 */
async function handleList(req, res) {
  try {
    const restaurantId = req.user.restaurant_id;

    const { data, error } = await couponsDb()
      .from('coupons')
      .select('*')
      .eq('restaurant_id', restaurantId)
      .order('created_at', { ascending: false });

    if (error) throw error;

    return res.status(200).json({
      success: true,
      data: { coupons: data || [] },
    });
  } catch (error) {
    logger.error('Error listing coupons:', error);
    return res.status(500).json({ success: false, error: 'Failed to list coupons' });
  }
}

/**
 * Create a new coupon
 */
async function handleCreate(req, res) {
  try {
    const restaurantId = req.user.restaurant_id;
    const {
      code,
      description,
      discount_type,
      discount_value,
      min_order,
      max_uses,
      valid_from,
      valid_until,
    } = req.body || {};

    // Validate discount_type
    const validTypes = ['percentage', 'fixed'];
    if (!discount_type || !validTypes.includes(discount_type)) {
      return res.status(400).json({
        success: false,
        error: `discount_type is required and must be one of: ${validTypes.join(', ')}`,
      });
    }

    // Validate discount_value
    const parsedValue = parseFloat(discount_value);
    if (!discount_value || isNaN(parsedValue) || parsedValue <= 0) {
      return res.status(400).json({
        success: false,
        error: 'discount_value is required and must be greater than 0',
      });
    }

    if (discount_type === 'percentage' && parsedValue > 100) {
      return res.status(400).json({
        success: false,
        error: 'Percentage discount cannot exceed 100',
      });
    }

    // Generate or sanitize code
    const finalCode = code
      ? code.trim().toUpperCase().replace(/[^A-Z0-9]/g, '')
      : generateCode(parsedValue);

    if (finalCode.length === 0 || finalCode.length > 20) {
      return res.status(400).json({
        success: false,
        error: 'Code must be 1-20 alphanumeric characters',
      });
    }

    // Validate description length
    if (description && description.length > 200) {
      return res.status(400).json({
        success: false,
        error: 'Description must not exceed 200 characters',
      });
    }

    // Validate max_uses
    if (max_uses !== undefined && max_uses !== null) {
      const parsedMax = parseInt(max_uses, 10);
      if (isNaN(parsedMax) || parsedMax < 1) {
        return res.status(400).json({
          success: false,
          error: 'max_uses must be a positive integer',
        });
      }
    }

    const insertData = {
      restaurant_id: restaurantId,
      code: finalCode,
      description: description ? description.trim() : null,
      discount_type,
      discount_value: parsedValue,
      min_order: parseFloat(min_order) || 0,
      max_uses: max_uses ? parseInt(max_uses, 10) : null,
      valid_from: valid_from || new Date().toISOString(),
      valid_until: valid_until || null,
    };

    const { data, error } = await couponsDb()
      .from('coupons')
      .insert(insertData)
      .select('*')
      .single();

    if (error) {
      if (error.code === '23505') {
        return res.status(409).json({
          success: false,
          error: `Coupon code "${finalCode}" already exists for this restaurant`,
        });
      }
      throw error;
    }

    logger.info('Coupon created', { couponId: data.id, code: finalCode });

    return res.status(201).json({ success: true, data });
  } catch (error) {
    logger.error('Error creating coupon:', error);
    return res.status(500).json({ success: false, error: 'Failed to create coupon' });
  }
}

/**
 * Deactivate a coupon
 */
async function handleDeactivate(req, res) {
  try {
    const restaurantId = req.user.restaurant_id;
    const { coupon_id } = req.body || {};

    if (!coupon_id) {
      return res.status(400).json({ success: false, error: 'Missing required field: coupon_id' });
    }

    const { data, error } = await couponsDb()
      .from('coupons')
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq('id', coupon_id)
      .eq('restaurant_id', restaurantId)
      .select('*')
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return res.status(404).json({ success: false, error: 'Coupon not found' });
      }
      throw error;
    }

    logger.info('Coupon deactivated', { couponId: coupon_id });

    return res.status(200).json({ success: true, data });
  } catch (error) {
    logger.error('Error deactivating coupon:', error);
    return res.status(500).json({ success: false, error: 'Failed to deactivate coupon' });
  }
}

/**
 * Validate a coupon code (check active, not expired, not maxed out)
 */
async function handleValidate(req, res) {
  try {
    const restaurantId = req.user.restaurant_id;
    const { code } = req.query;

    if (!code) {
      return res.status(400).json({ success: false, error: 'Missing required parameter: code' });
    }

    const { data, error } = await couponsDb()
      .from('coupons')
      .select('*')
      .eq('restaurant_id', restaurantId)
      .eq('code', code.trim().toUpperCase())
      .maybeSingle();

    if (error) throw error;

    if (!data) {
      return res.status(404).json({ success: false, error: 'Coupon not found', valid: false });
    }

    const now = new Date();
    const reasons = [];

    if (!data.is_active) {
      reasons.push('inactive');
    }
    if (data.valid_until && new Date(data.valid_until) < now) {
      reasons.push('expired');
    }
    if (data.max_uses !== null && data.used_count >= data.max_uses) {
      reasons.push('max_uses_reached');
    }

    const valid = reasons.length === 0;

    return res.status(200).json({
      success: true,
      data: { ...data, valid, invalid_reasons: reasons },
    });
  } catch (error) {
    logger.error('Error validating coupon:', error);
    return res.status(500).json({ success: false, error: 'Failed to validate coupon' });
  }
}

/**
 * Atomically redeem a coupon (increment used_count with optimistic lock)
 */
async function handleRedeem(req, res) {
  try {
    const restaurantId = req.user.restaurant_id;
    const { coupon_id } = req.body || {};

    if (!coupon_id) {
      return res.status(400).json({ success: false, error: 'Missing required field: coupon_id' });
    }

    // Read current state
    const { data: coupon, error: readErr } = await couponsDb()
      .from('coupons')
      .select('*')
      .eq('id', coupon_id)
      .eq('restaurant_id', restaurantId)
      .single();

    if (readErr) {
      if (readErr.code === 'PGRST116') {
        return res.status(404).json({ success: false, error: 'Coupon not found' });
      }
      throw readErr;
    }

    if (!coupon.is_active) {
      return res.status(400).json({ success: false, error: 'Coupon is inactive' });
    }
    if (coupon.valid_until && new Date(coupon.valid_until) < new Date()) {
      return res.status(400).json({ success: false, error: 'Coupon has expired' });
    }
    if (coupon.max_uses !== null && coupon.used_count >= coupon.max_uses) {
      return res.status(400).json({ success: false, error: 'Coupon has reached maximum uses' });
    }

    // Optimistic lock: only update if used_count hasn't changed
    const { data: updated, error: updateErr } = await couponsDb()
      .from('coupons')
      .update({ used_count: coupon.used_count + 1, updated_at: new Date().toISOString() })
      .eq('id', coupon_id)
      .eq('restaurant_id', restaurantId)
      .eq('used_count', coupon.used_count)
      .select('*')
      .single();

    if (updateErr) {
      if (updateErr.code === 'PGRST116') {
        return res.status(409).json({ success: false, error: 'Concurrent redemption detected, please retry' });
      }
      throw updateErr;
    }

    logger.info('Coupon redeemed', { couponId: coupon_id, newCount: updated.used_count });
    return res.status(200).json({ success: true, data: updated });
  } catch (error) {
    logger.error('Error redeeming coupon:', error);
    return res.status(500).json({ success: false, error: 'Failed to redeem coupon' });
  }
}

/**
 * Main serverless function handler
 */
module.exports = async (req, res) => {
  setInternalCors(req, res);

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const rateLimited = await checkAndApplyRateLimit(req, res, 'api');
  if (rateLimited) return;

  const authResult = await verifyAuth(req, { required: true });
  if (authResult.error) {
    return res.status(authResult.status || 401).json({
      error: authResult.error,
      message: 'Authentication required to access coupons',
    });
  }
  req.user = authResult.user;

  let subscriptionChecked = false;
  await checkSubscription(req, res, () => { subscriptionChecked = true; });
  if (!subscriptionChecked) return;

  let featureAllowed = false;
  requireFeature('advanced_analytics')(req, res, () => { featureAllowed = true; });
  if (!featureAllowed) return;

  const { action } = req.query;

  if (!action) {
    return res.status(400).json({
      success: false,
      error: 'Missing required parameter: action',
      available_actions: ['list', 'create', 'deactivate', 'validate', 'redeem'],
    });
  }

  try {
    switch (action) {
      case 'list':
        return await handleList(req, res);

      case 'create':
        if (req.method !== 'POST') return res.status(405).json({ success: false, error: 'POST required for create' });
        return await handleCreate(req, res);

      case 'deactivate':
        if (req.method !== 'POST') return res.status(405).json({ success: false, error: 'POST required for deactivate' });
        return await handleDeactivate(req, res);

      case 'validate':
        return await handleValidate(req, res);

      case 'redeem':
        if (req.method !== 'POST') return res.status(405).json({ success: false, error: 'POST required for redeem' });
        return await handleRedeem(req, res);

      default:
        return res.status(400).json({
          success: false,
          error: `Unknown action: ${action}`,
          available_actions: ['list', 'create', 'deactivate', 'validate', 'redeem'],
        });
    }
  } catch (error) {
    logger.error('Coupons API Error:', error);
    return res.status(500).json({
      success: false,
      error: 'Internal server error',
    });
  }
};
