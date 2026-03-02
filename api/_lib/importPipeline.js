'use strict';

const { parse } = require('csv-parse/sync');

const DEFAULT_AVG_SPEND = 40;

/**
 * Parse a CSV buffer. Returns raw row objects with string values.
 * @param {Buffer} buf
 * @returns {Record<string, string>[]}
 */
function parseCSVBuffer(buf) {
  const rows = parse(buf, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
    relax_column_count: true,
  });
  return rows.filter(r => Object.values(r).some(v => v && v.trim()));
}

/**
 * Map raw CSV row to canonical fields. Returns null if phone is missing.
 * @param {Record<string, string>} row
 * @returns {{ customer_name, customer_phone, customer_email, visit_count, last_visit_date, avg_spend } | null}
 */
function normalizeRow(row) {
  const phone = (row.phone || row.customer_phone || row.phone_number || '').trim();
  if (!phone) return null;

  const name = (row.name || row.customer_name || '').trim();
  const email = (row.email || row.customer_email || '').trim() || null;
  const visitsRaw = row.visits || row.visit_count || row.total_visits || '1';
  const visit_count = Math.max(1, parseInt(visitsRaw, 10) || 1);
  const lastVisitRaw = row.last_visit || row.last_visit_date;
  const last_visit_date = lastVisitRaw && lastVisitRaw.trim() ? lastVisitRaw.trim() : null;
  const spendRaw = row.avg_spend || row.average_spend || row.spend;
  const avg_spend = spendRaw ? parseFloat(spendRaw) || null : null;

  return { customer_name: name, customer_phone: phone, customer_email: email, visit_count, last_visit_date, avg_spend };
}

/**
 * Compute customer tier from visit count and churn risk score.
 * Mirrors logic in update-churn-scores.js.
 */
function computeTier(visits, churnRisk) {
  if (churnRisk > 70) return 'at_risk';
  if (visits >= 10) return 'vip';
  if (visits >= 4) return 'regular';
  if (visits >= 2) return 'occasional';
  return 'new';
}

/**
 * Compute simple churn risk from last_visit_date.
 * Returns 0-100 (higher = more likely churned).
 */
function computeChurn(lastVisitDate) {
  if (!lastVisitDate) return 50;
  const days = (Date.now() - new Date(lastVisitDate).getTime()) / 86400000;
  return Math.max(0, Math.min(100, Math.round((days / 180) * 50)));
}

/**
 * Build a customer_ltv upsert record from a normalized row.
 */
function buildLTVRecord(row, restaurantId) {
  const avgSpend = row.avg_spend || DEFAULT_AVG_SPEND;
  const churn = computeChurn(row.last_visit_date);
  const tier = computeTier(row.visit_count, churn);

  return {
    customer_id: row.customer_phone,
    customer_phone: row.customer_phone,
    customer_name: row.customer_name || null,
    customer_email: row.customer_email || null,
    restaurant_id: restaurantId,
    total_visits: row.visit_count,
    first_visit_date: null,
    last_visit_date: row.last_visit_date || null,
    avg_days_between_visits: null,
    avg_party_size: 1.0,
    avg_revenue_per_visit: Math.round(avgSpend),
    total_revenue: Math.round(avgSpend * row.visit_count),
    highest_single_visit_revenue: Math.round(avgSpend),
    lifetime_value: Math.round(avgSpend * Math.max(row.visit_count, 2) * 1.2),
    churn_risk_score: churn,
    customer_tier: tier,
    updated_at: new Date().toISOString(),
  };
}

/**
 * Build a service_records row to seed revenue-stats avg_spend.
 * Returns null if avg_spend is missing.
 */
function buildServiceRecord(row, restaurantId) {
  if (!row.avg_spend) return null;
  return {
    restaurant_id: restaurantId,
    customer_phone: row.customer_phone,
    total_bill: row.avg_spend,
    party_size: 1,
    status: 'completed',
    source: 'import',
  };
}

module.exports = { parseCSVBuffer, normalizeRow, computeTier, buildLTVRecord, buildServiceRecord };
