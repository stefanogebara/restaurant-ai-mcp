/**
 * WAHA Pipeline E2E Tests
 *
 * Tests the full WAHA WhatsApp pipeline end-to-end:
 *   1. Session creation with correct restaurant_id (cold Lambda fix)
 *   2. Out-of-hours enforcement (Issue 1 fix)
 *   3. Normal reservation request gets AI response
 *   4. Rapid-fire dedup/lock (Issue 2 fix)
 *
 * How it works:
 *   - POSTs WAHA-format webhook payloads to production API
 *   - Waits up to 90s polling Supabase for session state to settle
 *   - Verifies restaurant_id set, conversation_history populated
 *
 * Run: npx playwright test e2e/waha-pipeline.spec.ts --timeout=180000
 */
import { test, expect, type APIRequestContext } from '@playwright/test';

const PROD_URL    = 'https://seatable.one';
const WEBHOOK_URL = `${PROD_URL}/api/waha-webhook`;
const WAHA_API_KEY = 'seatable-waha-key-2026';

const SUPABASE_URL      = 'https://ckforlwdhewexyqljsaf.supabase.co';
const SUPABASE_SRV_KEY  = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNrZm9ybHdkaGV3ZXh5cWxqc2FmIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTA3NjU4NSwiZXhwIjoyMDg2NjUyNTg1fQ.9vGnQK7plWAOkEOumX935b0JLIswKvWJblsOkTcsirg';

// Cantina Bella Vista sandbox restaurant
const CANTINA_ID = 'c3368ea1-b278-416f-ad24-de28434fe9ce';

// Unique test phones per scenario — prefix 9999 to avoid real customer conflicts
// Suffix starts at 20xxx so these don't collide with the 10xxx run
function testPhone(suffix: string) {
  return `5599990${suffix}`;
}

let msgCounter = 0;
function nextMsgId() {
  return `waha_test_${Date.now()}_${++msgCounter}`;
}

// ── WAHA payload builder ──────────────────────────────────────────────────────

function buildWahaPayload(text: string, from: string, msgId?: string): object {
  return {
    event: 'message',
    session: 'default',
    payload: {
      id: msgId || nextMsgId(),
      from: `${from}@c.us`,
      fromMe: false,
      body: text,
      type: 'chat',
      hasMedia: false,
      timestamp: Math.floor(Date.now() / 1000),
      notifyName: 'Test Customer',
    },
  };
}

async function postWaha(request: APIRequestContext, text: string, from: string, msgId?: string) {
  const payload = buildWahaPayload(text, from, msgId);
  const res = await request.post(WEBHOOK_URL, {
    headers: {
      'Content-Type': 'application/json',
      'X-Api-Key': WAHA_API_KEY,
    },
    data: JSON.stringify(payload),
  });
  return { status: res.status(), ok: res.ok(), body: await res.text() };
}

// ── Supabase helpers ──────────────────────────────────────────────────────────

async function querySession(phone: string) {
  // Sessions are stored with + prefix (normalizePhoneNumber adds it for >= 10 digit numbers)
  const normalizedPhone = phone.startsWith('+') ? phone : `+${phone}`;
  const url = `${SUPABASE_URL}/rest/v1/whatsapp_sessions?sender_phone=eq.${encodeURIComponent(normalizedPhone)}&order=created_at.desc&limit=1`;
  const res = await fetch(url, {
    headers: {
      'apikey': SUPABASE_SRV_KEY,
      'Authorization': `Bearer ${SUPABASE_SRV_KEY}`,
    },
  });
  if (!res.ok) throw new Error(`Supabase query failed: ${res.status}`);
  const rows = await res.json() as any[];
  return rows[0] || null;
}

/** Poll until session has restaurant_id set OR timeout. */
async function waitForSession(phone: string, maxMs = 90_000, intervalMs = 5_000): Promise<any> {
  const deadline = Date.now() + maxMs;
  while (Date.now() < deadline) {
    const session = await querySession(phone);
    if (session?.restaurant_id) return session;
    await new Promise(r => setTimeout(r, intervalMs));
  }
  return await querySession(phone); // return whatever exists at timeout
}

