'use strict';

/**
 * Cold outbound sequencer: intros (touch 1) + multi-touch follow-ups (2/3).
 *
 * Clones campaignService's proven shape (per-recipient send loop + status +
 * whatsapp_message_id) for the prospecting pipeline, adding the protections cold
 * B2B outreach needs: a warm-up daily cap (consume-before-send, fail-closed,
 * SHARED between intros and follow-ups so touches never blow the number's ramp),
 * an ATOMIC per-lead claim, and opt-out suppression.
 *
 * COMPLIANCE: every cold touch happens OUTSIDE WhatsApp's 24h service window,
 * so every send here is a Meta-APPROVED template. Variants (A/B) come from the
 * prospect_templates registry; each lead's variant is stamped at intro time
 * (intro_variant) so the per-variant funnel attributes replies/meetings.
 *
 * Multi-touch (F4): leads whose intro was delivered but who NEVER replied get
 * touch 2 at D+3 and a breakup touch 3 at D+8. Any inbound cancels the sequence
 * (prospect-inbound nulls next_touch_at); opt-out suppression applies as usual.
 *
 * SAFETY: dry-run is default-on and forced on without PROSPECTING_PHONE_NUMBER_ID.
 * Two kill switches gate all sends: 'prospecting-agent' (master) and
 * 'prospecting-dispatch' (graduated — tripped by the number-health breaker).
 */

const { createSecureLogger } = require('../secure-logger');
const { sendTemplateMessage } = require('../whatsapp-sender');
const { getProspectingPhoneNumberId } = require('./routing');
const { consumeSendSlot } = require('./prospect-warmup');
const {
  isOptedOut, selectIntroCandidates, claimIntro, markIntro, storeMessage,
  listTemplates, patchLead, selectDueTouches, selectDueReengages, loadLastMessage,
} = require('./prospect-store');

const logger = createSecureLogger('ProspectSequencer');

const TOUCH2_DELAY_MS = 3 * 24 * 60 * 60 * 1000;  // intro → bump: D+3
const TOUCH3_DELAY_MS = 5 * 24 * 60 * 60 * 1000;  // bump → breakup: D+8 total
const REENGAGE_SILENCE_MS = 3 * 24 * 60 * 60 * 1000; // replied lead silent D+3 → template re-engage
const REENGAGE_TOUCH = 4;                             // prospect_templates slot for 'resgate'

function isDryRun() {
  if (!getProspectingPhoneNumberId()) return true;
  return process.env.PROSPECTING_DRY_RUN !== 'false';
}

/** Master + graduated kill switches. Both must be enabled for cold sends. */
async function outboundEnabled() {
  const { isCronEnabled } = require('../cron-config');
  const [agent, dispatch] = await Promise.all([
    isCronEnabled('prospecting-agent'),
    isCronEnabled('prospecting-dispatch'),
  ]);
  return agent && dispatch;
}

/** Uniform-random pick among the ACTIVE registered templates for a touch. */
async function pickTemplate(touchNumber) {
  const all = (await listTemplates(touchNumber)).filter((t) => t.active);
  if (all.length === 0) {
    // Compat fallback for touch 1: the env-configured intro template.
    if (touchNumber === 1 && process.env.PROSPECTING_INTRO_TEMPLATE) {
      return {
        variant_label: 'A',
        meta_template_name: process.env.PROSPECTING_INTRO_TEMPLATE,
        template_lang: process.env.PROSPECTING_INTRO_TEMPLATE_LANG || 'pt_BR',
      };
    }
    return null;
  }
  return all[Math.floor(Math.random() * all.length)];
}

/**
 * Dispatch cold intros to leads that have never been contacted.
 * @param {{limit?: number}} [opts]
 * @returns {Promise<{candidates:number, sent:number, blocked:number, skipped:number, failed:number, dryRun:boolean, capHit:boolean}>}
 */
