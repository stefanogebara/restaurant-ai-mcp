/**
 * Phase 0 — prospecting routing, phone matching, and sender number override.
 *
 * These are the load-bearing guards for keeping cold-outreach traffic isolated:
 *  - the webhook fork must fire ONLY for the dedicated prospecting number, and
 *    must be completely inert until that number is configured (so restaurant
 *    routing is never affected); and
 *  - prospecting sends must go out from the prospecting number id, not the
 *    customer-facing reservation number.
 */

jest.mock('../_lib/secure-logger', () => ({
  createSecureLogger: jest.fn(() => ({
    info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn(),
  })),
}));

const { isProspectingNumber, phoneNumberIdFromBody, getProspectingPhoneNumberId } =
  require('../_lib/prospecting/routing');
const { brCandidates, samePhone, onlyDigits } = require('../_lib/prospecting/phone');

afterEach(() => {
  delete process.env.PROSPECTING_PHONE_NUMBER_ID;
});

// ============================================================
// routing.isProspectingNumber
// ============================================================
describe('isProspectingNumber', () => {
  test('false when PROSPECTING_PHONE_NUMBER_ID is unset (fork inert)', () => {
    expect(isProspectingNumber('123456789')).toBe(false);
    expect(getProspectingPhoneNumberId()).toBeUndefined();
  });

  test('true only for the configured prospecting number', () => {
    process.env.PROSPECTING_PHONE_NUMBER_ID = 'prospect-num-1';
    expect(isProspectingNumber('prospect-num-1')).toBe(true);
    expect(isProspectingNumber('restaurant-num-9')).toBe(false);
  });

  test('false for null/undefined incoming id even when configured', () => {
    process.env.PROSPECTING_PHONE_NUMBER_ID = 'prospect-num-1';
    expect(isProspectingNumber(null)).toBe(false);
    expect(isProspectingNumber(undefined)).toBe(false);
  });

  test('compares as strings (number vs string id)', () => {
    process.env.PROSPECTING_PHONE_NUMBER_ID = '999';
    expect(isProspectingNumber(999)).toBe(true);
  });
});

describe('phoneNumberIdFromBody', () => {
  test('extracts phone_number_id from a Meta webhook body', () => {
    const body = { entry: [{ changes: [{ value: { metadata: { phone_number_id: 'abc' } } }] }] };
    expect(phoneNumberIdFromBody(body)).toBe('abc');
  });
  test('returns null for malformed/empty bodies', () => {
    expect(phoneNumberIdFromBody({})).toBeNull();
    expect(phoneNumberIdFromBody(null)).toBeNull();
    expect(phoneNumberIdFromBody({ entry: [{}] })).toBeNull();
  });
});

// ============================================================
// phone — BR 9th-digit / country-code matching
// ============================================================
describe('phone matching', () => {
  test('onlyDigits strips formatting', () => {
    expect(onlyDigits('+55 (11) 99999-9999')).toBe('5511999999999');
  });

  test('samePhone matches across the 9th-digit variation', () => {
    // stored with 9th digit vs inbound without it (same line)
    expect(samePhone('+5511999998888', '551199998888')).toBe(true);
    expect(samePhone('5511999998888', '+55 11 9999-8888')).toBe(true);
  });

  test('samePhone matches with/without country code', () => {
    expect(samePhone('+5511999998888', '11999998888')).toBe(true);
  });

  test('samePhone rejects clearly different numbers', () => {
    expect(samePhone('+5511999998888', '+5511777776666')).toBe(false);
  });

  test('brCandidates includes the country-coded and bare forms', () => {
    const c = brCandidates('+5511999998888');
    expect(c.has('5511999998888')).toBe(true);
  });
});

// ============================================================
// sender — phone_number_id override targets the prospecting number
// ============================================================
describe('sender phone_number_id override', () => {
  const originalFetch = global.fetch;
  beforeEach(() => {
    process.env.WHATSAPP_PHONE_NUMBER_ID = 'restaurant-num';
    process.env.WHATSAPP_ACCESS_TOKEN = 'tok';
    global.fetch = jest.fn().mockResolvedValue({
      ok: true, status: 200, json: async () => ({ messages: [{ id: 'm1' }] }),
    });
  });
  afterEach(() => {
    global.fetch = originalFetch;
    delete process.env.WHATSAPP_PHONE_NUMBER_ID;
    delete process.env.WHATSAPP_ACCESS_TOKEN;
    jest.resetModules();
  });

  test('sendWhatsAppMessage defaults to the reservation number', async () => {
    const { sendWhatsAppMessage } = require('../_lib/whatsapp-sender');
    await sendWhatsAppMessage('+5511999998888', 'hi');
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('restaurant-num/messages'),
      expect.any(Object),
    );
  });

  test('sendWhatsAppMessage uses the override number id', async () => {
    const { sendWhatsAppMessage } = require('../_lib/whatsapp-sender');
    await sendWhatsAppMessage('+5511999998888', 'hi', { phoneNumberId: 'prospect-num' });
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('prospect-num/messages'),
      expect.any(Object),
    );
  });

  test('sendTemplateMessage uses the override number id', async () => {
    const { sendTemplateMessage } = require('../_lib/whatsapp-sender');
    await sendTemplateMessage('+5511999998888', 'tpl', 'pt', ['x'], { phoneNumberId: 'prospect-num' });
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('prospect-num/messages'),
      expect.any(Object),
    );
  });
});