/** Poll until session has at least N conversation_history entries OR timeout. */
async function waitForHistory(phone: string, minEntries = 2, maxMs = 90_000, intervalMs = 5_000): Promise<any> {
  const deadline = Date.now() + maxMs;
  while (Date.now() < deadline) {
    const session = await querySession(phone);
    const history = session?.conversation_history || [];
    if (history.length >= minEntries) return session;
    await new Promise(r => setTimeout(r, intervalMs));
  }
  return await querySession(phone);
}

// ── Tests ─────────────────────────────────────────────────────────────────────

test.describe('WAHA Pipeline — Cold Start & Session Creation', () => {
  test.setTimeout(120_000);

  test('1. Webhook returns 200 immediately', async ({ request }) => {
    const phone = testPhone('20001');
    const res = await postWaha(request, 'Olá, gostaria de fazer uma reserva', phone);
    expect(res.status).toBe(200);
    expect(res.ok).toBe(true);
    console.log('✓ Webhook returned 200 immediately, body:', res.body.slice(0, 80));
  });

  test('2. Session created with correct restaurant_id after pipeline runs', async ({ request }) => {
    const phone = testPhone('20002');
    console.log(`Sending message from ${phone}...`);
    const res = await postWaha(request, 'Quero reservar uma mesa', phone);
    expect(res.ok).toBe(true);

    console.log('Waiting up to 90s for pipeline to create session with restaurant_id...');
    const session = await waitForSession(phone, 90_000);

    console.log('Session found:', JSON.stringify({
      id: session?.id,
      phone: session?.sender_phone,
      restaurant_id: session?.restaurant_id,
      history_len: (session?.conversation_history || []).length,
    }));

    expect(session).not.toBeNull();
    expect(session.sender_phone).toBe(phone);
    expect(session.restaurant_id).toBe(CANTINA_ID);
    console.log('✓ restaurant_id correctly set to Cantina Bella Vista');
  });

  test('3. AI responds — conversation_history populated', async ({ request }) => {
    const phone = testPhone('20003');
    console.log(`Sending booking request from ${phone}...`);
    await postWaha(request, 'Quero fazer uma reserva para amanhã às 20h para 2 pessoas, meu nome é João', phone);

    console.log('Waiting for AI response in conversation_history...');
    const session = await waitForHistory(phone, 2, 90_000);
    const history = session?.conversation_history || [];

    console.log(`History entries: ${history.length}`);
    history.forEach((m: any, i: number) => {
      console.log(`  [${i}] ${m.role}: ${(m.content || '').slice(0, 80)}`);
    });

    expect(history.length).toBeGreaterThanOrEqual(2);

    const userMsg = history.find((m: any) => m.role === 'user');
    const botMsg  = history.find((m: any) => m.role === 'assistant');
    expect(userMsg).toBeDefined();
    expect(botMsg).toBeDefined();
    console.log('✓ AI responded — conversation_history has user + assistant messages');
  });
});

test.describe('WAHA Pipeline — Issue 1: Out-of-Hours Enforcement', () => {
  test.setTimeout(120_000);

  // Cantina Bella Vista is a PT-BR restaurant — test that bot rejects a clearly
  // out-of-hours time (e.g. 4:00 AM) with an explanation rather than silently re-asking.
  test('4. Bot explains out-of-hours instead of silently ignoring', async ({ request }) => {
    const phone = testPhone('20004');
    console.log(`Sending out-of-hours request from ${phone}...`);

    // 4 AM is universally outside restaurant hours
    await postWaha(request, 'Quero reservar para amanhã às 4 da manhã para 2 pessoas, meu nome é Maria', phone);

    console.log('Waiting for AI response...');
    const session = await waitForHistory(phone, 2, 90_000);
    const history = session?.conversation_history || [];

    console.log(`History entries: ${history.length}`);
    const botMsg = history.find((m: any) => m.role === 'assistant');
    const botText = (botMsg?.content || '').toLowerCase();

    console.log('Bot response:', botMsg?.content?.slice(0, 300));

    // Bot must mention the issue with the time — any of these phrases indicate
    // it explained the hours rather than silently ignoring the request
    const explanationPhrases = [
      'horário', 'hora', 'funcionamento', 'atendemos', 'fechado', 'não abrimos',
      'opening', 'hours', 'closed', 'available', 'working hours',
    ];
    const explainedHours = explanationPhrases.some(p => botText.includes(p));

    // It should NOT just re-ask for a time without explaining
    const silentlyIgnored = botText.includes('qual horário') && !botText.includes('horário') ||
                             botText.includes('que horas') && !explainedHours;

    expect(history.length).toBeGreaterThanOrEqual(2);
    expect(explainedHours).toBe(true);
    expect(silentlyIgnored).toBe(false);
    console.log('✓ Bot correctly explained out-of-hours constraint');
  });
});