async function dispatchIntros({ limit = 20, territorio = null } = {}) {
  if (!(await outboundEnabled())) {
    logger.info('dispatchIntros skipped — outbound disabled (kill switch / breaker)');
    return { candidates: 0, sent: 0, blocked: 0, skipped: 0, failed: 0, dryRun: isDryRun(), capHit: false, agentDisabled: true };
  }

  const dryRun = isDryRun();
  const introTemplate = await pickTemplate(1); // availability probe
  const previewOnly = dryRun || !introTemplate;

  const candidates = await selectIntroCandidates(limit, territorio);
  const summary = { candidates: candidates.length, sent: 0, blocked: 0, skipped: 0, failed: 0, dryRun: previewOnly, capHit: false };
  if (candidates.length === 0) return summary;

  if (!dryRun && !introTemplate) {
    logger.error('no active intro template (prospect_templates touch 1 / PROSPECTING_INTRO_TEMPLATE) — preview only');
  }

  for (const lead of candidates) {
    // Defensive opt-out suppression (the candidate query doesn't join optout).
    if (await isOptedOut(lead.whatsapp_phone)) { summary.skipped++; continue; }

    if (previewOnly) {
      logger.info(`[DRY RUN] would send intro to lead=${lead.id} (${String(lead.whatsapp_phone).slice(0, 5)}****)`);
      summary.skipped++;
      continue;
    }

    // Warm-up cap — reserve a slot before sending (fail-closed). Stop the run
    // when the day's cap is reached.
    const slot = await consumeSendSlot();
    if (!slot.allowed) {
      summary.blocked++; summary.capHit = true;
      logger.info(`daily cap reached (${slot.count}/${slot.cap}) — stopping dispatch`);
      break;
    }

    // Atomic claim — only one run sends this lead.
    const claimed = await claimIntro(lead.id);
    if (!claimed) { summary.skipped++; continue; }

    // Per-lead variant assignment at send time (coherent A/B experience).
    const tpl = await pickTemplate(1);
    // {{1}} in the intro templates is the RESTAURANT name ("Vi o restaurante {{1}}").
    const res = await sendTemplateMessage(
      lead.whatsapp_phone, tpl.meta_template_name, tpl.template_lang, [lead.name || ''],
      { phoneNumberId: getProspectingPhoneNumberId() },
    );

    if (res.success) {
      await markIntro(lead.id, { status: 'sent', wamid: res.messageId });
      await patchLead(lead.id, {
        intro_variant: tpl.variant_label,
        touch_count: 1,
        next_touch_at: new Date(Date.now() + TOUCH2_DELAY_MS).toISOString(),
      });
      await storeMessage({
        leadId: lead.id, direcao: 'out', wamid: res.messageId || null,
        tipo: 'template', corpo: `[template:${tpl.meta_template_name}]`,
      });
      summary.sent++;
    } else {
      await markIntro(lead.id, { status: 'failed' });
      summary.failed++;
      logger.error(`intro send failed lead=${lead.id}: ${res.error}`);
    }
  }

  logger.info('dispatchIntros done', summary);
  return summary;
}

/**
 * Dispatch due follow-up touches (2 = bump, 3 = breakup) to never-repliers.
 * Counts against the SAME warm-up daily cap as intros. Runs from the flush cron.
 * @param {{limit?: number, nowMs?: number}} [opts]
 */
async function dispatchFollowups({ limit = 10, nowMs = Date.now() } = {}) {
  const summary = { due: 0, sent: 0, blocked: 0, skipped: 0, failed: 0, capHit: false };
  if (isDryRun()) return { ...summary, dryRun: true };
  if (!(await outboundEnabled())) return { ...summary, agentDisabled: true };

  const due = await selectDueTouches(new Date(nowMs).toISOString(), limit);
  summary.due = due.length;
  if (due.length === 0) return summary;

  for (const lead of due) {
    try {
      if (await isOptedOut(lead.whatsapp_phone)) {
        await patchLead(lead.id, { next_touch_at: null });
        summary.skipped++; continue;
      }

      const touch = (lead.touch_count || 1) + 1;
      const tpl = await pickTemplate(touch);
      if (!tpl) {
        // No approved template registered for this touch — halt the sequence
        // for this lead (visible in the console; re-armed by registering one).
        await patchLead(lead.id, { next_touch_at: null });
        summary.skipped++;
        logger.warn(`no active template for touch ${touch} — sequence halted lead=${lead.id}`);
        continue;
      }

      const slot = await consumeSendSlot();
      if (!slot.allowed) { summary.blocked++; summary.capHit = true; break; }

      // Claim by advancing next_touch_at only if it is still due (anti double-send
      // across overlapping cron runs).
      const { supabaseAdmin } = require('../supabase');
      const { data: claimed } = await supabaseAdmin.from('prospect_leads')
        .update({ next_touch_at: touch === 2 ? new Date(nowMs + TOUCH3_DELAY_MS).toISOString() : null, touch_count: touch })
        .eq('id', lead.id)
        .lte('next_touch_at', new Date(nowMs).toISOString())
        .select('id');
      if (!Array.isArray(claimed) || claimed.length === 0) { summary.skipped++; continue; }

      const res = await sendTemplateMessage(
        lead.whatsapp_phone, tpl.meta_template_name, tpl.template_lang, [lead.name || ''],
        { phoneNumberId: getProspectingPhoneNumberId() },
      );
      if (res.success) {
        await storeMessage({
          leadId: lead.id, direcao: 'out', wamid: res.messageId || null,
          tipo: 'template', corpo: `[template:${tpl.meta_template_name}]`,
        });
        summary.sent++;
        logger.info(`follow-up touch ${touch} sent lead=${lead.id} variant=${tpl.variant_label}`);
      } else {
        summary.failed++;
        logger.error(`follow-up send failed lead=${lead.id}: ${res.error}`);
      }
    } catch (err) {
      summary.failed++;
      logger.error(`follow-up exception lead=${lead.id}: ${err.message}`);
    }
  }

  logger.info('dispatchFollowups done', summary);
  return summary;
}

