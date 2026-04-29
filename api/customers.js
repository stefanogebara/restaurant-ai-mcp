/**
 * Customer CRM API
 *
 * Serverless function for customer management:
 * - List customers with search, tier/tag filters, sorting, pagination
 * - Get customer detail with reservations and notes
 * - Update customer tags
 * - Add/delete customer notes
 */

const { supabaseAdmin } = require('./_lib/supabase');
const { createSecureLogger } = require('./_lib/secure-logger');
const { verifyAuth } = require('./_lib/auth');
const { checkSubscription, requireFeature } = require('./_lib/subscription-middleware');
const { checkAndApplyRateLimit } = require('./_lib/rate-limit');
const { setInternalCors } = require('./_lib/cors');
const { findDuplicates, mergeCustomers } = require('./services/customerMergeService');

const logger = createSecureLogger('Customers');

// Use restaurant schema for customer_ltv and customer_notes
function crmDb() {
  return supabaseAdmin.schema('restaurant');
}

/**
 * List customers with search, filters, sorting, and pagination
 */
async function handleList(req, res) {
  try {
    const {
      search,
      tier,
      tag,
      allergy,
      dietary,
      sort = 'last_visit_date',
      order = 'desc',
      limit = '25',
      offset = '0',
    } = req.query;
    const restaurantId = req.user.restaurant_id;

    const validTiers = ['vip', 'regular', 'occasional', 'new', 'at_risk'];
    if (tier && !validTiers.includes(tier)) {
      return res.status(400).json({
        success: false,
        error: `Invalid tier. Must be one of: ${validTiers.join(', ')}`,
      });
    }

    const validSortFields = [
      'last_visit_date', 'total_visits', 'total_revenue',
      'lifetime_value', 'churn_risk_score', 'customer_name',
    ];
    const sortField = validSortFields.includes(sort) ? sort : 'last_visit_date';
    const ascending = order === 'asc';
    const parsedLimit = Math.min(Math.max(1, parseInt(limit, 10) || 25), 100);
    const parsedOffset = Math.max(0, parseInt(offset, 10) || 0);

    // Build query
    let query = crmDb()
      .from('customer_ltv')
      .select(
        'customer_id, customer_name, customer_phone, customer_email, total_visits, total_revenue, avg_revenue_per_visit, customer_tier, lifetime_value, churn_risk_score, last_visit_date, first_visit_date, tags',
        { count: 'exact' }
      )
      .eq('restaurant_id', restaurantId);

    // Search filter: ILIKE on name or exact match on phone
    if (search) {
      const trimmed = search.trim();
      const sanitized = trimmed.replace(/[%_\\]/g, '');
      if (sanitized.length < 2) {
        return res.status(400).json({ success: false, error: 'Search too short' });
      }
      query = query.or(`customer_name.ilike.%${sanitized}%,customer_phone.eq.${sanitized}`);
    }

    // Tier filter
    if (tier) {
      query = query.eq('customer_tier', tier);
    }

    // Tag filter (JSONB contains)
    if (tag) {
      query = query.contains('tags', [tag.trim().toLowerCase()]);
    }

    // Allergy filter (array contains)
    if (allergy) {
      query = query.contains('allergies', [allergy.trim()]);
    }

    // Dietary filter (array contains)
    if (dietary) {
      query = query.contains('dietary_restrictions', [dietary.trim()]);
    }

    // Sorting and pagination
    query = query
      .order(sortField, { ascending })
      .range(parsedOffset, parsedOffset + parsedLimit - 1);

    const { data, count, error } = await query;
    if (error) throw error;

    const customers = (data || []).map(c => ({
      ...c,
      churn_risk_score: Number(c.churn_risk_score || 0),
      lifetime_value: Number(c.lifetime_value || 0),
      total_revenue: Number(c.total_revenue || 0),
      avg_revenue_per_visit: Number(c.avg_revenue_per_visit || 0),
      tags: c.tags || [],
    }));

    return res.status(200).json({
      success: true,
      data: { customers, total: count || customers.length },
    });

  } catch (error) {
    logger.error('Error listing customers:', error);
    return res.status(500).json({ success: false, error: 'Failed to list customers' });
  }
}

/**
 * Get customer detail with reservations and notes
 */