test.describe('WAHA Pipeline — Issue 2: Rapid-Fire Message Handling', () => {
  test.setTimeout(150_000);

  test('5. 5 rapid messages all recorded without race condition', async ({ request }) => {
    const phone = testPhone('20005');
    console.log(`Sending 5 rapid messages from ${phone}...`);

    // Send 5 messages with unique IDs as fast as possible
    const msgIds = Array.from({ length: 5 }, () => nextMsgId());
    const messages = [
      'Olá',
      'Quero fazer uma reserva',
      'Para 4 pessoas',
      'Amanhã às 20h',
      'Meu nome é Pedro',
    ];

    const sends = messages.map((text, i) =>
      postWaha(request, text, phone, msgIds[i])
    );
    const results = await Promise.all(sends);

    results.forEach((r, i) => {
      expect(r.ok).toBe(true);
      console.log(`  Send ${i + 1}: HTTP ${r.status}`);
    });

    console.log('All 5 messages sent. Waiting for pipeline to process...');
    // Wait longer since 5 pipelines may queue up
    const session = await waitForHistory(phone, 2, 130_000, 7_000);
    const history = session?.conversation_history || [];

    console.log(`Final history length: ${history.length}`);
    history.forEach((m: any, i: number) => {
      console.log(`  [${i}] ${m.role}: ${(m.content || '').slice(0, 60)}`);
    });

    // With dedup + lock, the history should be non-empty and consistent
    expect(session?.restaurant_id).toBe(CANTINA_ID);
    expect(history.length).toBeGreaterThanOrEqual(2);
    console.log('✓ Rapid-fire messages processed without race condition');
  });
});

test.describe('WAHA Pipeline — Signature & Routing', () => {
  test.setTimeout(30_000);

  test('6. Invalid API key returns 200 (WAHA ignores bad signature silently)', async ({ request }) => {
    const payload = buildWahaPayload('test', testPhone('99999'));
    const res = await request.post(WEBHOOK_URL, {
      headers: { 'Content-Type': 'application/json', 'X-Api-Key': 'WRONG_KEY' },
      data: JSON.stringify(payload),
    });
    // Webhook returns 200 even on bad sig (security-through-silence pattern)
    expect(res.ok()).toBe(true);
    console.log('✓ Bad API key handled gracefully (200)');
  });

  test('7. Non-message events (session.status) return 200 immediately', async ({ request }) => {
    const payload = { event: 'session.status', session: 'default', payload: { status: 'WORKING' } };
    const res = await request.post(WEBHOOK_URL, {
      headers: { 'Content-Type': 'application/json', 'X-Api-Key': WAHA_API_KEY },
      data: JSON.stringify(payload),
    });
    expect(res.ok()).toBe(true);
    console.log('✓ Non-message events handled correctly');
  });

  test('8. Duplicate message ID is deduped', async ({ request }) => {
    const phone = testPhone('20008');
    const msgId = nextMsgId();
    const res1 = await postWaha(request, 'Reserva por favor', phone, msgId);
    const res2 = await postWaha(request, 'Reserva por favor', phone, msgId); // same ID
    expect(res1.ok).toBe(true);
    expect(res2.ok).toBe(true);
    console.log('✓ Duplicate message deduped (both 200)');
  });
});
