/**
 * Phase 8 — platform mechanics (pure logic).
 *
 * Guards: rank-monotonic delivery-receipt advancement (F3), intent enum
 * validation (F1), multi-touch delay constants (F4). No network.
 */

jest.mock('../_lib/secure-logger', () => ({
  createSecureLogger: jest.fn(() => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() })),
}));

const { shouldAdvanceStatus, STATUS_RANK } = require('../_lib/prospecting/prospect-receipts');
const { parseIntentText, INTENTS } = require('../_lib/prospecting/prospect-reflect');
const { TOUCH2_DELAY_MS, TOUCH3_DELAY_MS } = require('../_lib/prospecting/sequencer');

// ============================================================ F3 receipts
describe('shouldAdvanceStatus — rank-monotonic, out-of-order-safe', () => {
  test('advances forward through the ladder', () => {
    expect(shouldAdvanceStatus(null, 'sent')).toBe(true);
    expect(shouldAdvanceStatus('sent', 'delivered')).toBe(true);
    expect(shouldAdvanceStatus('delivered', 'read')).toBe(true);
  });

  test('never regresses (webhooks arrive out of order)', () => {
    expect(shouldAdvanceStatus('read', 'delivered')).toBe(false);
    expect(shouldAdvanceStatus('delivered', 'sent')).toBe(false);
    expect(shouldAdvanceStatus('read', 'sent')).toBe(false);
  });

  test('failed only lands before delivery proof', () => {
    expect(shouldAdvanceStatus(null, 'failed')).toBe(true);
    expect(shouldAdvanceStatus('sent', 'failed')).toBe(true);
    expect(shouldAdvanceStatus('delivered', 'failed')).toBe(false);
    expect(shouldAdvanceStatus('read', 'failed')).toBe(false);
  });

  test('unknown statuses are ignored', () => {
    expect(shouldAdvanceStatus('sent', 'exploded')).toBe(false);
    expect(shouldAdvanceStatus(null, undefined)).toBe(false);
  });

  test('rank table covers exactly the Meta status set', () => {
    expect(Object.keys(STATUS_RANK).sort()).toEqual(['delivered', 'failed', 'read', 'sent']);
  });
});

// ============================================================ F1 intent
describe('parseIntentText — enum-validated triage labels', () => {
  test('accepts every enum value', () => {
    for (const i of INTENTS) {
      expect(parseIntentText(`{"intent":"${i}"}`)).toBe(i);
    }
  });

  test('normalizes case/whitespace', () => {
    expect(parseIntentText('{"intent":" Interessado "}')).toBe('interessado');
  });

  test('rejects out-of-enum inventions (anti-hallucination)', () => {
    expect(parseIntentText('{"intent":"muito_animado"}')).toBeNull();
    expect(parseIntentText('{"intent":42}')).toBeNull();
    expect(parseIntentText('sem json')).toBeNull();
    expect(parseIntentText('')).toBeNull();
  });

  test('tolerates markdown fences and surrounding prose', () => {
    expect(parseIntentText('claro:\n```json\n{"intent":"quer_humano","email":"x@y.com"}\n```')).toBe('quer_humano');
  });

  test('the enum matches the triage spec exactly', () => {
    expect(INTENTS).toEqual([
      'interessado', 'pergunta', 'objecao_preco', 'nao_interessado',
      'pessoa_errada', 'remarcar', 'quer_humano', 'outro',
    ]);
  });
});

// ============================================================ F4 multi-touch
describe('multi-touch cadence constants', () => {
  test('bump at D+3, breakup at D+8 total', () => {
    expect(TOUCH2_DELAY_MS).toBe(3 * 24 * 60 * 60 * 1000);
    expect(TOUCH2_DELAY_MS + TOUCH3_DELAY_MS).toBe(8 * 24 * 60 * 60 * 1000);
  });
});
