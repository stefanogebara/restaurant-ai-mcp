'use strict';
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env.local') });
const https = require('https');

const SUPABASE_URL = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local');
  process.exit(1);
}

// Track seen sessions to detect changes
const seen = {};

async function query(path) {
  return new Promise((resolve, reject) => {
    const url = new URL(SUPABASE_URL + path);
    const opts = {
      hostname: url.hostname,
      path: url.pathname + url.search,
      method: 'GET',
      headers: { apikey: KEY, Authorization: `Bearer ${KEY}` },
    };
    const r = https.request(opts, (res) => {
      let body = '';
      res.on('data', c => body += c);
      res.on('end', () => resolve(JSON.parse(body)));
    });
    r.on('error', reject);
    r.end();
  });
}

async function poll() {
  const sessions = await query(
    '/rest/v1/whatsapp_sessions?order=last_message_at.desc&limit=10&select=id,sender_phone,restaurant_id,conversation_history,last_message_at,created_at'
  );

  const now = Date.now();
  for (const s of sessions) {
    const age = (now - new Date(s.last_message_at).getTime()) / 1000;
    if (age > 300) continue; // only show sessions active in last 5 min

    const key = s.id + ':' + s.last_message_at;
    if (seen[s.id] === key) continue; // no change
    seen[s.id] = key;

    const histLen = (s.conversation_history || []).length;
    const last = s.conversation_history?.slice(-2) || [];
    
    console.log('\n' + '='.repeat(60));
    console.log(`[${new Date().toLocaleTimeString()}] ACTIVE SESSION`);
    console.log(`Phone:       ${s.sender_phone}`);
    console.log(`Restaurant:  ${s.restaurant_id ? 'Cantina Bella Vista ✓' : 'NOT ASSIGNED ⚠️'}`);
    console.log(`Messages:    ${histLen}`);
    console.log(`Last update: ${s.last_message_at}`);
    
    if (last.length > 0) {
      console.log('\nRecent messages:');
      for (const m of last) {
        const role = m.role === 'user' ? '👤 User  ' : '🤖 Bot   ';
        const content = String(m.content).substring(0, 100);
        console.log(`  ${role}: ${content}`);
      }
    }
    
    if (histLen === 0 && s.restaurant_id) {
      console.log('⚠️  WARN: Restaurant assigned but no conversation history — processMessage may have failed');
    }
    if (!s.restaurant_id) {
      console.log('❌ ERROR: No restaurant_id — routing failed');
    }
    if (histLen >= 2) {
      console.log('✓ OK: Conversation history present');
    }
  }
}

console.log('Monitoring WhatsApp sessions (Ctrl+C to stop)...');
console.log('Send a message to +55 11 5028-9356 to test!\n');

poll().catch(console.error);
setInterval(() => poll().catch(console.error), 5000);
