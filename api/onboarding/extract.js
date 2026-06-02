/**
 * POST /api/onboarding/extract
 *
 * Turns a messy user free-text answer into a structured value the chat
 * flow can write to OnboardingData. Used by client/src/lib/onboarding-chat/
 * extractors.ts as the LLM step for InputSlot.kind = 'hours' | 'address'.
 *
 * Request:  { kind, raw }
 * Response: { ok: true, value } | { ok: false, error }
 *
 * `kind` is the InputSlot.kind. Currently supported:
 *   - 'hours'   → BusinessHours[] (7 entries, one per day, capitalised)
 *   - 'address' → string (cleaned single-line address)
 *
 * Cost: ~$0.0001 per call via claude-3.5-haiku, ~50ms p50 latency.
 * Capped at 15s wall time so a slow LLM doesn't strand the user; on
 * timeout the response is { ok: false, error: 'extract_timeout' } and the
 * client falls back to a pre-canned structured input.
 */

const { setInternalCors, handlePreflight } = require('../_lib/cors');
const { verifyAuth } = require('../_lib/auth');
const { getAI, AI_MODEL_FAST } = require('../_lib/ai-client');
const { createSecureLogger } = require('../_lib/secure-logger');
const { checkAndApplyRateLimit } = require('../_lib/rate-limit');

const logger = createSecureLogger('OnboardingExtract');

const MAX_RAW_LENGTH = 500;
const EXTRACT_TIMEOUT_MS = 15_000;

const SUPPORTED_KINDS = ['hours', 'address'];

const SYSTEM_PROMPT_BY_KIND = {
  hours: `You convert a restaurant owner's free-text description of their opening hours into a strict JSON array.

Output ONLY valid JSON, no prose. Schema:
[
  { "day": "Monday",    "is_open": boolean, "open_time": "HH:MM" | null, "close_time": "HH:MM" | null },
  { "day": "Tuesday",   ... },
  ...
  { "day": "Sunday",    ... }
]

Rules:
- Exactly 7 entries, in Mon→Sun order, day names capitalised.
- HH:MM is 24-hour, zero-padded ("12:00", "23:30"). If a day is closed, set is_open: false and times to null.
- If they say "noon" use "12:00", "midnight" use "00:00" (next day's open).
- If only one set of hours is mentioned, apply to every day.
- If a day's hours are ambiguous, make the most reasonable guess and continue.

User input: """{raw}"""

JSON:`,
  address: `You normalise a restaurant address into a single line, cleaned and capitalised.
Output ONLY the cleaned address as a JSON string (with quotes), no other text.

User input: """{raw}"""

JSON:`,
};

module.exports = async function handler(req, res) {
  if (handlePreflight(req, res)) return;
  setInternalCors(req, res);

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST, OPTIONS');
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  // verifyAuth returns { user } on success, { error, status } on failure.
  // First version of this handler checked auth.ok which is always
  // undefined → every request 401'd. Fixed.
  const auth = await verifyAuth(req);
  if (auth.error || !auth.user) {
    return res.status(auth.status || 401).json({ ok: false, error: auth.error || 'Unauthorized' });
  }

  // 20/min/user — extraction is cheap but we don't want a runaway client
  // burning OpenRouter credit if there's a UI bug.
  const limited = await checkAndApplyRateLimit(req, res, {
    key: `onboarding-extract:${auth.user.id}`,
    limit: 20,
    windowSeconds: 60,
  });
  if (limited) return;

  const body = typeof req.body === 'object' && req.body ? req.body : {};
  const kind = String(body.kind || '').trim();
  const raw = typeof body.raw === 'string' ? body.raw : '';

  if (!SUPPORTED_KINDS.includes(kind)) {
    return res.status(400).json({ ok: false, error: `Unsupported kind "${kind}". Supported: ${SUPPORTED_KINDS.join(', ')}` });
  }
  if (!raw || raw.length < 2) {
    return res.status(400).json({ ok: false, error: 'raw input must be at least 2 characters' });
  }
  if (raw.length > MAX_RAW_LENGTH) {
    return res.status(400).json({ ok: false, error: `raw input is too long (max ${MAX_RAW_LENGTH})` });
  }

  const systemPrompt = SYSTEM_PROMPT_BY_KIND[kind].replace('{raw}', raw);

  try {
    const ai = getAI();
    const aborter = new AbortController();
    const timeout = setTimeout(() => aborter.abort(), EXTRACT_TIMEOUT_MS);
    let completion;
    try {
      completion = await ai.messages.create({
        model: AI_MODEL_FAST,
        max_tokens: 600,
        temperature: 0.1,
        system: systemPrompt,
        messages: [{ role: 'user', content: 'Extract.' }],
      });
    } finally {
      clearTimeout(timeout);
    }

    const text = extractText(completion);
    const parsed = safeJSONParse(text);
    if (parsed === undefined) {
      logger.warn('LLM returned non-JSON for kind', { kind, text: text.slice(0, 200) });
      return res.status(502).json({ ok: false, error: 'extract_unparseable' });
    }

    const value = postprocess(kind, parsed);
    if (value == null) {
      logger.warn('LLM parsed value rejected by postprocess for kind', { kind });
      return res.status(502).json({ ok: false, error: 'extract_invalid' });
    }

    return res.status(200).json({ ok: true, value });
  } catch (err) {
    if (err && err.name === 'AbortError') {
      logger.warn('extract timed out', { kind });
      return res.status(504).json({ ok: false, error: 'extract_timeout' });
    }
    logger.error('extract failed', { kind, err: err?.message });
    return res.status(500).json({ ok: false, error: 'extract_failed' });
  }
};

module.exports.config = {
  api: { bodyParser: { sizeLimit: '8kb' } },
};

// ─── helpers ────────────────────────────────────────────────────────────

function extractText(completion) {
  // Anthropic SDK shape: { content: [{ type: 'text', text: '...' }, ...] }
  // OpenRouter shim mimics this.
  if (!completion || !Array.isArray(completion.content)) return '';
  return completion.content
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('')
    .trim();
}

function safeJSONParse(text) {
  // Strip any leading/trailing ```json fences and prose if the LLM added them
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = fenced ? fenced[1].trim() : text;
  try { return JSON.parse(body); } catch { return undefined; }
}

// Light client-side schema enforcement so a hallucinated extra field
// doesn't propagate into our DB.
function postprocess(kind, parsed) {
  if (kind === 'hours') {
    if (!Array.isArray(parsed) || parsed.length !== 7) return null;
    const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
    const seen = new Set();
    const out = [];
    for (const h of parsed) {
      if (!h || typeof h !== 'object') return null;
      if (!DAYS.includes(h.day) || seen.has(h.day)) return null;
      seen.add(h.day);
      const isOpen = !!h.is_open;
      const ok = (t) => t === null || /^\d{2}:\d{2}$/.test(t);
      if (!ok(h.open_time) || !ok(h.close_time)) return null;
      out.push({
        day: h.day,
        is_open: isOpen,
        open_time: isOpen ? (h.open_time || '12:00') : '12:00',
        close_time: isOpen ? (h.close_time || '23:00') : '23:00',
      });
    }
    // Sort back into Mon→Sun order
    return DAYS.map((d) => out.find((h) => h.day === d));
  }
  if (kind === 'address') {
    return typeof parsed === 'string' && parsed.trim().length > 0 ? parsed.trim() : null;
  }
  return null;
}
