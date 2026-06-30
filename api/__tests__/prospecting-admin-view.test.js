'use strict';

/**
 * Phase 5 — cockpit status-bucket tests. The bucket is the HONEST funnel label
 * shown in the cockpit: conversation state wins over the raw send ladder, so a
 * lead that merely got "delivered" is never shown as "replied".
 */

const { statusBucket, bucketCounts, BUCKETS } = require('../_lib/prospecting/prospect-admin-view');

describe('statusBucket — conversation state wins over send status', () => {
  it('terminal/active states override the send ladder', () => {
    expect(statusBucket({ prospect_state: 'agendado', whatsapp_send_status: 'sent' })).toBe('booked');
    expect(statusBucket({ prospect_state: 'optout', whatsapp_send_status: 'replied' })).toBe('optout');
    expect(statusBucket({ prospect_state: 'handoff', whatsapp_send_status: 'read' })).toBe('handoff');
    expect(statusBucket({ prospect_state: 'agendando', whatsapp_send_status: 'sent' })).toBe('scheduling');
  });

  it('maps the send ladder honestly when state is not terminal/active', () => {
    expect(statusBucket({ prospect_state: 'conversando', whatsapp_send_status: 'replied' })).toBe('replied');
    expect(statusBucket({ prospect_state: 'conversando', whatsapp_send_status: 'read' })).toBe('seen');
    expect(statusBucket({ prospect_state: 'aguardando', whatsapp_send_status: 'delivered' })).toBe('sent');
    expect(statusBucket({ prospect_state: 'aguardando', whatsapp_send_status: 'queued' })).toBe('sent');
    expect(statusBucket({ prospect_state: 'aguardando', whatsapp_send_status: 'failed' })).toBe('failed');
    expect(statusBucket({ prospect_state: 'aguardando', whatsapp_send_status: null })).toBe('pending');
    expect(statusBucket({})).toBe('pending');
  });
});

describe('bucketCounts', () => {
  it('counts each bucket and zero-fills the rest', () => {
    const leads = [
      { prospect_state: 'agendado' },
      { prospect_state: 'conversando', whatsapp_send_status: 'replied' },
      { prospect_state: 'conversando', whatsapp_send_status: 'replied' },
      { prospect_state: 'aguardando', whatsapp_send_status: 'failed' },
    ];
    const c = bucketCounts(leads);
    expect(c.booked).toBe(1);
    expect(c.replied).toBe(2);
    expect(c.failed).toBe(1);
    expect(c.pending).toBe(0);
    // every known bucket is present (zero-filled)
    for (const b of BUCKETS) expect(typeof c[b]).toBe('number');
  });
});
