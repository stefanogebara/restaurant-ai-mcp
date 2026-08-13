/**
 * Prévia beacon endpoint (P3).
 *
 * POST /api/previa-event
 * Body: { token: string, event: 'opened' | 'cta_tapped' }
 *
 * DELIBERATELY PUBLIC (lead-facing beacon, same posture as push-subscribe.js) —
 * the token is an unguessable demo UUID. Records the open / CTA tap on the lead's
 * cockpit timeline and, on the FIRST in-hours open, has Olímpia react with one
 * warm line. The reaction is deduped once-per-lead here and, in respondToProspect,
 * gated by the global kill switch, the state gate (silent in optout/handoff/
 * agendado), the Meta 24h window, and business hours. Worst-case abuse with a
 * leaked token: a single reaction the real open would have triggered anyway.
 */

const { createSecureLogger } = require('./_lib/secure-logger');
const { checkAndApplyRateLimit, acquireProcessingLock, releaseProcessingLock } = require('./_lib/rate-limit');
const { setInternalCors } = require('./_lib/cors');
const { recordEvent } = require('./_lib/prospecting/prospect-store');
const { onlyDigits } = require('./_lib/prospecting/phone');
const { mapTokenToLead, previaJaReagida, PREVIA_REACAO_MARK } = require('./_lib/prospecting/prospect-demo');
const { respondToProspect } = require('./_lib/prospecting/prospect-responder');

const logger = createSecureLogger('PreviaEvent');
// 'paid' vem do demo fixo do Racha (a pessoa pagou a conta de mentira pelo QR)
// — o sinal mais forte que o funil tem; entra na timeline e conta pra reação.
const VALID_EVENTS = new Set(['opened', 'cta_tapped', 'paid']);
const EVENT_LABELS = {
  opened: '👀 abriu a prévia',
  cta_tapped: '👆 tocou "me chama aqui" na prévia',
  paid: '💸 pagou a conta de mentira no demo',
};

module.exports = async (req, res) => {
  setInternalCors(req, res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const rateLimited = await checkAndApplyRateLimit(req, res, 'customer_portal');
  if (rateLimited) return;

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  const { token, event } = req.body || {};
  if (!token || typeof token !== 'string' || !VALID_EVENTS.has(event)) {
    return res.status(400).json({ success: false, error: 'token and valid event required' });
  }

  try {
    const lead = await mapTokenToLead(token);
    // Unknown / expired / non-prospect token → 200 no-op (never leak which
    // tokens are valid, and demos not created by prospecting simply have no lead).
    if (!lead) return res.status(200).json({ success: true });

    await recordEvent(lead.id, EVENT_LABELS[event]);

    // React once, on the first in-hours open OR paid. cta_tapped is
    // visibility-only — the lead is already heading back to the chat, no
    // proactive nudge needed. A per-lead lock serializes concurrent opens
    // (reload / two devices) so the check-then-react is atomic: the loser
    // skips instead of double-sending.
    if (event === 'opened' || event === 'paid') {
      const lockKey = `previa-reacao:${lead.id}`;
      let locked = false;
      try { locked = await acquireProcessingLock(lockKey, 60); } catch { locked = false; }
      if (locked) {
        try {
          if (!(await previaJaReagida(lead.id))) {
            const from = onlyDigits(lead.whatsapp_phone);
            if (from) {
              const result = await respondToProspect({ lead, from, text: '', mode: 'previa', skipPacing: true });
              // Mark ONLY on a real send: an off-hours/window/opt-out skip retries
              // on the next open, and a failed Meta send never burns the reaction.
              if (result && result.action === 'previa_reacao' && result.sent) {
                await recordEvent(lead.id, `${PREVIA_REACAO_MARK} — perguntou o que o lead achou`);
              } else {
                logger.info(`previa-reacao lead=${lead.id} não enviada: ${result && (result.reason || 'sent=false')}`);
              }
            }
          }
        } finally {
          releaseProcessingLock(lockKey).catch(() => {});
        }
      }
    }

    return res.status(200).json({ success: true });
  } catch (err) {
    logger.error('previa-event error:', err.message);
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
};
