'use strict';

// Live test on 2026-11-12, 16:26 in São Paulo (Thursday): a guest asked the
// Trattoria E2E Teste agent for "tomorrow, Friday 13 November". The agent had
// never been told today's date, sent 2023-11-14, got "in the past" back, tried
// other days of 2023, and the guest left without a booking.
// Two fixes: the prompt states today's date (ElevenLabs fills it in), and a
// date refusal names today in the restaurant's zone so the agent can recover.

jest.mock('../_lib/secure-logger', () => ({
  createSecureLogger: () => ({ info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn() }),
}));
jest.mock('../_lib/supabase', () => ({ getReservations: jest.fn(), canAccommodateParty: jest.fn() }));
jest.mock('../_lib/db/tables', () => ({ getAllTables: jest.fn() }));

const { restaurantTodayHint } = require('../_lib/timezone');
const { validateReservation } = require('../_lib/reservation-validator');
const { checkAvailability } = require('../_lib/tool-handlers');
const { buildPersonaPrompt } = require('../_lib/persona-prompt-builder');

const LIVE_TEST = new Date('2026-11-12T19:26:00Z');
const trattoria = {
  id: 'ecac1531', restaurant_name: 'Trattoria E2E Teste', timezone: 'America/Sao_Paulo', agent_language: 'pt',
  business_hours: Object.fromEntries(['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']
    .map(day => [day, { is_open: true, open_time: '12:00', close_time: '23:00' }])),
};

afterEach(() => { jest.useRealTimers(); });

describe('restaurantTodayHint', () => {
  test('names the weekday, date and time in the restaurant zone', () => {
    expect(restaurantTodayHint('America/Sao_Paulo', LIVE_TEST))
      .toBe('Today at the restaurant is Thursday, 2026-11-12, 16:26 (America/Sao_Paulo). '
        + 'A date said without a year is the next such date from today. Always send the full year.');
  });

  test('uses the restaurant day, not the UTC day, near midnight', () => {
    // 02:30 UTC on the 13th is still 23:30 on Thursday the 12th in São Paulo.
    expect(restaurantTodayHint('America/Sao_Paulo', new Date('2026-11-13T02:30:00Z'))).toMatch(/Thursday, 2026-11-12, 23:30/);
    expect(restaurantTodayHint('Europe/Rome', new Date('2026-11-12T23:30:00Z'))).toMatch(/Friday, 2026-11-13, 00:30/);
  });

  test('an invalid or missing zone falls back to UTC instead of throwing', () => {
    expect(restaurantTodayHint('Mars/Olympus', LIVE_TEST)).toMatch(/Thursday, 2026-11-12, 19:26 \(UTC\)/);
    expect(restaurantTodayHint(undefined, LIVE_TEST)).toMatch(/\(UTC\)/);
  });
});

describe('date refusals name today', () => {
  beforeEach(() => { jest.useFakeTimers({ now: LIVE_TEST }); });

  test('create: the guessed 2023 date is refused with today in São Paulo', () => {
    const result = validateReservation({ date: '2023-11-14', time: '19:30', party_size: 2 }, trattoria);
    expect(result.errors[0].code).toBe('PAST_DATE');
    expect(result.message).toMatch(/^The requested date and time is in the past\. Today at the restaurant is Thursday, 2026-11-12, 16:26/);
  });

  test('create: a date beyond the booking window also names today', () => {
    const result = validateReservation({ date: '2027-11-13', time: '19:30', party_size: 2 }, trattoria);
    expect(result.errors.map(error => error.code)).toContain('TOO_FAR');
    expect(result.errors.find(error => error.code === 'TOO_FAR').message).toMatch(/Today at the restaurant is Thursday, 2026-11-12/);
  });

  test('availability: the guessed 2023 date is refused with today in São Paulo', async () => {
    const result = await checkAvailability(trattoria.id, trattoria, { date: '2023-11-13', time: '19:30', party_size: 2 });
    expect(result).toMatchObject({ success: false, available: false, error: 'PAST_DATE' });
    expect(result.message).toMatch(/Today at the restaurant is Thursday, 2026-11-12, 16:26 \(America\/Sao_Paulo\)/);
  });
});

describe('the ElevenLabs prompt states the date', () => {
  test('a voice prompt carries the date variables and the date rules', () => {
    const prompt = buildPersonaPrompt(trattoria, { channel: 'voice' });
    expect(prompt).toContain('Today is {{system__time_date}} in the restaurant\'s time zone ({{system__timezone}})');
    expect(prompt).toContain('Never guess the year');
    expect(prompt.indexOf('Current date:')).toBeLessThan(prompt.indexOf('Available tools:'));
  });

  test('the tool lines match what the tools do since the audit', () => {
    const prompt = buildPersonaPrompt(trattoria, { channel: 'voice' });
    expect(prompt).toContain('lookup_reservation: Find an existing booking. Needs the complete confirmation code');
    expect(prompt).toContain('Changes and cancellations are not done by phone');
    expect(prompt).not.toMatch(/by phone, name, or ID/);
  });

  test('our own voice server (no channel) never gets ElevenLabs placeholders', () => {
    expect(buildPersonaPrompt(trattoria, { language: 'pt' })).not.toContain('{{system__');
  });

  test('an owner override on ElevenLabs still gets the date section', () => {
    const prompt = buildPersonaPrompt({ ...trattoria, persona_prompt_override: 'Custom persona.' }, { channel: 'voice' });
    expect(prompt.startsWith('Custom persona.')).toBe(true);
    expect(prompt).toContain('{{system__time_date}}');
    expect(buildPersonaPrompt({ ...trattoria, persona_prompt_override: 'Custom persona.' })).toBe('Custom persona.');
  });
});