/**
 * Re-engage leads that replied once but went silent past the 24h window.
 *
 * The free-text nudge (23h) is the last thing we can say inside the window;
 * after it closes, ONLY an approved template is deliverable. This sends the
 * 'resgate' template (registry slot touch_number=4) at D+3 of silence, ONCE
 * per silence period: eligibility requires the last logged message to be an
 * outbound NON-template (we spoke last, and this silence hasn't been touched);
 * the template we store immediately flips that check off until the lead
 * speaks again. A short conditional snooze doubles as the anti-race claim.
 */
async function dispatchReengages({ limit = 5, nowMs = Date.now() } = {}) {
  const summary = { candidates: 0, sent: 0, blocked: 0, skipped: 0, failed: 0, capHit: false };
  if (isDryRun()) return { ...summary, dryRun: true };
  if (!(await outboundEnabled())) return { ...summary, agentDisabled: true };

  const tpl = await pickTemplate(REENGAGE_TOUCH);
  if (!tpl) return { ...summary, noTemplate: true };

  const nowIso = new Date(nowMs).toISOString();
  const candidates = await selectDueReengages(nowIso, REENGAGE_SILENCE_MS, limit);
  summary.candidates = candidates.length;

  const { supabaseAdmin } = require('../supabase');
  for (const lead of candidates) {
    if (summary.sent >= limit) break;
    try {
      if (await isOptedOut(lead.whatsapp_phone)) { summary.skipped++; continue; }

      // One re-engage per silence period: if the last message is already a
      // template (or the lead spoke last — responder owns that case), skip.
      const last = await loadLastMessage(lead.id);
      if (!last || last.direcao !== 'out' || last.tipo === 'template') { summary.skipped++; continue; }

      // Anti-race claim: a 10-min conditional snooze. Semantics match ("agent
      // holds off on this lead"), it self-expires, and a concurrent run loses
      // the .or() condition. Selector already excludes future-snoozed leads.
      const claimUntil = new Date(nowMs + 10 * 60 * 1000).toISOString();
      const { data: claimed } = await supabaseAdmin.from('prospect_leads')
        .update({ snoozed_until: claimUntil })
        .eq('id', lead.id)
        .eq('prospect_state', 'conversando')
        .or(`snoozed_until.is.null,snoozed_until.lt.${nowIso}`)
        .select('id');
      if (!Array.isArray(claimed) || claimed.length === 0) { summary.skipped++; continue; }

      const slot = await consumeSendSlot();
      if (!slot.allowed) { summary.blocked++; summary.capHit = true; break; }

      const res = await sendTemplateMessage(
        lead.whatsapp_phone, tpl.meta_template_name, tpl.template_lang, [lead.name || ''],
        { phoneNumberId: getProspectingPhoneNumberId() },
      );
      if (res.success) {
        await storeMessage({
          leadId: lead.id, direcao: 'out', wamid: res.messageId || null,
          tipo: 'template', corpo: `[template:${tpl.meta_template_name}]`,
        });
        summary.sent++;
        logger.info(`re-engage sent lead=${lead.id} variant=${tpl.variant_label}`);
      } else {
        summary.failed++;
        logger.error(`re-engage send failed lead=${lead.id}: ${res.error}`);
      }
    } catch (err) {
      summary.failed++;
      logger.error(`re-engage exception lead=${lead.id}: ${err.message}`);
    }
  }

  logger.info('dispatchReengages done', summary);
  return summary;
}

module.exports = {
  dispatchIntros, dispatchFollowups, dispatchReengages, isDryRun,
  TOUCH2_DELAY_MS, TOUCH3_DELAY_MS, REENGAGE_SILENCE_MS, REENGAGE_TOUCH,
};
