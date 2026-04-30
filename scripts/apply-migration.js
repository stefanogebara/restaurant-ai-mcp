#!/usr/bin/env node
/**
 * Apply a Supabase migration via direct postgres connection.
 *
 * Usage:
 *   node scripts/apply-migration.js <migration-file>
 *   node scripts/apply-migration.js supabase/migrations/20260430_proactive_comms_queue.sql
 *
 * Reads SUPABASE_DB_URL or constructs it from SUPABASE_URL +
 * SUPABASE_DB_PASSWORD in .env.local. Falls back to printing the SQL with
 * apply-via-studio instructions if no DB connection is available.
 */

require('dotenv').config({ path: '.env.local' });

const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

async function main() {
  const file = process.argv[2];
  if (!file) {
    console.error('Usage: node scripts/apply-migration.js <migration-file>');
    process.exit(2);
  }

  const fullPath = path.resolve(file);
  if (!fs.existsSync(fullPath)) {
    console.error(`Migration file not found: ${fullPath}`);
    process.exit(2);
  }

  const sql = fs.readFileSync(fullPath, 'utf8');
  console.log(`Applying migration: ${path.basename(fullPath)} (${sql.length} chars)`);

  // Build connection string
  // Supabase pooled connection: postgres://postgres.<ref>:<password>@aws-0-us-east-1.pooler.supabase.com:6543/postgres
  // Direct: postgresql://postgres:<password>@db.<ref>.supabase.co:5432/postgres
  const dbUrl = process.env.SUPABASE_DB_URL || process.env.DATABASE_URL;
  if (!dbUrl) {
    console.error('No SUPABASE_DB_URL / DATABASE_URL in .env.local.');
    console.error('');
    console.error('Apply this migration manually:');
    console.error('  1. Open https://supabase.com/dashboard/project/<your-project>/sql');
    console.error('  2. Paste the contents of:');
    console.error(`     ${fullPath}`);
    console.error('  3. Run.');
    console.error('');
    console.error('Or set SUPABASE_DB_URL=postgresql://... in .env.local');
    process.exit(1);
  }

  const client = new Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });
  try {
    await client.connect();
    console.log('Connected to Postgres.');
    await client.query(sql);
    console.log('Migration applied successfully.');
  } catch (err) {
    console.error('Migration failed:', err.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();
