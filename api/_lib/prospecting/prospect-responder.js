'use strict';

/**
 * Prospect responder — the runtime orchestration for one inbound reply.
 *
 * Ported from prospectautomation's olivia-responder (Phase 6: full burst +
 * naturalness mechanics). Pipeline:
 *   state gate → deterministic opt-out → business-hours defer → per-lead lock
 *   (losers exit) → burst debounce (wait for the lead to stop typing) → load
 *   history → last-is-out guard → per-inbound wamid claim → deterministic
 *   owner-number guardrail → booking shortcut → LLM → execute action →
 *   multi-bubble paced send → memory (facts + rolling summary) → persist.
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
const { pacingDelayMs, splitReplyParts, partPauseDelayMs } = require('./prospect-pacing');
const { extrairEmail, extrairNumeroDono, extrairNomeDono, extrairDddBr } = require('./prospect-extract');
const { mergeFatos } = require('./prospect-facts');
const { generateReply } = require('./prospect-agent');
const {
  loadHistory, patchLead, recordOptout, storeMessage,
  inboundFingerprint, claimInbound, updateIntent, recordEvent,
} = require('./prospect-store');
const booking = require('./prospect-booking');
const { extrairFatos, gerarResumo, RESUMO_MIN } = require('./prospect-reflect');
const { NUDGE_INSTRUCTION } = require('./prospect-nudge');

const logger = createSecureLogger('ProspectResponder');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Burst coalescing: wait for QUIET_MS of lead silence (reset on every new
// inbound) before answering, capped at MAX_WAIT_MS total. Olivia used 7s/45s;
// the cap here is tighter to fit comfortably inside the serverless budget
// (debounce + LLM + pacing + multi-bubble sends < maxDuration).
const COALESCE_QUIET_MS = parseInt(process.env.PROSPECTING_COALESCE_MS, 10) || 7000;
const COALESCE_MAX_MS = parseInt(process.env.PROSPECTING_COALESCE_MAX_MS, 10) || 24000;

function isTestMode() {
  return process.env.NODE_ENV === 'test';
}

/**
 * DRY-RUN is on by default and forced on without a dedicated prospecting number.
 * Only `PROSPECTING_DRY_RUN=false` + a configured number sends for real.
 */
function isDryRun() {
  if (!getProspectingPhoneNumberId()) return true;
  return process.env.PROSPECTING_DRY_RUN !== 'false';
}

/** Multi-bubble replies are ON by default; PROSPECTING_MULTIPART=0 disables. */
function multipartEnabled() {
  return process.env.PROSPECTING_MULTIPART !== '0';
}

/**
 * Send one logical reply as 1..3 humanized WhatsApp bubbles (split on blank
 * lines), each persisted as its OWN outbound row so history re-enters the
 * prompt as separate assistant turns — exactly how a person types. First
 * bubble pays the read+type pacing delay; subsequent bubbles a shorter pause.
 * A failed part aborts the rest (no half-conversations out of order).
 *
 * @returns {Promise<{success:boolean, dryRun:boolean, sentAny:boolean}>}
 */
async function sendReply(leadId, to, texto, { skipPacing = false } = {}) {
  const dryRun = isDryRun();
  const flags = { dryRun, disabled: skipPacing, testMode: isTestMode() };
  const parts = splitReplyParts(texto, { multipart: multipartEnabled() });
  if (parts.length === 0) return { success: true, dryRun, sentAny: false };

  let sentAny = false;
  for (let i = 0; i < parts.length; i++) {
    const delay = i === 0 ? pacingDelayMs(parts[i], flags) : partPauseDelayMs(parts[i], flags);
    if (delay) await sleep(delay);

    let result;
    if (dryRun) {
      logger.info(`[DRY RUN] would send to ${String(to).slice(0, 4)}**** part=${i + 1}/${parts.length} len=${parts[i].length}`);
      result = { success: true, dryRun: true, messageId: null };
    } else {
      result = await sendWhatsAppMessage(to, parts[i], { phoneNumberId: getProspectingPhoneNumberId() });
    }

    await storeMessage({
      leadId,
      direcao: 'out',
      wamid: result && result.messageId ? result.messageId : null,
      tipo: 'text',
      corpo: parts[i],
    });

    if (!dryRun && !(result && result.success)) {
      logger.error(`[prospect] send failed on part ${i + 1}/${parts.length} lead=${leadId}`);
      return { success: false, dryRun, sentAny };
    }
    if (!dryRun) sentAny = true;
  }
  return { success: true, dryRun, sentAny };
}

/**
 * Wait until the lead stops sending ("several quick bubbles" → one reply).
 * DB-polling on the inbound fingerprint; the winner's eventual history read
 * then covers the whole burst. Skipped in dry-run/test/flush paths.
 */
