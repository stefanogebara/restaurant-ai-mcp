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
const {
  deveResponder, detectarOptout, detectarRecusaSuave, RECUSA_INSTRUCTION, estadoAposAcao,
} = require('./prospect-state');
const { dentroDoHorario, decisaoForaDeHorario } = require('./prospect-hours');
const { pacingDelayMs, splitReplyParts, partPauseDelayMs } = require('./prospect-pacing');
const { extrairEmail, extrairNumeroDono, extrairNomeDono, extrairDddBr } = require('./prospect-extract');
const { mergeFatos } = require('./prospect-facts');
const { generateReply } = require('./prospect-agent');
const {
  loadHistory, patchLead, recordOptout, storeMessage, isOptedOut,
  inboundFingerprint, claimInbound, releaseInbound, updateIntent, recordEvent,
} = require('./prospect-store');
const booking = require('./prospect-booking');
const { extrairFatos, gerarResumo, RESUMO_MIN } = require('./prospect-reflect');
const { NUDGE_INSTRUCTION, podeMensagemLivre } = require('./prospect-nudge');

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
 * Internal instruction injected as the final user turn in mode 'remarcar'
 * (ported from Olivia's olivia-responder). One short natural message, no
 * tools, never inventing a time.
 */
// The lead just OPENED the prévia we sent (P3 beacon). React with ONE short,
// warm line asking what they thought — no link repeat, no feature list, no push.
const PREVIA_ABERTA_INSTRUCTION =
  'O lead ACABOU de abrir a prévia que você enviou (o painel do restaurante dele). ' +
  'Reaja com UMA mensagem curta e calorosa, como quem percebeu a pessoa dar uma olhada: ' +
  'pergunta de leve o que ele achou / se fez sentido. NÃO repita o link, NÃO liste recursos, ' +
  'NÃO force reunião. Só puxa a reação dele com naturalidade.';

// The dated callback the lead asked for (or Olímpia promised) has come due (#32).
const RETORNO_INSTRUCTION =
  'Chegou o momento que ficou combinado de você retomar o contato com o lead. ' +
  'Mande UMA mensagem curta e natural retomando de onde vocês pararam — como quem ' +
  'cumpre o que prometeu, no horário certo. Não repita tudo, não soe robótica, não peça desculpas.';

function instrucaoRemarcar(motivo, novoHorarioLabel) {
  const porMotivo = {
    pedir:
      'Você precisa REMARCAR a reunião já combinada com o cliente. Mande UMA mensagem curta, ' +
      'leve e natural avisando que precisa remarcar e perguntando qual novo dia e horário fica ' +
      'bom pra ele. Não invente horário, não soe robótica, não peça desculpas em excesso.',
    noshow:
      'O cliente NÃO apareceu na call que estava agendada. Mande UMA mensagem curta, gentil e SEM ' +
      'cobrança/culpa, dizendo que não conseguiu encontrá-lo no horário e perguntando se quer ' +
      'remarcar — e qual horário fica melhor. Tom acolhedor, nada passivo-agressivo.',
    definir:
      `A reunião foi REMARCADA para: ${novoHorarioLabel || '(novo horário)'}. Confirme isso ` +
      'com o cliente em UMA mensagem curta e natural, usando EXATAMENTE esse horário, e diga que ' +
      'mandou o novo convite. Não invente outro horário.',
  };
  return `[INSTRUÇÃO INTERNA, não é mensagem do cliente: ${porMotivo[motivo] || porMotivo.pedir} Não use ferramentas — responda só com o texto.]`;
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
 * @param {'nudge'|'remarcar'|'previa'|'retorno'|null} [args.mode] - orchestrator
 *   modes: 'nudge' writes one natural follow-up (no tools) after ~23h of lead
 *   silence and stamps nudge_em; 'remarcar' authors the reschedule/no-show/moved
 *   message (calendar + state already handled by prospect-remarcar); 'previa'
 *   reacts to the lead opening their prévia (P3 beacon); 'retorno' fires a dated
 *   callback (#32) when retorno_em comes due (from the flush cron).
 * @param {'pedir'|'noshow'|'definir'} [args.remarcarMotivo] - required with
 *   mode 'remarcar'.
 * @param {string|null} [args.novoHorarioLabel] - human label of the new time
 *   (motivo 'definir' only).
 * @returns {Promise<{action: string, sent?: boolean, dryRun?: boolean}>}
 */
async function respondToProspect({ lead, from, text, nowMs = Date.now(), skipPacing = false, mode = null, remarcarMotivo = null, novoHorarioLabel = null }) {
  const pace = { skipPacing };
  const isNudge = mode === 'nudge';
  const isRemarcar = mode === 'remarcar';
  const isPreviaAberta = mode === 'previa';
  const isRetorno = mode === 'retorno';

  // 1. State gate — silent in optout/handoff/agendado/pausada. Remarcar
  //    bypasses it: a 'definir' confirmation goes out while still 'agendado',
  //    and pedir/noshow run right after the caller reset state anyway.
  if (!isRemarcar && !deveResponder(lead.prospect_state)) {
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

  // 2c. MODE REMARCAR — reschedule ('pedir'), no-show, or moved ('definir').
  //     The calendar and the state were already handled by prospect-remarcar;
  //     here we only author + send ONE natural message. Bypasses the hours
  //     gate (triggered by a human working the console, or the flush cron
  //     which already runs business-hours) — but never the kill switch above,
  //     and the Meta 24h window still applies: outside it, free text is
  //     undeliverable (131047), so we skip with a clear reason and coverage
  //     falls to the template touches.
  if (isRemarcar) {
    const history = (await loadHistory(lead.id, 40)).filter((m) => m.direcao !== 'sys');
    const lastIn = [...history].reverse().find((m) => m.direcao === 'in');
    if (!lastIn || !podeMensagemLivre(new Date(lastIn.enviada_em).getTime(), nowMs)) {
      logger.info(`[prospect] remarcar(${remarcarMotivo}) skipped lead=${lead.id} — 24h window closed`);
      return { action: 'skip', reason: 'window_closed', remarcar: remarcarMotivo };
    }
    const acaoRm = await generateReply({
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
      injectUserTurn: instrucaoRemarcar(remarcarMotivo, novoHorarioLabel),
      noTools: true,
    });
    if (!acaoRm || !acaoRm.texto) {
      return { action: 'skip', reason: 'no_text', remarcar: remarcarMotivo, motivo: (acaoRm && acaoRm.motivo) || null };
    }
    const r = await sendReply(lead.id, from, acaoRm.texto, pace);
    logger.info(`[prospect] lead=${lead.id} mode=remarcar motivo=${remarcarMotivo} sent=${r.sentAny} dryRun=${r.dryRun}`);
    return { action: 'remarcar', remarcar: remarcarMotivo, sent: r.sentAny, dryRun: r.dryRun };
  }

  // 2d. MODE PREVIA — the lead just OPENED the prévia we sent (P3 beacon). React
  //     with ONE warm line asking what they thought. Same 24h-window + kill-switch
  //     rules as remarcar, PLUS a business-hours guard: a 2am open shouldn't get a
  //     2am reply (coverage falls to the normal cadence). The state gate above
  //     already muted optout/handoff/agendado. Deduped once-per-lead by the beacon
  //     endpoint before it ever calls us.
  if (isPreviaAberta) {
    // Defense-in-depth (review finding): the beacon path skips prospect-inbound's
    // isOptedOut gate, and state ≠ suppression list can diverge. Never react to a
    // suppressed number, regardless of prospect_state.
    if (await isOptedOut(from)) {
      logger.info(`[prospect] previa-reacao skipped lead=${lead.id} — opted out`);
      return { action: 'skip', reason: 'opted_out', previa: true };
    }
    if (process.env.PROSPECTING_IGNORE_HOURS !== 'true' && !dentroDoHorario(nowMs)) {
      logger.info(`[prospect] previa-reacao skipped lead=${lead.id} — outside hours`);
      return { action: 'skip', reason: 'outside_hours', previa: true };
    }
    const history = (await loadHistory(lead.id, 40)).filter((m) => m.direcao !== 'sys');
    const lastIn = [...history].reverse().find((m) => m.direcao === 'in');
    if (!lastIn || !podeMensagemLivre(new Date(lastIn.enviada_em).getTime(), nowMs)) {
      logger.info(`[prospect] previa-reacao skipped lead=${lead.id} — 24h window closed`);
      return { action: 'skip', reason: 'window_closed', previa: true };
    }
    const acaoP = await generateReply({
      lead: {
        name: lead.name, owner_name: lead.owner_name, sector: lead.sector, city: lead.city,
        nome_genero: lead.nome_genero, conversa_fatos: lead.conversa_fatos, conversa_resumo: lead.conversa_resumo,
      },
      history,
      nowMs,
      injectUserTurn: PREVIA_ABERTA_INSTRUCTION,
      noTools: true,
    });
    if (!acaoP || !acaoP.texto) return { action: 'skip', reason: 'no_text', previa: true };
    const r = await sendReply(lead.id, from, acaoP.texto, pace);
    logger.info(`[prospect] lead=${lead.id} mode=previa sent=${r.sentAny} dryRun=${r.dryRun}`);
    return { action: 'previa_reacao', sent: r.sentAny, dryRun: r.dryRun };
  }

  // 2e. MODE RETORNO — a dated callback the lead asked for (or Olímpia promised)
  //     is now due (#32, the flush cron fires it). One natural "retomada" line.
  //     Same window + opt-out rules; the state gate above already muted terminal
  //     states, and retorno_em was set to a business-hours slot so no hours gate.
  if (isRetorno) {
    if (await isOptedOut(from)) {
      return { action: 'skip', reason: 'opted_out', retorno: true };
    }
    const history = (await loadHistory(lead.id, 40)).filter((m) => m.direcao !== 'sys');
    const lastIn = [...history].reverse().find((m) => m.direcao === 'in');
    if (!lastIn || !podeMensagemLivre(new Date(lastIn.enviada_em).getTime(), nowMs)) {
      // Callback beyond Meta's 24h window can't go as free text — coverage falls
      // to the re-engage template sweep. Not a failure.
      logger.info(`[prospect] retorno skipped lead=${lead.id} — 24h window closed`);
      return { action: 'skip', reason: 'window_closed', retorno: true };
    }
    const acaoR = await generateReply({
      lead: {
        name: lead.name, owner_name: lead.owner_name, sector: lead.sector, city: lead.city,
        nome_genero: lead.nome_genero, conversa_fatos: lead.conversa_fatos, conversa_resumo: lead.conversa_resumo,
      },
      history,
      nowMs,
      injectUserTurn: RETORNO_INSTRUCTION,
      noTools: true,
    });
    if (!acaoR || !acaoR.texto) return { action: 'skip', reason: 'no_text', retorno: true };
    const r = await sendReply(lead.id, from, acaoR.texto, pace);
    logger.info(`[prospect] lead=${lead.id} mode=retorno sent=${r.sentAny} dryRun=${r.dryRun}`);
    return { action: 'retorno', sent: r.sentAny, dryRun: r.dryRun };
  }

  // 3. Business-hours gate — defer to next opening (prospect-flush resumes).
  //    Bypass with PROSPECTING_IGNORE_HOURS=true for testing.
  if (process.env.PROSPECTING_IGNORE_HOURS !== 'true' && !dentroDoHorario(nowMs)) {
    if (isNudge) return { action: 'skip', reason: 'outside_hours' };
    // Anchor on the lead's 24h window: defer to min(next opening, window-22h),
    // but when that clamped deadline ARRIVES (the weekend-flush retry), reply
    // off-hours — re-deferring would land past the window and kill the thread.
    const lastInMs = lead.last_in_at ? new Date(lead.last_in_at).getTime() : nowMs;
    const decisao = decisaoForaDeHorario(nowMs, lastInMs);
    if (decisao.acao === 'adiar') {
      await patchLead(lead.id, { reply_apos: decisao.replyApos });
      logger.info(`[prospect] outside business hours, deferred lead=${lead.id} until ${decisao.replyApos}`);
      return { action: 'deferred', replyApos: decisao.replyApos };
    }
    logger.info(`[prospect] window deadline reached — replying OFF-HOURS lead=${lead.id}`);
  }

  // 3b. Meta 24h window gate (automated path). A resume that arrives after the
  //     window closed (stale reply_apos, delayed flush) must NOT fire free
  //     text — Meta rejects it (131047) and the failure poisons the number
  //     stats. The lead stays for template-based touches instead.
  if (!isNudge && lead.last_in_at && !podeMensagemLivre(new Date(lead.last_in_at).getTime(), nowMs)) {
    await recordEvent(lead.id, '⏱ janela de 24h fechada — resposta livre cancelada (cobertura fica com os toques de template)');
    logger.info(`[prospect] window closed — skipping free-text reply lead=${lead.id}`);
    return { action: 'skip', reason: 'window_closed' };
  }

  // 3c. Global LLM budget (cost circuit-breaker). Checked read-only BEFORE the
  //     per-lead lock and the per-inbound claim — a deferred turn must stay
  //     claimable so the flush retry actually answers it (after the claim, a
  //     skip would burn the message). Defer, don't drop: reply_apos lands on
  //     the next flush tick (*/15); if the budget is still gone the turn
  //     re-defers, and gate 3b retires it when the 24h window closes. Nudges
  //     just skip — the hourly nudge cron retries naturally.
  {
    const { budgetDisponivel } = require('./prospect-llm-budget');
    if (!(await budgetDisponivel(nowMs))) {
      if (isNudge) return { action: 'skip', reason: 'llm_budget' };
      const replyApos = new Date(nowMs + 15 * 60 * 1000).toISOString();
      await patchLead(lead.id, { reply_apos: replyApos });
      logger.warn(`[prospect] LLM hourly budget exhausted — deferred lead=${lead.id} until ${replyApos}`);
      return { action: 'deferred', reason: 'llm_budget', replyApos };
    }
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

    // 6a-bis. Soft-decline detector (pre-LLM, deterministic). A polite "not for
    //   us / not the moment / already sorted" parks the lead in 'recusou' (which
    //   every proactive selector drops, since they whitelist only active states)
    //   and turns THIS turn into one warm close instead of a pitch. Reversible: a
    //   later inbound is still answered and revives the thread. Opt-out (the
    //   stronger stop) was already handled above; nudges have no inbound to read.
    const recusaSuave = !isNudge && detectarRecusaSuave(lastInText);

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
        injectUserTurn: isNudge ? NUDGE_INSTRUCTION : (recusaSuave ? RECUSA_INSTRUCTION : null),
        noTools: isNudge || recusaSuave,
      });
    }

    // 8. Build the state patch from the action.
    const next = estadoAposAcao(acao);
    const patch = {};
    if (next) patch.prospect_state = next;
    // Soft decline → park in 'recusou' (reversible), overriding the default
    // 'conversando'. Only when the turn resolved to a plain reply — a guardrail
    // that fired registrar/agendar means the lead engaged, not declined.
    if (recusaSuave && acao && acao.tipo === 'responder') patch.prospect_state = 'recusou';
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
      case 'nada': {
        // Transient failure ≠ deliberate silence. A provider error (or the
        // rare budget race past gate 3c) must RE-QUEUE the turn: reply_apos
        // +15 min (flush cron retries; gate 3b retires it at window close)
        // and the per-inbound claim goes back so the retry can claim the
        // same wamid. Incident 2026-07-06: without this, provider 402/401
        // surfaced as bare 'nada' and live threads hung with no retry.
        if (!isNudge && acao.tipo === 'nada' && /^(erro LLM|orçamento de LLM)/.test(acao.motivo || '')) {
          patch.reply_apos = new Date(nowMs + 15 * 60 * 1000).toISOString();
          if (!isDryRun() && lastRow.wamid) await releaseInbound(lead.id, lastRow.wamid);
          await recordEvent(lead.id, `⚠ IA indisponível — resposta adiada 15 min (retry automático): ${acao.motivo}`);
          break;
        }
        // Deliberate silence — EXCEPT the gatekeeper door: when the thread is
        // template-out + bot-noise-in only (no human voice yet), one short
        // line addressed to the human who reads the thread later. The pack
        // can't reach this case (cycles 9/16: only bots reply, no one to talk
        // to); deveEnviarPorta is once-per-thread by construction.
        if (acao.tipo === 'ignorar') {
          const { deveEnviarPorta } = require('./prospect-state');
          if (deveEnviarPorta(history)) {
            const { COMPANION_TEXT } = require('./prospect-agent');
            const r = await sendReply(lead.id, from, COMPANION_TEXT.porta, pace);
            sent = r.sentAny; dryRun = r.dryRun;
            await recordEvent(lead.id, '🚪 só auto-atendimento na thread — recado de porta enviado para o humano que ler depois');
          }
        }
        break;
      }

      case 'handoff':
        patch.handoff_motivo = acao.motivo || null;
        if (acao.texto) {
          const r = await sendReply(lead.id, from, acao.texto, pace);
          sent = r.sentAny; dryRun = r.dryRun;
        }
        break;

      case 'registrar_responsavel': {
        // Capture the referred contact. The referrer is NEVER left hanging: LLM
        // text if present, else the standard ack. The lead stays in 'handoff'
        // for cockpit visibility, but the referral itself now flows: it becomes
        // its OWN lead (source='indicacao') and gets the intro template
        // automatically — the first campaign captured 5 owner numbers and every
        // one of them died inside handoff_motivo waiting for a human.
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

        // Referral → lead + auto-intro (best-effort: a failure here never
        // breaks the ack; the flush-cron referral pass retries the intro, and
        // the cockpit timeline shows exactly what happened).
        try {
          const { createReferralLead } = require('./prospect-store');
          const ref = await createReferralLead(lead, acao.numero, acao.nome || null);
          if (ref.ok && ref.created) {
            await recordEvent(lead.id, `📇 indicação virou lead (${acao.numero})`);
            const { dispatchReferralIntros } = require('./sequencer');
            const d = await dispatchReferralIntros({ leadId: ref.leadId, limit: 1 });
            if (d && d.sent > 0) {
              await recordEvent(lead.id, '📨 intro enviada ao responsável indicado');
            } else if (d && (d.outsideWindow || d.capHit || d.dryRun || d.agentDisabled)) {
              await recordEvent(lead.id, '⏳ intro ao indicado aguarda janela/cap — flush retenta');
            }
          } else if (ref.reason === 'exists') {
            await recordEvent(lead.id, '📇 responsável indicado já é lead — sem duplicata');
          } else if (ref.reason === 'optedout') {
            await recordEvent(lead.id, '🚫 responsável indicado está em opt-out — não será contatado');
          } else if (ref.reason === 'numero_invalido') {
            await recordEvent(lead.id, '⚠ número indicado não validou como BR móvel — tratar manualmente');
          }
        } catch (err) {
          logger.warn(`referral auto-lead failed lead=${lead.id}: ${err.message}`);
        }
        break;
      }

      case 'agendar': {
        // The agent captured scheduling intent → move to 'agendando'. When booking
        // is LIVE (Google creds + a real number, not dry-run), propose REAL free
        // slots from the rep calendar(s); the lead confirms next turn and we book.
        // Without creds or in dry-run we degrade to the Phase-1 stub — ask for a
        // time, NEVER claim a slot is booked.
        // When the tool carried the lead's availability, confirm it — re-asking
        // for a time the lead just gave reads as not listening (gym cycle 13).
        const temResumo = acao.resumo && acao.resumo !== 'sem detalhe';
        let texto = acao.texto || (temResumo
          ? `Perfeito! Deixa eu confirmar aqui (${acao.resumo}) e já te mando o convite 🙂`
          : 'Perfeito! Qual dia e horário fica melhor pra você?');
        if (booking.bookingDisponivel() && !isDryRun()) {
          // Email-ask round-trip: a pending slot means the lead already chose a
          // time and we asked ONCE for their email. The LLM re-confirming intent
          // ("pode mandar por aqui mesmo") books that slot now — with the email
          // captured this turn if any — instead of re-proposing slots.
          const pend = await booking.confirmarPendente(lead, email, nowMs);
          if (pend.handled) {
            const r = await sendReply(lead.id, from, pend.mensagem, pace);
            const patchPend = { ...(pend.patch || {}) };
            if (lead.reply_apos) patchPend.reply_apos = null;
            if (Object.keys(patchPend).length) await patchLead(lead.id, patchPend);
            if (pend.booked) {
              await recordEvent(lead.id, `📅 reunião marcada pela agenda${pend.patch && pend.patch.reuniao_at ? ` — ${pend.patch.reuniao_at}` : ''}`);
            }
            logger.info(`[prospect] lead=${lead.id} action=booking booked=${!!pend.booked} via=agendar_pendente`);
            return { action: pend.booked ? 'agendado' : 'agendando', sent: r.sentAny, dryRun: r.dryRun };
          }
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

      case 'agendar_retorno': {
        // Dated callback (#32, R6 "promessa datada é contrato"): confirm now +
        // schedule a punctual proactive retomada. The flush cron fires mode=
        // 'retorno' when retorno_em comes due. An inbound before then clears it.
        const { computeRetornoAt } = require('./prospect-hours');
        const retornoEm = computeRetornoAt(acao.quando, nowMs);
        const r = await sendReply(lead.id, from, acao.texto, pace);
        sent = r.sentAny; dryRun = r.dryRun;
        patch.retorno_em = retornoEm;
        patch.retorno_motivo = (acao.quando || '').slice(0, 200) || null;
        await recordEvent(lead.id, `📞 retorno agendado para ${retornoEm}${acao.quando ? ` ("${acao.quando}")` : ''}`);
        break;
      }

      case 'criar_demo': {
        // The demo-preview CTA the conversion study elected as fix #1. The model
        // offered it (acao.texto = lead-in bubble); we create the real /previa and
        // paste the link. The model NEVER writes the URL (R4) — any URL it did
        // write is stripped here, and the responder appends the real one.
        const { criarPreviaDemo, previaLinkInHistory } = require('./prospect-demo');
        const intro = String(acao.texto || '')
          .replace(/https?:\/\/\S+/gi, '')
          .replace(/\n{3,}/g, '\n\n')
          .trim();
        // Storage-free idempotency: a prévia link already in this thread means we
        // don't mint a duplicate demo — and we don't re-spam the same link. A
        // repeated criar_demo (model re-offering) becomes a short nudge upward.
        const jaEnviada = previaLinkInHistory(history);
        let url = jaEnviada;
        if (!url) {
          const r = await criarPreviaDemo(lead.id);
          if (r.ok) url = r.url;
          else logger.warn(`[prospect] lead=${lead.id} criar_demo falhou: ${r.error}`);
        }
        if (jaEnviada) {
          // Already delivered — nudge, don't repeat the link.
          const r = await sendReply(lead.id, from, 'já te mandei ali em cima 👆 dá uma olhada quando puder que a gente vê junto 🙂', pace);
          sent = r.sentAny; dryRun = r.dryRun;
        } else if (url) {
          const linkBubble = `é essa aqui, abre no celular 👇\n${url}`;
          const full = intro ? `${intro}\n\n${linkBubble}` : linkBubble;
          const r = await sendReply(lead.id, from, full, pace);
          sent = r.sentAny; dryRun = r.dryRun;
          await recordEvent(lead.id, `🎬 prévia enviada: ${url}`);
        } else {
          // Creation failed — do NOT promise a link (R4). Soft continuation; the
          // failure lands on the cockpit timeline so a human can finish it.
          const soft = 'deixa eu organizar uma coisa rápida aqui e já te retorno 🙂';
          const r = await sendReply(lead.id, from, soft, pace);
          sent = r.sentAny; dryRun = r.dryRun;
          patch.handoff_motivo = 'criar_demo falhou — montar prévia manualmente';
          await recordEvent(lead.id, '⚠ criar_demo falhou — fallback sem link, handoff sugerido');
        }
        break;
      }

      case 'responder':
      default:
        if (acao.tipo === 'responder' && acao.texto) {
          const r = await sendReply(lead.id, from, acao.texto, pace);
          sent = r.sentAny; dryRun = r.dryRun;
          if (isNudge) {
            patch.nudge_em = new Date(nowMs).toISOString();
            patch.nudge_count = (lead.nudge_count || 0) + 1; // engagement-taper counter
          }
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
