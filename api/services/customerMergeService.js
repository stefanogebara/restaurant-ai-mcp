/**
 * Customer Merge Service
 *
 * Handles duplicate detection and soft-merge of customer records.
 * Never deletes — sets merged_into on the absorbed record.
 */

const { supabaseAdmin } = require('../_lib/supabase');
const { createSecureLogger } = require('../_lib/secure-logger');

const logger = createSecureLogger('CustomerMerge');

function crmDb() {
  return supabaseAdmin.schema('restaurant');
}

/**
 * Find duplicate customer groups by matching phone or email.
 * Returns groups of 2+ customers that share a phone or email.
 *
 * @param {string} restaurantId
 * @returns {Promise<Array<{ match_field: string, match_value: string, customers: Array }>>}
 */
async function findDuplicates(restaurantId) {
  // Fetch all non-merged customers with phone or email
  const { data: customers, error } = await crmDb()
    .from('customer_ltv')
    .select('customer_id, customer_name, customer_phone, customer_email, total_visits, total_revenue, last_visit_date')
    .eq('restaurant_id', restaurantId)
    .is('merged_into', null);

  if (error) {
    logger.error('Error fetching customers for duplicate detection:', error);
    throw error;
  }

  if (!customers || customers.length === 0) return [];

  const phoneGroups = {};
  const emailGroups = {};

  for (const c of customers) {
    if (c.customer_phone) {
      const phone = c.customer_phone.trim();
      if (phone) {
        if (!phoneGroups[phone]) phoneGroups[phone] = [];
        phoneGroups[phone].push(c);
      }
    }
    if (c.customer_email) {
      const email = c.customer_email.trim().toLowerCase();
      if (email) {
        if (!emailGroups[email]) emailGroups[email] = [];
        emailGroups[email].push(c);
      }
    }
  }

  const duplicates = [];
  const seen = new Set();

  // Phone duplicates
  for (const [phone, group] of Object.entries(phoneGroups)) {
    if (group.length >= 2) {
      const key = `phone:${phone}`;
      if (!seen.has(key)) {
        seen.add(key);
        duplicates.push({ match_field: 'phone', match_value: phone, customers: group });
      }
    }
  }

  // Email duplicates (exclude groups already covered by phone)
  for (const [email, group] of Object.entries(emailGroups)) {
    if (group.length >= 2) {
      const ids = group.map(c => c.customer_id).sort().join(',');
      if (!seen.has(ids)) {
        seen.add(ids);
        duplicates.push({ match_field: 'email', match_value: email, customers: group });
      }
    }
  }

  return duplicates;
}

/**
 * Merge two customer records (soft merge).
 * - Sums visits and revenue on the keep record
 * - Unions tags
 * - Moves notes to the keep record
 * - Reassigns reservations from merged to keep
 * - Sets merged_into on the merged record
 *
 * @param {string} restaurantId
 * @param {string} keepId   - customer_id to keep
 * @param {string} mergeId  - customer_id to absorb
 * @returns {Promise<Object>} The updated keep record
 */
