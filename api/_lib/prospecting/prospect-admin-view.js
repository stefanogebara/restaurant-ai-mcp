'use strict';

/**
 * Pure view helpers for the internal prospecting cockpit (Phase 5). No I/O.
 * Derives the HONEST status bucket of a lead (the plan's replied/seen/sent/failed,
 * plus the terminal states) from its conversation state + WhatsApp send status —
 * so the cockpit never over-claims (e.g. "sent" is not "replied").
 */

/**
 * Single honest status bucket for a lead. Conversation state wins over raw send
 * status (a booked/opted-out lead is that, regardless of the last send ladder).
 * @param {{prospect_state?: string, whatsapp_send_status?: string|null}} lead
 * @returns {'won'|'booked'|'optout'|'handoff'|'scheduling'|'replied'|'seen'|'sent'|'failed'|'pending'}
 */
function statusBucket(lead) {
  const state = lead && lead.prospect_state;
  // 'ganho' outranks everything: a closed customer is not "booked" or "handoff",
  // and the funnel should never show a win as an open conversation.
  if (state === 'ganho') return 'won';
  if (state === 'agendado') return 'booked';
  if (state === 'optout') return 'optout';
  if (state === 'handoff') return 'handoff';
  if (state === 'agendando') return 'scheduling';

  switch (lead && lead.whatsapp_send_status) {
    case 'replied': return 'replied';
    case 'read': return 'seen';
    case 'delivered':
    case 'sent':
    case 'queued': return 'sent';
    case 'failed':
    case 'invalid': return 'failed';
    default: return 'pending';
  }
}

const BUCKETS = ['pending', 'sent', 'seen', 'replied', 'scheduling', 'booked', 'won', 'handoff', 'optout', 'failed'];

/**
 * Count leads per bucket (funnel summary for the cockpit header).
 * @param {Array<object>} leads
 * @returns {Record<string, number>}
 */
function bucketCounts(leads) {
  const counts = {};
  for (const b of BUCKETS) counts[b] = 0;
  for (const lead of leads || []) {
    const b = statusBucket(lead);
    counts[b] = (counts[b] || 0) + 1;
  }
  return counts;
}

module.exports = { statusBucket, bucketCounts, BUCKETS };