async function aguardarRajada(leadId) {
  let fp = await inboundFingerprint(leadId);
  if (fp === null) return; // degrade open on infra error
  const started = Date.now();
  for (;;) {
    await sleep(COALESCE_QUIET_MS);
    const fp2 = await inboundFingerprint(leadId);
    if (fp2 === null || fp2 === fp) return;       // quiet (or infra error) → answer
    fp = fp2;                                      // new bubble → restart window
    if (Date.now() - started >= COALESCE_MAX_MS) {
      logger.info(`[prospect] coalesce cap hit lead=${leadId} — answering mid-burst`);
      return;
    }
  }
}

/**
 * Respond to one inbound prospect message (or run an orchestrator mode).
 *
 * @param {object} args
 * @param {object} args.lead   - prospect_leads row (must exist)
 * @param {string} args.from   - inbound phone (bare digits from Meta)
 * @param {string} args.text   - inbound text ('' for placeholder-only media)
 * @param {number} [args.nowMs]
 * @param {boolean} [args.skipPacing] - skip typing-pace + debounce (flush cron)
 * @param {'nudge'|null} [args.mode]  - orchestrator mode: 'nudge' writes one
 *   natural follow-up (no tools) after ~23h of lead silence and stamps nudge_em.
 * @returns {Promise<{action: string, sent?: boolean, dryRun?: boolean}>}
 */
