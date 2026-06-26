'use strict';

/**
 * Prospect responder — the runtime orchestration for one inbound reply.
 *
 * Ported (condensed) from prospectautomation's olivia-responder. Pipeline:
 *   state gate → deterministic opt-out → business-hours defer → per-lead lock →
 *   load history → LLM (generateReply) → execute action → send (paced) → persist.
 *
 * SAFETY: DRY-RUN is default-ON and is FORCED ON whenever PROSPECTING_PHONE_NUMBER_ID
 * is unset — so cold outreach can never accidentally go out from the customer
 * reservation number. Set PROSPECTING_DRY_RUN=false AND configure the dedicated
 * number to send for real. The deterministic opt-out runs before the LLM (LGPD).
 */

const { createSecureLogger } = require('../secure-logger');
const { sendWhatsAppMessage } = require('../whatsapp-sender');
const { acquireProcessingLock, releaseProcessingLock } = require('../rate-limit');
const { getProspectingPhoneNumberId } = require('./routing');
const { deveResponder, detectarOptout, estadoAposAcao } = require('./prospect-state');
const { dentroDoHorario, proximaAbertura } = require('./prospect-hours');
const { pacingDelayMs } = require('./prospect-pacing');
const { extrairEmail } = require('./prospect-extract');
const { mergeFatos } = require('./prospect-facts');
const { generateReply } = require('./prospect-agent');
const { loadHistory, patchLead, recordOptout, storeMessage } = require('./prospect-store');

const logger = createSecureLogger('ProspectResponder');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * DRY-RUN is on by default and forced on without a dedicated prospecting number.
 * Only `PROSPECTING_DRY_RUN=false` + a configured number sends for real.
 */
function isDryRun() {
  if (!getProspectingPhoneNumberId()) return true;
  return process.env.PROSPECTING_DRY_RUN !== 'false';
}

/** Send a single message from the prospecting number, after a human-like delay. */
async function sendPaced(to, texto, { skipPacing = false } = {}) {
  const dryRun = isDryRun();
  // Deferred (flush) replies are already hours late — typing-pace adds nothing
  // but execution time, so the flush cron skips it to fit more per invocation.
  const delay = pacingDelayMs(texto, { dryRun, disabled: skipPacing });
  if (delay) await sleep(delay);
  if (dryRun) {
    logger.info(`[DRY RUN] would send to ${String(to).slice(0, 4)}**** len=${(texto || '').length}`);
    return { success: true, dryRun: true, messageId: null };
  }
  return sendWhatsAppMessage(to, texto, { phoneNumberId: getProspectingPhoneNumberId() });
}

/** Persist an outbound bubble to the conversation log. */
async function recordOutbound(leadId, texto, sendResult) {
  await storeMessage({
    leadId,
    direcao: 'out',
    wamid: sendResult && sendResult.messageId ? sendResult.messageId : null,
    tipo: 'text',
    corpo: texto,
  });
}

/**
 * Respond to one inbound prospect message.
 *
 * @param {object} args
 * @param {object} args.lead   - prospect_leads row (must exist)
 * @param {string} args.from   - inbound phone (bare digits from Meta)
 * @param {string} args.text   - inbound text
 * @param {number} [args.nowMs]
 * @param {boolean} [args.skipPacing] - skip typing-pace (used by the flush cron)
 * @returns {Promise<{action: string, sent?: boolean, dryRun?: boolean}>}
 */
