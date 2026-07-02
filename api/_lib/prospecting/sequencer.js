'use strict';

/**
 * Cold-intro outbound sequencer.
 *
 * Clones campaignService's proven shape (per-recipient send loop + status +
 * whatsapp_message_id) for the prospecting pipeline, adding the protections cold
 * B2B outreach needs: a warm-up daily cap (consume-before-send, fail-closed), an
 * ATOMIC per-lead claim (no double-send across concurrent runs), and opt-out
 * suppression. A prospect's first contact MUST be a Meta-approved template
 * (no 24h session exists yet).
 *
 * SAFETY: dry-run is default-on and forced on without PROSPECTING_PHONE_NUMBER_ID,
 * and a live send additionally requires PROSPECTING_INTRO_TEMPLATE to be set —
 * so nothing goes out until the number AND an approved template are configured.
 */

const { createSecureLogger } = require('../secure-logger');
const { sendTemplateMessage } = require('../whatsapp-sender');
const { getProspectingPhoneNumberId } = require('./routing');
const { consumeSendSlot } = require('./prospect-warmup');
const { isOptedOut, selectIntroCandidates, claimIntro, markIntro, storeMessage } = require('./prospect-store');

const logger = createSecureLogger('ProspectSequencer');

function isDryRun() {
  if (!getProspectingPhoneNumberId()) return true;
  return process.env.PROSPECTING_DRY_RUN !== 'false';
}

/**
 * Dispatch cold intros to leads that have never been contacted.
 * @param {{limit?: number}} [opts]
 * @returns {Promise<{candidates:number, sent:number, blocked:number, skipped:number, failed:number, dryRun:boolean, capHit:boolean}>}
 */
async function dispatchIntros({ limit = 20 } = {}) {
  // GLOBAL kill switch (ops platform): disabled agent = no outbound of any kind.
  const { isCronEnabled } = require('../cron-config');
  if (!(await isCronEnabled('prospecting-agent'))) {
    logger.info('dispatchIntros skipped — agent globally disabled');
    return { candidates: 0, sent: 0, blocked: 0, skipped: 0, failed: 0, dryRun: isDryRun(), capHit: false, agentDisabled: true };
  }

  const dryRun = isDryRun();
  const templateName = process.env.PROSPECTING_INTRO_TEMPLATE;
  const templateLang = process.env.PROSPECTING_INTRO_TEMPLATE_LANG || 'pt_BR';
  const previewOnly = dryRun || !templateName;

  const candidates = await selectIntroCandidates(limit);
  const summary = { candidates: candidates.length, sent: 0, blocked: 0, skipped: 0, failed: 0, dryRun: previewOnly, capHit: false };
  if (candidates.length === 0) return summary;

  if (!dryRun && !templateName) {
    logger.error('PROSPECTING_INTRO_TEMPLATE not set — cannot send live; running as preview');
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

    // {{1}} in olimpia_intro is the RESTAURANT name ("Vi o restaurante {{1}}").
    const bodyParams = [lead.name || ''];
    const res = await sendTemplateMessage(
      lead.whatsapp_phone, templateName, templateLang, bodyParams,
      { phoneNumberId: getProspectingPhoneNumberId() },
    );

    if (res.success) {
      await markIntro(lead.id, { status: 'sent', wamid: res.messageId });
      await storeMessage({
        leadId: lead.id, direcao: 'out', wamid: res.messageId || null,
        tipo: 'template', corpo: `[template:${templateName}]`,
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

module.exports = { dispatchIntros, isDryRun };