async function respondToProspect({ lead, from, text, nowMs = Date.now(), skipPacing = false, mode = null }) {
  const pace = { skipPacing };
  const isNudge = mode === 'nudge';

  // 1. State gate — silent in optout/handoff/agendado/pausada.
  if (!deveResponder(lead.prospect_state)) {
    return { action: 'skip', reason: `silent_state:${lead.prospect_state}` };
  }

  // 2. Deterministic opt-out BEFORE the LLM (LGPD). Terminal.
  if (!isNudge && detectarOptout(text)) {
    await recordOptout({ phone: from, leadId: lead.id, reason: 'keyword' });
    logger.info(`[prospect] opt-out detected lead=${lead.id}`);
    // One goodbye line so the request never meets silence (gym cycles 7-10) —
    // but only when the global kill switch allows the agent to speak at all.
    try {
      const { isCronEnabled } = require('../cron-config');
      if (await isCronEnabled('prospecting-agent')) {
        const { COMPANION_TEXT } = require('./prospect-agent');
        await sendReply(lead.id, from, COMPANION_TEXT.optout, { skipPacing: true });
      }
    } catch (err) {
      logger.warn('optout goodbye skipped:', err.message);
    }
    return { action: 'optout' };
  }

  // 2b. GLOBAL kill switch (ops platform / Supabase Studio): when the
  //     'prospecting-agent' cron_config row is disabled, the agent goes fully
  //     silent — inbounds still get stored (audit trail), opt-outs still record
  //     (LGPD, above), but nothing is generated or sent. Fail-open on infra
  //     errors (cron-config's posture) so a DB blip never mutes the agent.
  {
    const { isCronEnabled } = require('../cron-config');
    if (!(await isCronEnabled('prospecting-agent'))) {
      logger.info(`[prospect] agent globally disabled — skipping lead=${lead.id}`);
      return { action: 'skip', reason: 'agent_disabled' };
    }
  }

  // 3. Business-hours gate — defer to next opening (prospect-flush resumes).
  //    Bypass with PROSPECTING_IGNORE_HOURS=true for testing.
  if (process.env.PROSPECTING_IGNORE_HOURS !== 'true' && !dentroDoHorario(nowMs)) {
    if (isNudge) return { action: 'skip', reason: 'outside_hours' };
    const replyApos = proximaAbertura(nowMs);
    await patchLead(lead.id, { reply_apos: replyApos });
    logger.info(`[prospect] outside business hours, deferred lead=${lead.id} until ${replyApos}`);
    return { action: 'deferred', replyApos };
  }

  // 4. Email capture (best-effort) — merged into facts/columns when we reply.
  const email = isNudge ? null : extrairEmail(text);

  // 5. Per-lead lock — a burst of N bubbles fires N invocations; ONE survives
  //    and answers the whole burst (the debounce below reads them together).
  //    TTL covers debounce cap + LLM + pacing. Lock errors degrade open.
  const lockKey = `prospect:${from}`;
  let locked = true;
  try {
    locked = await acquireProcessingLock(lockKey, 90);
  } catch { locked = true; }
  if (!locked) {
    logger.info(`[prospect] lock lost lead=${lead.id} — another reply in flight`);
    return { action: 'skip', reason: 'lock_lost' };
  }

  try {
    // 5b. Burst debounce — wait for the lead to stop typing so one reply covers
    //     several quick bubbles (the #1 robotic tell). Skipped for flush/nudge
    //     (nothing to coalesce) and in dry-run/test (determinism).
    if (!isNudge && !skipPacing && !isDryRun() && !isTestMode()) {
      await aguardarRajada(lead.id);
    }

    // 6. Load history (includes the inbound just stored by prospect-inbound —
    //    and, after the debounce, every bubble of the burst). 'sys' rows are
    //    operator notes / timeline events (F6) — the console renders them, but
    //    the LLM must NEVER see them as conversation turns.
    const history = (await loadHistory(lead.id, 40)).filter((m) => m.direcao !== 'sys');
    if (history.length === 0) {
      logger.warn(`[prospect] no history for lead=${lead.id}; skipping`);
      return { action: 'skip', reason: 'no_history' };
    }

    const lastRow = history[history.length - 1];

    if (!isNudge) {
      // 6a-i. Idempotency: the newest message is OURS → there is no new inbound
      //       to answer (re-invocation, flush overlap, duplicate trigger).
      if (lastRow.direcao === 'out') {
        return { action: 'skip', reason: 'last_message_is_ours' };
      }
      // 6a-ii. Atomic per-inbound claim — the same wamid is answered exactly
      //        once across webhook/flush races. Degrades open; skipped in
      //        dry-run (testing repeatedly against the same message is useful).
      if (!isDryRun() && lastRow.wamid) {
        const claimed = await claimInbound(lead.id, lastRow.wamid);
        if (!claimed) {
          return { action: 'skip', reason: 'inbound_already_claimed' };
        }
      }
    }

    // The text the guardrails inspect: the LAST inbound in history (post-burst,
    // possibly newer than the `text` argument that triggered this invocation).
    const lastInText = (lastRow.direcao === 'in' && lastRow.corpo) ? lastRow.corpo : (text || '');

    // 6b. Deterministic owner-number guardrail (pre-LLM). When the last inbound
    //     contains a shared contact card or a near-bare phone number, force
    //     registrar_responsavel with THAT number — never let the model re-ask
    //     for a number that's on screen (the #1 inconsistency Olivia fixed).
    let acao = null;
    if (!isNudge) {
      const ddd = extrairDddBr(lead.whatsapp_phone);
      const numeroDono = extrairNumeroDono(lastInText, ddd);
      if (numeroDono) {
        acao = {
          tipo: 'registrar_responsavel',
          texto: null,
          numero: numeroDono,
          nome: extrairNomeDono(lastInText),
          deterministico: true,
        };
        logger.info(`[prospect] owner-number guardrail fired lead=${lead.id}`);
      }
    }

    // 6c. Calendar-authored booking shortcut (Phase 4). When the lead is
    //     mid-scheduling with proposed slots and booking is LIVE, interpret
    //     their reply DETERMINISTICALLY (pick a slot or suggest a time) and
    //     book the Meet event — the LLM never invents a meeting time. Runs
    //     AFTER the owner guardrail (a shared card mid-scheduling must not be
    //     misparsed as a slot choice).
    if (!acao && !isNudge && lead.prospect_state === 'agendando' && booking.bookingDisponivel() && !isDryRun()) {
      const conf = await booking.confirmarReuniao(lead, lastInText, nowMs);
      if (conf.handled) {
        const r = await sendReply(lead.id, from, conf.mensagem, pace);
        const patch = { ...(conf.patch || {}) };
        if (lead.reply_apos) patch.reply_apos = null;
        if (Object.keys(patch).length) await patchLead(lead.id, patch);
        if (conf.booked) {
          await recordEvent(lead.id, `📅 reunião marcada pela agenda${conf.patch && conf.patch.reuniao_at ? ` — ${conf.patch.reuniao_at}` : ''}`);
        }
        logger.info(`[prospect] lead=${lead.id} action=booking booked=${!!conf.booked}`);
        return { action: conf.booked ? 'agendado' : 'agendando', sent: r.sentAny, dryRun: r.dryRun };
      }
    }

    // 7. Generate the next action (unless the guardrail already decided).
    if (!acao) {
      acao = await generateReply({
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
        injectUserTurn: isNudge ? NUDGE_INSTRUCTION : null,
        noTools: isNudge,
      });
    }

    // 8. Build the state patch from the action.
    const next = estadoAposAcao(acao);
    const patch = {};
    if (next) patch.prospect_state = next;
    if (lead.reply_apos) patch.reply_apos = null; // we're answering now
    if (email && email !== lead.prospect_email) {
      patch.prospect_email = email;
      patch.conversa_fatos = mergeFatos(lead.conversa_fatos, { email });
    }
    // First reply from the lead → reflect 'replied' send status.
    if (!isNudge && ['sent', 'delivered', 'read'].includes(lead.whatsapp_send_status)) {
      patch.whatsapp_send_status = 'replied';
    }

    // 9. Execute the action.
    let sent = false;
    let dryRun = false;
    switch (acao.tipo) {
      case 'optout': {
        // Goodbye FIRST (suppression starts the moment the optout is recorded);
        // interpretResponse guarantees texto. One line, then permanent silence.
        if (acao.texto) {
          const r = await sendReply(lead.id, from, acao.texto, pace);
          sent = r.sentAny; dryRun = r.dryRun;
        }
        await recordOptout({ phone: from, leadId: lead.id, reason: 'llm' });
        break;
      }

      case 'ignorar':
      case 'nada':
        // Deliberate silence — no send, no forced state change.
        break;

      case 'handoff':
        patch.handoff_motivo = acao.motivo || null;
        if (acao.texto) {
          const r = await sendReply(lead.id, from, acao.texto, pace);
          sent = r.sentAny; dryRun = r.dryRun;
        }
        break;

      case 'registrar_responsavel': {
        // Capture the referred contact + hand to a human for the intro dispatch
        // (auto intro-to-owner is a deliberate later upgrade). The referrer is
        // NEVER left hanging: LLM text if present, else the standard ack.
        patch.prospect_state = 'handoff';
        patch.handoff_motivo = `responsável indicado: ${acao.numero}${acao.nome ? ` (${acao.nome})` : ''}`;
        patch.conversa_fatos = mergeFatos(patch.conversa_fatos || lead.conversa_fatos, {
          nome_responsavel: acao.nome || undefined,
          notas: [`Responsável indicado pelo WhatsApp: ${acao.numero}`],
        });
        const ack = acao.texto || (acao.nome
          ? `Perfeito, obrigada! Já falo com ${acao.nome} então. 😊`
          : 'Perfeito, obrigada pela indicação! Já entro em contato com a pessoa então. 😊');
        const r = await sendReply(lead.id, from, ack, pace);
        sent = r.sentAny; dryRun = r.dryRun;
        break;
      }

      case 'agendar': {
        // The agent captured scheduling intent → move to 'agendando'. When booking
        // is LIVE (Google creds + a real number, not dry-run), propose REAL free
        // slots from the rep calendar(s); the lead confirms next turn and we book.
        // Without creds or in dry-run we degrade to the Phase-1 stub — ask for a
        // time, NEVER claim a slot is booked.
        let texto = acao.texto || 'Perfeito! Qual dia e horário fica melhor pra você?';
        if (booking.bookingDisponivel() && !isDryRun()) {
          const prop = await booking.proporReuniao(lead, nowMs, acao.resumo);
          if (prop.ok && prop.mensagem) texto = prop.mensagem;
        }
        const r = await sendReply(lead.id, from, texto, pace);
        sent = r.sentAny; dryRun = r.dryRun;
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
          const r = await sendReply(lead.id, from, acao.texto, pace);
          sent = r.sentAny; dryRun = r.dryRun;
          if (isNudge) patch.nudge_em = new Date(nowMs).toISOString();
        }
        break;
    }

    // 9b. Memory + triage: extract facts the LEAD declared this turn (merged
    //     into conversa_fatos) AND the intent of their latest message (F1 —
    //     same LLM call, near-zero marginal cost); refresh the rolling summary
    //     once the conversation outgrows the prompt window. Best-effort.
    if (!isNudge && !['nada', 'ignorar', 'optout'].includes(acao.tipo)) {
      const { fatos, intent } = await extrairFatos(history);
      if (fatos && Object.keys(fatos).length) {
        patch.conversa_fatos = mergeFatos(patch.conversa_fatos || lead.conversa_fatos, fatos);
      }
      if (intent) {
        const lastIn = [...history].reverse().find((m) => m.direcao === 'in');
        await updateIntent(lead.id, (lastIn && lastIn.wamid) || null, intent);
      }
      if (history.length >= RESUMO_MIN) {
        const resumo = await gerarResumo(history);
        if (resumo) patch.conversa_resumo = resumo;
      }
    }

    // 10. Persist state.
    if (Object.keys(patch).length) await patchLead(lead.id, patch);

    logger.info(`[prospect] lead=${lead.id} mode=${mode || 'inbound'} action=${acao.tipo} sent=${sent} dryRun=${dryRun}`);
    return { action: acao.tipo, sent, dryRun };
  } finally {
    releaseProcessingLock(lockKey).catch(() => {});
  }
}

module.exports = { respondToProspect, isDryRun };