async function handleDetail(req, res) {
  try {
    const { customer_id } = req.query;
    const restaurantId = req.user.restaurant_id;

    if (!customer_id) {
      return res.status(400).json({ success: false, error: 'Missing required parameter: customer_id' });
    }

    // Fetch customer, reservations, and notes in parallel
    const [customerResult, reservationsResult, notesResult] = await Promise.all([
      crmDb()
        .from('customer_ltv')
        .select('customer_id, restaurant_id, customer_name, customer_email, customer_phone, total_visits, total_revenue, avg_revenue_per_visit, lifetime_value, churn_risk_score, customer_tier, first_visit_date, last_visit_date, tags, allergies, dietary_restrictions, seating_preferences, special_occasions, merged_into, created_at, updated_at')
        .eq('customer_id', customer_id)
        .eq('restaurant_id', restaurantId)
        .single(),

      supabaseAdmin
        .from('reservations')
        .select('id, date, time, party_size, status, customer_name, special_requests, created_at')
        .eq('restaurant_id', restaurantId)
        .eq('customer_phone', customer_id)
        .order('date', { ascending: false })
        .limit(10),

      crmDb()
        .from('customer_notes')
        .select('id, content, created_by, created_at, updated_at')
        .eq('restaurant_id', restaurantId)
        .eq('customer_id', customer_id)
        .order('created_at', { ascending: false }),
    ]);

    if (customerResult.error) {
      if (customerResult.error.code === 'PGRST116') {
        return res.status(404).json({ success: false, error: 'Customer not found' });
      }
      throw customerResult.error;
    }

    if (reservationsResult.error) {
      logger.error('Error fetching reservations for customer detail:', reservationsResult.error);
    }

    if (notesResult.error) {
      logger.error('Error fetching notes for customer detail:', notesResult.error);
    }

    return res.status(200).json({
      success: true,
      data: {
        customer: {
          ...customerResult.data,
          tags: customerResult.data.tags || [],
        },
        reservations: reservationsResult.data || [],
        notes: notesResult.data || [],
      },
    });

  } catch (error) {
    logger.error('Error fetching customer detail:', error);
    return res.status(500).json({ success: false, error: 'Failed to fetch customer detail' });
  }
}

/**
 * Update customer tags
 */
async function handleUpdateTags(req, res) {
  try {
    const restaurantId = req.user.restaurant_id;
    const { customer_id, tags } = req.body || {};

    if (!customer_id) {
      return res.status(400).json({ success: false, error: 'Missing required field: customer_id' });
    }

    if (!Array.isArray(tags)) {
      return res.status(400).json({ success: false, error: 'tags must be an array of strings' });
    }

    if (tags.length > 20) {
      return res.status(400).json({ success: false, error: 'Maximum 20 tags allowed' });
    }

    // Validate and normalize each tag
    const normalizedTags = [];
    for (const tag of tags) {
      if (typeof tag !== 'string') {
        return res.status(400).json({ success: false, error: 'Each tag must be a string' });
      }
      const cleaned = tag.trim().toLowerCase();
      if (cleaned.length === 0) continue;
      if (cleaned.length > 50) {
        return res.status(400).json({ success: false, error: `Tag "${cleaned.slice(0, 20)}..." exceeds 50 character limit` });
      }
      normalizedTags.push(cleaned);
    }

    // Deduplicate
    const uniqueTags = [...new Set(normalizedTags)];

    const { data, error } = await crmDb()
      .from('customer_ltv')
      .update({ tags: uniqueTags, updated_at: new Date().toISOString() })
      .eq('customer_id', customer_id)
      .eq('restaurant_id', restaurantId)
      .select('customer_id, restaurant_id, customer_name, customer_email, customer_phone, total_visits, total_revenue, avg_revenue_per_visit, lifetime_value, churn_risk_score, customer_tier, first_visit_date, last_visit_date, tags, allergies, dietary_restrictions, seating_preferences, special_occasions, merged_into, created_at, updated_at')
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return res.status(404).json({ success: false, error: 'Customer not found' });
      }
      throw error;
    }

    logger.info('Tags updated', { customerId: customer_id, tagCount: uniqueTags.length });

    return res.status(200).json({
      success: true,
      data: { ...data, tags: data.tags || [] },
    });

  } catch (error) {
    logger.error('Error updating tags:', error);
    return res.status(500).json({ success: false, error: 'Failed to update tags' });
  }
}

/**
 * Add a note to a customer
 */
async function handleAddNote(req, res) {
  try {
    const restaurantId = req.user.restaurant_id;
    const { customer_id, content } = req.body || {};

    if (!customer_id) {
      return res.status(400).json({ success: false, error: 'Missing required field: customer_id' });
    }

    if (!content || typeof content !== 'string' || content.trim().length === 0) {
      return res.status(400).json({ success: false, error: 'content is required and must be non-empty' });
    }

    const trimmedContent = content.trim();
    if (trimmedContent.length > 500) {
      return res.status(400).json({ success: false, error: 'content must not exceed 500 characters' });
    }

    const { data, error } = await crmDb()
      .from('customer_notes')
      .insert({
        restaurant_id: restaurantId,
        customer_id,
        content: trimmedContent,
        created_by: req.user.email || req.user.id || null,
      })
      .select('id, content, created_by, created_at, updated_at')
      .single();

    if (error) throw error;

    logger.info('Note added', { customerId: customer_id, noteId: data.id });

    return res.status(201).json({ success: true, data });

  } catch (error) {
    logger.error('Error adding note:', error);
    return res.status(500).json({ success: false, error: 'Failed to add note' });
  }
}

