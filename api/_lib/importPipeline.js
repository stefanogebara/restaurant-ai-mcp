'use strict';

const { parse } = require('csv-parse/sync');

const DEFAULT_AVG_SPEND = 80;

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
 * Normalize a CSV header for alias lookup: lowercase, strip accents, trim,
 * collapse spaces/hyphens to underscores ("Ultima Visita" -> "ultima_visita",
 * "E-mail" -> "e_mail").
 */
function normalizeHeaderKey(key) {
  return String(key || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[\s-]+/g, '_');
}

// Accepted header aliases per canonical field. PT/ES names included because
// BR/MX POS exports use localized headers -- before this, every row was
// silently skipped and the import failed (2026-06-10 audit).
const HEADER_ALIASES = {
  phone: ['phone', 'customer_phone', 'phone_number', 'telefone', 'telefono', 'celular', 'whatsapp', 'tel'],
  name: ['name', 'customer_name', 'nome', 'nombre', 'cliente'],
  email: ['email', 'customer_email', 'e_mail', 'correo'],
  visits: ['visits', 'visit_count', 'total_visits', 'visitas'],
  last_visit: ['last_visit', 'last_visit_date', 'ultima_visita', 'data_ultima_visita'],
  avg_spend: ['avg_spend', 'average_spend', 'spend', 'gasto_medio', 'gasto_promedio', 'consumo_medio'],
};

/**
 * Map raw CSV row to canonical fields. Header matching is case-, accent- and
 * separator-insensitive. Returns null if phone is missing.
 * @param {Record<string, string>} row
 * @returns {{ customer_name, customer_phone, customer_email, visit_count, last_visit_date, avg_spend } | null}
 */
function normalizeRow(row) {
  const normalized = {};
  for (const [key, value] of Object.entries(row)) {
    normalized[normalizeHeaderKey(key)] = value;
  }
  const pick = (field) => {
    for (const alias of HEADER_ALIASES[field]) {
      const v = normalized[alias];
      if (v !== undefined && v !== null && String(v).trim()) return String(v);
    }
    return '';
  };

  const phone = pick('phone').trim();
  if (!phone) return null;

  const name = pick('name').trim();
  const email = pick('email').trim() || null;
  const visit_count = Math.max(1, parseInt(pick('visits') || '1', 10) || 1);
  const last_visit_date = pick('last_visit').trim() || null;
  const spendRaw = pick('avg_spend');
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
