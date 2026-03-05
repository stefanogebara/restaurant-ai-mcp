import Anthropic from '@anthropic-ai/sdk';

// In-memory rate limiting fallback
const ipCounts = new Map();
const WINDOW_MS = 10 * 60 * 1000; // 10 minutes
const MAX_REQUESTS = 20;

function checkRateLimit(ip) {
  const now = Date.now();
  const entry = ipCounts.get(ip);

  if (!entry || now - entry.start > WINDOW_MS) {
    ipCounts.set(ip, { start: now, count: 1 });
    return true;
  }

  if (entry.count >= MAX_REQUESTS) {
    return false;
  }

  entry.count += 1;
  return true;
}

// Clean up old entries periodically
setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of ipCounts) {
    if (now - entry.start > WINDOW_MS) {
      ipCounts.delete(ip);
    }
  }
}, 60_000);

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket?.remoteAddress || 'unknown';

  if (!checkRateLimit(ip)) {
    return res.status(429).json({ error: 'Rate limit exceeded. Try again in a few minutes.' });
  }

  const { message, context, lang } = req.body || {};

  if (!message || typeof message !== 'string' || message.length > 500) {
    return res.status(400).json({ error: 'Invalid message' });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'AI service not configured' });
  }

  const ctx = context || {};
  const occupied = ctx.occupiedTables ?? 0;
  const total = ctx.totalTables ?? 12;
  const available = total - occupied;
  const occupancy = total > 0 ? Math.round((occupied / total) * 100) : 0;

  const respondIn = lang === 'pt-BR' ? 'Portuguese (Brazil)' : 'English';

  const systemPrompt = `You are a concise AI restaurant manager assistant for a demo restaurant called "Cantina da Praça" in São Paulo.

Current stats:
- Tables: ${occupied}/${total} occupied (${available} available, ${occupancy}% occupancy)
- Active parties: ${ctx.activeParties ?? 0} with ${ctx.totalGuests ?? 0} guests
- Reservations today: ${ctx.reservationsToday ?? 0}
- Waitlist: ${ctx.waitlistCount ?? 0}

Rules:
- Respond in ${respondIn}
- Keep responses under 2 sentences
- Be helpful, professional, and friendly
- You can advise on staffing, table management, waitlist, and reservations
- This is a demo — if asked about specific menu items or prices, say this is a demo environment`;

  try {
    const client = new Anthropic({ apiKey });
    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 150,
      system: systemPrompt,
      messages: [{ role: 'user', content: message }],
    });

    const reply = response.content?.[0]?.text || '';
    return res.status(200).json({ reply });
  } catch (err) {
    console.error('Demo chat error:', err?.message || err);
    return res.status(500).json({ error: 'AI service error' });
  }
}