/**
 * Delete a customer note
 */
async function handleDeleteNote(req, res) {
  try {
    const restaurantId = req.user.restaurant_id;
    const { note_id } = req.body || {};

    if (!note_id) {
      return res.status(400).json({ success: false, error: 'Missing required field: note_id' });
    }

    const { data, error } = await crmDb()
      .from('customer_notes')
      .delete()
      .eq('id', note_id)
      .eq('restaurant_id', restaurantId)
      .select('id')
      .maybeSingle();

    if (error) throw error;

    if (!data) {
      return res.status(404).json({ success: false, error: 'Note not found or already deleted' });
    }

    logger.info('Note deleted', { noteId: note_id });

    return res.status(200).json({ success: true });

  } catch (error) {
    logger.error('Error deleting note:', error);
    return res.status(500).json({ success: false, error: 'Failed to delete note' });
  }
}

/**
 * Update customer profile (allergies, dietary, seating, occasions)
 */
async function handleUpdateProfile(req, res) {
  try {
    const restaurantId = req.user.restaurant_id;
    const {
      customer_id,
      allergies,
      dietary_restrictions,
      seating_preferences,
      special_occasions,
    } = req.body || {};

    if (!customer_id) {
      return res.status(400).json({ success: false, error: 'Missing required field: customer_id' });
    }

    const updates = {};

    // Validate allergies
    if (allergies !== undefined) {
      if (!Array.isArray(allergies)) {
        return res.status(400).json({ success: false, error: 'allergies must be an array of strings' });
      }
      if (allergies.length > 20) {
        return res.status(400).json({ success: false, error: 'Maximum 20 allergies allowed' });
      }
      for (const a of allergies) {
        if (typeof a !== 'string') {
          return res.status(400).json({ success: false, error: 'Each allergy must be a string' });
        }
      }
      updates.allergies = allergies.map(a => a.trim()).filter(Boolean);
    }

    // Validate dietary_restrictions
    if (dietary_restrictions !== undefined) {
      if (!Array.isArray(dietary_restrictions)) {
        return res.status(400).json({ success: false, error: 'dietary_restrictions must be an array of strings' });
      }
      if (dietary_restrictions.length > 20) {
        return res.status(400).json({ success: false, error: 'Maximum 20 dietary restrictions allowed' });
      }
      for (const d of dietary_restrictions) {
        if (typeof d !== 'string') {
          return res.status(400).json({ success: false, error: 'Each dietary restriction must be a string' });
        }
      }
      updates.dietary_restrictions = dietary_restrictions.map(d => d.trim()).filter(Boolean);
    }

    // Validate seating_preferences
    if (seating_preferences !== undefined) {
      if (!Array.isArray(seating_preferences)) {
        return res.status(400).json({ success: false, error: 'seating_preferences must be an array of strings' });
      }
      if (seating_preferences.length > 10) {
        return res.status(400).json({ success: false, error: 'Maximum 10 seating preferences allowed' });
      }
      for (const s of seating_preferences) {
        if (typeof s !== 'string') {
          return res.status(400).json({ success: false, error: 'Each seating preference must be a string' });
        }
      }
      updates.seating_preferences = seating_preferences.map(s => s.trim()).filter(Boolean);
    }

    // Validate special_occasions
    if (special_occasions !== undefined) {
      if (typeof special_occasions !== 'object' || special_occasions === null || Array.isArray(special_occasions)) {
        return res.status(400).json({ success: false, error: 'special_occasions must be a JSON object' });
      }
      // Validate keys and values are reasonable
      for (const [key, value] of Object.entries(special_occasions)) {
        if (typeof key !== 'string' || key.length > 50) {
          return res.status(400).json({ success: false, error: 'special_occasions keys must be strings under 50 chars' });
        }
        if (typeof value !== 'string' || value.length > 100) {
          return res.status(400).json({ success: false, error: 'special_occasions values must be strings under 100 chars' });
        }
      }
      updates.special_occasions = special_occasions;
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ success: false, error: 'No profile fields provided to update' });
    }

    updates.updated_at = new Date().toISOString();

    const { data, error } = await crmDb()
      .from('customer_ltv')
      .update(updates)
      .eq('customer_id', customer_id)
      .eq('restaurant_id', restaurantId)
      .select('customer_id, restaurant_id, customer_name, customer_email, customer_phone, total_visits, total_revenue, avg_revenue_per_visit, lifetime_value, churn_risk_score, customer_tier, first_visit_date, last_visit_date, tags, allergies, dietary_restrictions, seating_preferences, special_occasions, merged_into, created_at, updated_at')
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return res.status(404).json({ success: false, error: 'Customer not found' });
      }
      throw error;
    }

    logger.info('Profile updated', { customerId: customer_id, fields: Object.keys(updates) });

    return res.status(200).json({ success: true, data });

  } catch (error) {
    logger.error('Error updating profile:', error);
    return res.status(500).json({ success: false, error: 'Failed to update customer profile' });
  }
}