async function mergeCustomers(restaurantId, keepId, mergeId) {
  if (keepId === mergeId) {
    throw new Error('Cannot merge a customer into itself');
  }

  // 1. Fetch both records
  const [keepResult, mergeResult] = await Promise.all([
    crmDb()
      .from('customer_ltv')
      .select('customer_id, restaurant_id, customer_name, customer_email, customer_phone, total_visits, total_revenue, avg_revenue_per_visit, lifetime_value, churn_risk_score, customer_tier, first_visit_date, last_visit_date, tags, allergies, dietary_restrictions, seating_preferences, special_occasions, notes, merged_into, created_at, updated_at')
      .eq('customer_id', keepId)
      .eq('restaurant_id', restaurantId)
      .is('merged_into', null)
      .single(),
    crmDb()
      .from('customer_ltv')
      .select('customer_id, restaurant_id, customer_name, customer_email, customer_phone, total_visits, total_revenue, avg_revenue_per_visit, lifetime_value, churn_risk_score, customer_tier, first_visit_date, last_visit_date, tags, allergies, dietary_restrictions, seating_preferences, special_occasions, notes, merged_into, created_at, updated_at')
      .eq('customer_id', mergeId)
      .eq('restaurant_id', restaurantId)
      .is('merged_into', null)
      .single(),
  ]);

  if (keepResult.error) {
    throw new Error(`Keep customer not found: ${keepId}`);
  }
  if (mergeResult.error) {
    throw new Error(`Merge customer not found or already merged: ${mergeId}`);
  }

  const keep = keepResult.data;
  const merge = mergeResult.data;

  // 2. Compute merged values (immutable — build new object)
  const mergedVisits = (keep.total_visits || 0) + (merge.total_visits || 0);
  const mergedRevenue = Number(keep.total_revenue || 0) + Number(merge.total_revenue || 0);
  const mergedAvgRevenue = mergedVisits > 0 ? mergedRevenue / mergedVisits : 0;

  const keepTags = Array.isArray(keep.tags) ? keep.tags : [];
  const mergeTags = Array.isArray(merge.tags) ? merge.tags : [];
  const mergedTags = [...new Set([...keepTags, ...mergeTags])];

  const keepAllergies = Array.isArray(keep.allergies) ? keep.allergies : [];
  const mergeAllergies = Array.isArray(merge.allergies) ? merge.allergies : [];
  const mergedAllergies = [...new Set([...keepAllergies, ...mergeAllergies])];

  const keepDietary = Array.isArray(keep.dietary_restrictions) ? keep.dietary_restrictions : [];
  const mergeDietary = Array.isArray(merge.dietary_restrictions) ? merge.dietary_restrictions : [];
  const mergedDietary = [...new Set([...keepDietary, ...mergeDietary])];

  const keepSeating = Array.isArray(keep.seating_preferences) ? keep.seating_preferences : [];
  const mergeSeating = Array.isArray(merge.seating_preferences) ? merge.seating_preferences : [];
  const mergedSeating = [...new Set([...keepSeating, ...mergeSeating])];

  const mergedOccasions = {
    ...(merge.special_occasions || {}),
    ...(keep.special_occasions || {}), // keep record wins on conflict
  };

  // Use earliest first_visit and latest last_visit
  const firstVisit = keep.first_visit_date && merge.first_visit_date
    ? (keep.first_visit_date < merge.first_visit_date ? keep.first_visit_date : merge.first_visit_date)
    : (keep.first_visit_date || merge.first_visit_date);

  const lastVisit = keep.last_visit_date && merge.last_visit_date
    ? (keep.last_visit_date > merge.last_visit_date ? keep.last_visit_date : merge.last_visit_date)
    : (keep.last_visit_date || merge.last_visit_date);

  // Prefer keep's name/email/phone, fall back to merge's
  const mergedName = keep.customer_name || merge.customer_name;
  const mergedEmail = keep.customer_email || merge.customer_email;
  const mergedPhone = keep.customer_phone || merge.customer_phone;

  // 3. Update keep record
  const { data: updatedKeep, error: updateError } = await crmDb()
    .from('customer_ltv')
    .update({
      customer_name: mergedName,
      customer_email: mergedEmail,
      customer_phone: mergedPhone,
      total_visits: mergedVisits,
      total_revenue: Math.round(mergedRevenue * 100) / 100,
      avg_revenue_per_visit: Math.round(mergedAvgRevenue * 100) / 100,
      first_visit_date: firstVisit,
      last_visit_date: lastVisit,
      tags: mergedTags,
      allergies: mergedAllergies,
      dietary_restrictions: mergedDietary,
      seating_preferences: mergedSeating,
      special_occasions: mergedOccasions,
      updated_at: new Date().toISOString(),
    })
    .eq('customer_id', keepId)
    .eq('restaurant_id', restaurantId)
    .select('customer_id, restaurant_id, customer_name, customer_email, customer_phone, total_visits, total_revenue, avg_revenue_per_visit, lifetime_value, churn_risk_score, customer_tier, first_visit_date, last_visit_date, tags, allergies, dietary_restrictions, seating_preferences, special_occasions, notes, merged_into, created_at, updated_at')
    .single();

  if (updateError) {
    logger.error('Error updating keep record during merge:', updateError);
    throw updateError;
  }

  // 4. Mark merged record
  const { error: mergeMarkError } = await crmDb()
    .from('customer_ltv')
    .update({
      merged_into: keepId,
      updated_at: new Date().toISOString(),
    })
    .eq('customer_id', mergeId)
    .eq('restaurant_id', restaurantId);

  if (mergeMarkError) {
    logger.error('Error marking merged record:', mergeMarkError);
    throw mergeMarkError;
  }

  // 5. Move notes from merged customer to keep customer
  const { error: notesError } = await crmDb()
    .from('customer_notes')
    .update({ customer_id: keepId })
    .eq('customer_id', mergeId)
    .eq('restaurant_id', restaurantId);

  if (notesError) {
    logger.error('Error moving notes during merge:', notesError);
    // Non-fatal — log but continue
  }

  // 6. Reassign reservations from merged phone to keep phone
  if (merge.customer_phone && keep.customer_phone) {
    const { error: resError } = await supabaseAdmin
      .from('reservations')
      .update({ customer_phone: keep.customer_phone })
      .eq('customer_phone', merge.customer_phone)
      .eq('restaurant_id', restaurantId);

    if (resError) {
      logger.error('Error reassigning reservations during merge:', resError);
      // Non-fatal — log but continue
    }
  }

  logger.info('Customer merge completed', {
    restaurantId,
    keepId,
    mergeId,
    mergedVisits,
  });

  return updatedKeep;
}

module.exports = {
  findDuplicates,
  mergeCustomers,
};
