'use strict';

const { inboundIdentity, lockKey, resolveReceiver, demoConversationId } = require('../_lib/channels/receiver-identity');
const { WAHAAdapter } = require('../_lib/channels/waha-adapter');

const A = { id: 'restaurant-a', restaurant_name: 'A', whatsapp_phone_number_id: '11111111111', language: 'pt' };
const B = { id: 'restaurant-b', restaurant_name: 'B', whatsapp_phone_number_id: '22222222222', language: 'en' };
const guest = '15550001111';

describe('verified receiving account', () => {
  test('same guest A → B → A has three distinct account keys but returns to A history', () => {
    const a = inboundIdentity('meta', A.whatsapp_phone_number_id, guest);
    const b = inboundIdentity('meta', B.whatsapp_phone_number_id, guest);
    const aAgain = inboundIdentity('meta', A.whatsapp_phone_number_id, guest);
    expect(lockKey(a)).toBe(lockKey(aAgain));
    expect(lockKey(a)).not.toBe(lockKey(b));
    expect(resolveReceiver(a, [A, B]).restaurant.id).toBe(A.id);
    expect(resolveReceiver(b, [A, B]).restaurant.id).toBe(B.id);
    expect(resolveReceiver(aAgain, [A, B]).restaurant.id).toBe(A.id);
  });

  test('unknown, ambiguous, or malformed receivers fail closed', () => {
    expect(resolveReceiver(inboundIdentity('meta', '33333333333', guest), [A, B], {})).toBeNull();
    expect(resolveReceiver(inboundIdentity('meta', A.whatsapp_phone_number_id, guest), [A, { ...B, whatsapp_phone_number_id: A.whatsapp_phone_number_id }])).toBeNull();
    expect(inboundIdentity('meta', 'invalid-id', guest)).toBeNull();
    expect(inboundIdentity('twilio', null, guest)).toBeNull();
  });

  test('shared Meta number never offers dedicated-number restaurants', () => {
    const C = { id: 'restaurant-c', restaurant_name: 'C', whatsapp_phone_number_id: null };
    const route = resolveReceiver(inboundIdentity('meta', '99999999999', guest), [A, B, C],
      { WHATSAPP_PHONE_NUMBER_ID: '99999999999' });
    expect(route.restaurant.id).toBe(C.id);
    expect(resolveReceiver(inboundIdentity('meta', '99999999999', guest), [A, B],
      { WHATSAPP_PHONE_NUMBER_ID: '99999999999' })).toBeNull();
  });

  test('shared-number demo stamp changes when its eligible restaurant group changes', () => {
    const ab = demoConversationId('demo-id', { picker: [A, B] });
    expect(ab).toBe(demoConversationId('demo-id', { picker: [B, A] }));
    expect(ab).not.toBe(demoConversationId('demo-id', { picker: [
      { id: 'restaurant-c' }, { id: 'restaurant-d' },
    ] }));
  });

  test('providers cannot claim each other’s receiver; Twilio and WAHA require explicit mapping', () => {
    const twilio = { id: 'twilio-house', whatsapp_phone_number_id: null, whatsapp_provider: 'twilio' };
    const waha = { id: 'waha-house', whatsapp_phone_number_id: null, whatsapp_provider: 'waha' };
    const env = { WHATSAPP_PHONE_NUMBER_ID: '99999999999', TWILIO_WHATSAPP_NUMBER: '+15551234567',
      TWILIO_RESTAURANT_ID: twilio.id, WAHA_SESSION: 'seatable', WAHA_RESTAURANT_ID: waha.id };
    expect(resolveReceiver(inboundIdentity('twilio', 'whatsapp:+15551234567', guest), [A, B, twilio, waha], env).restaurant.id).toBe(twilio.id);
    expect(resolveReceiver(inboundIdentity('twilio', 'whatsapp:+15551234568', guest), [A, B, twilio, waha], env)).toBeNull();
    expect(resolveReceiver(inboundIdentity('waha', 'seatable', guest), [A, B, twilio, waha], env).restaurant.id).toBe(waha.id);
    expect(resolveReceiver(inboundIdentity('waha', 'other', guest), [A, B, twilio, waha], env)).toBeNull();
    expect(resolveReceiver(inboundIdentity('meta', '99999999999', guest), [A, B, twilio, waha], env)).toBeNull();
  });

  test('WAHA rejects unsigned traffic and never sends from an unbound session', async () => {
    const savedKey = process.env.WAHA_API_KEY;
    const savedSession = process.env.WAHA_SESSION;
    delete process.env.WAHA_API_KEY;
    process.env.WAHA_SESSION = 'seatable';
    try {
      const channel = new WAHAAdapter({ testMode: true });
      expect(await channel.verifySignature({ headers: {} })).toBe(false);
      expect(await channel.sendMessage('+15550001111', 'test'))
        .toEqual(expect.objectContaining({ success: false }));
      expect(await channel.sendMessage('+15550001111', 'test', { receiver: 'seatable' }))
        .toEqual(expect.objectContaining({ success: true, testMode: true }));
    } finally {
      if (savedKey === undefined) delete process.env.WAHA_API_KEY;
      else process.env.WAHA_API_KEY = savedKey;
      if (savedSession === undefined) delete process.env.WAHA_SESSION;
      else process.env.WAHA_SESSION = savedSession;
    }
  });
});
