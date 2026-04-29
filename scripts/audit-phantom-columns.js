#!/usr/bin/env node
/**
 * Phantom column drift audit.
 *
 * Greps api/ for select() calls referencing columns that don't exist in the
 * actual schema. The Title-Case → snake_case Airtable→Supabase migration
 * left several callers querying phantom columns (e.g. reservations.guest_name,
 * service_records.table_id, customer_ltv.phone). Postgres returns a 400 but
 * many callers swallow the error and return empty data — Manager AI was
 * receiving an empty restaurant snapshot for weeks because of one such drift.
 *
 * This audit is heuristic — it flags KNOWN-BAD columns. Add to the
 * KNOWN_PHANTOMS map when a new drift is identified. Cheaper than a full
 * schema introspector; gives 80% of the value.
 *
 * Exit 1 on any phantom column reference outside __tests__.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', 'api');

// table → Set of column names that DO NOT exist (drift artifacts)
const KNOWN_PHANTOMS = {
  reservations: new Set(['guest_name', 'reservation_time', 'reservation_date']),
  service_records: new Set(['guest_name', 'table_id', 'guest_phone']),
  customer_ltv: new Set(['phone', 'total_spend', 'average_spend', 'tier', 'churn_risk', 'ltv_score', 'total_spent', 'visit_count', 'avg_spend_per_visit']),
};

// Files allowed to mention these strings (they accept them as inbound API params, not as DB queries)
const ALLOWLIST_FILES = new Set([
  'external-booking-webhook.js',  // Accepts guest_name/reservation_time as request body, maps to real cols
  'proactive-comms.js',           // Uses churn_risk as a JS object key/alias, not a DB column
]);

function* walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === '__tests__' || entry.name === 'node_modules') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(full);
    else if (entry.name.endsWith('.js')) yield full;
  }
}

const violations = [];

for (const file of walk(ROOT)) {
  const rel = path.relative(ROOT, file).replace(/\\/g, '/');
  if (ALLOWLIST_FILES.has(path.basename(file))) continue;

  const text = fs.readFileSync(file, 'utf8');
  const lines = text.split(/\r?\n/);

  for (const [table, phantoms] of Object.entries(KNOWN_PHANTOMS)) {
    // crude scan: lines containing both `from('<table>')` and the phantom
    // OR within ~15 lines of a from('<table>') call
    for (let i = 0; i < lines.length; i++) {
      if (!lines[i].includes(`from('${table}')`)) continue;
      // Look at next 25 lines for select/eq/order using phantoms
      const window = lines.slice(i, Math.min(i + 25, lines.length)).join('\n');
      // Confine the search to the content of single-quoted JS strings in the
      // window. This avoids false positives from JS variables/object-property
      // names that share a name with a phantom column (e.g. the `phone` param
      // in `.eq('customer_phone', phone)` or `reservation_time` used as a JS
      // computed property). String extraction uses matchAll, not RegExp.exec.
      const stringContents = [...window.matchAll(/'([^'\\]|\\.)*'/g)].map(m => m[0]).join('\n');

      for (const phantom of phantoms) {
        // Match phantom column name but not as a prefix of a longer column name
        // (e.g. 'churn_risk' must not match 'churn_risk_score').
        // Preceded by: quote, dot, or comma+optional-space (subsequent select items).
        const re = new RegExp(`(?:['".,]\\s*)${phantom}(?![\\w])`, 'g');
        if (re.test(stringContents)) {
          violations.push({ file: rel, line: i + 1, table, phantom });
        }
      }
    }
  }
}

if (violations.length === 0) {
  console.log('\u2713 no phantom-column references in api/');
  process.exit(0);
}

console.log(`\u2717 ${violations.length} phantom-column reference(s) found:\n`);
for (const v of violations) {
  console.log(`  api/${v.file}:${v.line}  table=${v.table}  phantom=${v.phantom}`);
}
console.log('\nFix: replace each with the real column. See scripts/audit-phantom-columns.js KNOWN_PHANTOMS for mapping.');
process.exit(1);