/**
 * Find duplicate customers by phone or email
 */
async function handleFindDuplicates(req, res) {
  try {
    const restaurantId = req.user.restaurant_id;
    const duplicates = await findDuplicates(restaurantId);

    return res.status(200).json({
      success: true,
      data: { duplicates, total_groups: duplicates.length },
    });

  } catch (error) {
    logger.error('Error finding duplicates:', error);
    return res.status(500).json({ success: false, error: 'Failed to find duplicate customers' });
  }
}

/**
 * Merge two customer records
 */
async function handleMerge(req, res) {
  try {
    const restaurantId = req.user.restaurant_id;
    const { keep_id, merge_id } = req.body || {};

    if (!keep_id) {
      return res.status(400).json({ success: false, error: 'Missing required field: keep_id' });
    }
    if (!merge_id) {
      return res.status(400).json({ success: false, error: 'Missing required field: merge_id' });
    }
    if (keep_id === merge_id) {
      return res.status(400).json({ success: false, error: 'keep_id and merge_id must be different' });
    }

    const merged = await mergeCustomers(restaurantId, keep_id, merge_id);

    logger.info('Customers merged', { keepId: keep_id, mergeId: merge_id });

    return res.status(200).json({ success: true, data: merged });

  } catch (error) {
    // Surface known errors as 400/404
    if (error.message && (error.message.includes('not found') || error.message.includes('Cannot merge'))) {
      return res.status(400).json({ success: false, error: error.message });
    }
    logger.error('Error merging customers:', error);
    return res.status(500).json({ success: false, error: 'Failed to merge customers' });
  }
}

/**
 * Main serverless function handler
 */
module.exports = async (req, res) => {
  // Enable CORS
  setInternalCors(req, res);

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Apply rate limiting (60 requests per minute)
  const rateLimited = await checkAndApplyRateLimit(req, res, 'api');
  if (rateLimited) return; // 429 response already sent

  // Verify authentication
  const authResult = await verifyAuth(req, { required: true });
  if (authResult.error) {
    return res.status(authResult.status || 401).json({
      error: authResult.error,
      message: 'Authentication required to access customer data',
    });
  }
  req.user = authResult.user;

  // Check subscription status
  let subscriptionChecked = false;
  await checkSubscription(req, res, () => { subscriptionChecked = true; });
  if (!subscriptionChecked) return; // Response already sent by middleware

  // Check feature access - advanced_analytics required for CRM
  let featureAllowed = false;
  requireFeature('advanced_analytics')(req, res, () => { featureAllowed = true; });
  if (!featureAllowed) return; // Response already sent by middleware

  const { action } = req.query;

  const AVAILABLE_ACTIONS = [
    'list', 'detail', 'update_tags', 'update_profile',
    'add_note', 'delete_note', 'find_duplicates', 'merge',
  ];

  if (!action) {
    return res.status(400).json({
      success: false,
      error: 'Missing required parameter: action',
      available_actions: AVAILABLE_ACTIONS,
    });
  }

  try {
    switch (action) {
      case 'list':
        return await handleList(req, res);

      case 'detail':
        return await handleDetail(req, res);

      case 'update_tags':
        if (req.method !== 'POST') return res.status(405).json({ success: false, error: 'POST required for update_tags' });
        return await handleUpdateTags(req, res);

      case 'update_profile':
        if (req.method !== 'POST') return res.status(405).json({ success: false, error: 'POST required for update_profile' });
        return await handleUpdateProfile(req, res);

      case 'add_note':
        if (req.method !== 'POST') return res.status(405).json({ success: false, error: 'POST required for add_note' });
        return await handleAddNote(req, res);

      case 'delete_note':
        if (req.method !== 'POST') return res.status(405).json({ success: false, error: 'POST required for delete_note' });
        return await handleDeleteNote(req, res);

      case 'find_duplicates':
        return await handleFindDuplicates(req, res);

      case 'merge':
        if (req.method !== 'POST') return res.status(405).json({ success: false, error: 'POST required for merge' });
        return await handleMerge(req, res);

      default:
        return res.status(400).json({
          success: false,
          error: `Unknown action: ${action}`,
          available_actions: AVAILABLE_ACTIONS,
        });
    }
  } catch (error) {
    logger.error('Customers API Error:', error);
    return res.status(500).json({
      success: false,
      error: 'Internal server error',
    });
  }
};