async function respondToProspect({ lead, from, text, nowMs = Date.now(), skipPacing = false }) {
  const pace = { skipPacing };
  // 1. State gate — silent in optout/handoff/agendado/pausada.
  if (!deveResponder(lead.prospect_state)) {
    return { action: 'skip', reason: `silent_state:${lead.prospect_state}` };
  }

  // 2. Deterministic opt-out BEFORE the LLM (LGPD). Terminal.
  if (detectarOptout(text)) {
    await recordOptout({ phone: from, leadId: lead.id, reason: 'keyword' });
    logger.info(`[prospect] opt-out detected lead=${lead.id}`);
    return { action: 'optout' };
  }

  // 3. Business-hours gate — defer to next opening (prospect-flush resumes in
    //    Phase 2). Bypass with PROSPECTING_IGNORE_HOURS=true for testing.
  if (process.env.PROSPECTING_IGNORE_HOURS !== 'true' && !dentroDoHorario(nowMs)) {
    const replyApos = proximaAbertura(nowMs);
    await patchLead(lead.id, { reply_apos: replyApos });
    logger.info(`[prospect] outside business hours, deferred lead=${lead.id} until ${replyApos}`);
    return { action: 'deferred', replyApos };
  }

  // 4. Email capture (best-effort) — merged into facts/columns when we reply.
  const email = extrairEmail(text);

  // 5. Per-lead lock — serialize concurrent inbounds for the same phone so the
  //    history we read isn't racing another Lambda's write.
  const lockKey = `prospect:${from}`;
  const locked = await acquireProcessingLock(lockKey, 30).catch(() => false);

  try {
    // 6. Load history (includes the inbound just stored by prospect-inbound).
    const history = await loadHistory(lead.id, 40);
    if (history.length === 0) {
      logger.warn(`[prospect] no history for lead=${lead.id}; skipping`);
      return { action: 'skip', reason: 'no_history' };
    }

    // 7. Generate the next action.
    const acao = await generateReply({
      lead: {
        name: lead.name,
        owner_name: lead.owner_name,
        sector: lead.sector,
        city: lead.city,
        nome_genero: lead.nome_genero,
        conversa_fatos: lead.conversa_fatos,
        conversa_resumo: lead.conversa_resumo,
      },
      history,
      nowMs,
    });

    // 8. Build the state patch from the action.
    const next = estadoAposAcao(acao);
    const patch = {};
    if (next) patch.prospect_state = next;
    if (email && email !== lead.prospect_email) {
      patch.prospect_email = email;
      patch.conversa_fatos = mergeFatos(lead.conversa_fatos, { email });
    }
    // First reply from the lead → reflect 'replied' send status.
    if (['sent', 'delivered', 'read'].includes(lead.whatsapp_send_status)) {
      patch.whatsapp_send_status = 'replied';
    }

    // 9. Execute the action.
    let sent = false;
    let dryRun = false;
    switch (acao.tipo) {
      case 'optout':
        await recordOptout({ phone: from, leadId: lead.id, reason: 'llm' });
        break;

      case 'ignorar':
      case 'nada':
        // Deliberate silence — no send, no forced state change.
        break;

      case 'handoff':
        patch.handoff_motivo = acao.motivo || null;
        if (acao.texto) {
          const r = await sendPaced(from, acao.texto, pace);
          sent = !r.dryRun && r.success; dryRun = !!r.dryRun;
          await recordOutbound(lead.id, acao.texto, r);
        }
        break;

      case 'registrar_responsavel':
        // Phase 1: capture the referred contact + hand to a human (auto
        // owner-onboarding — firing the intro template to the new number —
        // lands in Phase 2 with the outbound sequencer).
        patch.prospect_state = 'handoff';
        patch.handoff_motivo = `responsável indicado: ${acao.numero}${acao.nome ? ` (${acao.nome})` : ''}`;
        patch.conversa_fatos = mergeFatos(patch.conversa_fatos || lead.conversa_fatos, {
          nome_responsavel: acao.nome || undefined,
          notas: [`Responsável indicado pelo WhatsApp: ${acao.numero}`],
        });
        if (acao.texto) {
          const r = await sendPaced(from, acao.texto, pace);
          sent = !r.dryRun && r.success; dryRun = !!r.dryRun;
          await recordOutbound(lead.id, acao.texto, r);
        }
        break;

      case 'agendar': {
        // Phase 1: the agent captured scheduling intent. Send its text (it asked
        // for a preferred time) and move to 'agendando'. Real calendar booking
        // (free/busy, Meet link) is Phase 4 — we NEVER claim a slot is booked.
        const texto = acao.texto || 'Perfeito! Qual dia e horário fica melhor pra você?';
        const r = await sendPaced(from, texto, pace);
        sent = !r.dryRun && r.success; dryRun = !!r.dryRun;
        await recordOutbound(lead.id, texto, r);
        if (acao.resumo && acao.resumo !== 'sem detalhe') {
          patch.conversa_fatos = mergeFatos(patch.conversa_fatos || lead.conversa_fatos, {
            disponibilidade: acao.resumo,
          });
        }
        break;
      }

      case 'responder':
      default:
        if (acao.tipo === 'responder' && acao.texto) {
          const r = await sendPaced(from, acao.texto, pace);
          sent = !r.dryRun && r.success; dryRun = !!r.dryRun;
          await recordOutbound(lead.id, acao.texto, r);
        }
        break;
    }

    // 10. Persist state.
    if (Object.keys(patch).length) await patchLead(lead.id, patch);

    logger.info(`[prospect] lead=${lead.id} action=${acao.tipo} sent=${sent} dryRun=${dryRun}`);
    return { action: acao.tipo, sent, dryRun };
  } finally {
    if (locked) releaseProcessingLock(lockKey).catch(() => {});
  }
}

module.exports = { respondToProspect, isDryRun };
