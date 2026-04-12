/**
 * Seatable — Seed Demo Data for Video Recording
 *
 * Creates realistic reservations in the Cantina Bella Vista sandbox
 * so the dashboard looks alive during screen recording.
 *
 * Usage:
 *   node reels-toolkit/scripts/seed-demo-data.js
 *
 * This creates ~8 reservations for today at various times
 * with realistic Brazilian names and party sizes.
 */

import { readFileSync } from 'fs';
import { randomUUID } from 'crypto';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '../..');

function loadEnv() {
  const envPath = resolve(ROOT, '.env.local');
  const env = readFileSync(envPath, 'utf-8');
  const vars = {};
  for (const line of env.replace(/\r/g, '').split('\n')) {
    const match = line.match(/^([^#=]+)=(.+)$/);
    if (match) vars[match[1].trim()] = match[2].trim().replace(/^["']|["']$/g, '');
  }
  return vars;
}

const CANTINA_ID = 'c3368ea1-b278-416f-ad24-de28434fe9ce';

const RESERVATIONS = [
  { name: 'Maria Santos', phone: '+5511987654001', party: 4, hour: 12, min: 0, status: 'seated' },
  { name: 'João Silva', phone: '+5511987654002', party: 2, hour: 12, min: 30, status: 'confirmed' },
  { name: 'Ana Paula Costa', phone: '+5511987654003', party: 6, hour: 13, min: 0, status: 'confirmed' },
  { name: 'Carlos Mendes', phone: '+5511987654004', party: 3, hour: 19, min: 0, status: 'confirmed' },
  { name: 'Fernanda Lima', phone: '+5511987654005', party: 2, hour: 19, min: 30, status: 'confirmed' },
  { name: 'Rafael Santos', phone: '+5511987654006', party: 4, hour: 20, min: 0, status: 'confirmed' },
  { name: 'Luciana Ribeiro', phone: '+5511987654007', party: 8, hour: 20, min: 30, status: 'confirmed' },
  { name: 'Pedro Oliveira', phone: '+5511987654008', party: 2, hour: 21, min: 0, status: 'confirmed' },
];

async function seedReservations() {
  const env = loadEnv();
  const supabaseUrl = env.SUPABASE_URL || env.VITE_SUPABASE_URL;
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceKey) {
    console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local');
    process.exit(1);
  }

  const today = new Date();
  const dateStr = today.toISOString().split('T')[0];

  console.log(`\n🌱 Seeding ${RESERVATIONS.length} reservations for ${dateStr}`);
  console.log(`   Restaurant: Cantina Bella Vista (${CANTINA_ID})\n`);

  // Use RPC or direct insert via supabaseAdmin (service role bypasses RLS)
  // The key: use Prefer: return=representation to debug errors

  // First, delete existing demo reservations for today
  const deleteRes = await fetch(
    `${supabaseUrl}/rest/v1/reservations?restaurant_id=eq.${CANTINA_ID}&date=eq.${dateStr}&customer_phone=like.%2B5511987654*`,
    {
      method: 'DELETE',
      headers: {
        'apikey': serviceKey,
        'Authorization': `Bearer ${serviceKey}`,
        'Content-Type': 'application/json',
      },
    }
  );
  console.log(`   Cleaned existing demo data: ${deleteRes.status}`);

  // Insert new reservations one by one
  for (const r of RESERVATIONS) {
    const timeStr = `${String(r.hour).padStart(2, '0')}:${String(r.min).padStart(2, '0')}`;
    const reservationId = randomUUID();

    const resCode = `RES-${dateStr.replace(/-/g, '')}-${Math.random().toString(36).slice(2, 14)}`;
    const body = {
      id: reservationId,
      reservation_id: resCode,
      restaurant_id: CANTINA_ID,
      customer_name: r.name,
      customer_phone: r.phone,
      party_size: r.party,
      date: dateStr,
      time: timeStr,
      status: r.status,
      source: 'ai_voice',
    };

    const res = await fetch(`${supabaseUrl}/rest/v1/reservations`, {
      method: 'POST',
      headers: {
        'apikey': serviceKey,
        'Authorization': `Bearer ${serviceKey}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation',
      },
      body: JSON.stringify(body),
    });

    if (res.ok) {
      console.log(`   ✅ ${r.name} — ${r.party} guests at ${timeStr} (${r.status})`);
    } else {
      const err = await res.text();
      console.log(`   ❌ ${r.name}: ${res.status} — ${err.slice(0, 120)}`);
    }
  }

  console.log('\n✅ Demo data seeded! Dashboard will now show:');
  console.log(`   • ${RESERVATIONS.length} reservations today`);
  console.log(`   • ${RESERVATIONS.reduce((sum, r) => sum + r.party, 0)} expected guests`);
  console.log(`   • 1 table currently seated (Maria Santos)`);
  console.log('\n   Now run: node reels-toolkit/scripts/record-demo.js\n');
}

seedReservations().catch(console.error);
